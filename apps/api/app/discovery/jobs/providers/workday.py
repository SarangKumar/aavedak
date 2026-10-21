"""Workday career sites ({tenant}.wdN.myworkdayjobs.com/{site}).

Reads the JSON the public career site itself loads (`/wday/cxs/{tenant}/{site}/jobs`, no
auth). Used only when a company's own careers page is a Workday site or embeds one; the
token is `tenant.wdN/site`. Lists are paged (20 per request, capped); descriptions need
one request per posting, so they are fetched only for postings whose title is in
discovery's role scope (capped and time-boxed, like SmartRecruiters).
"""

from __future__ import annotations

import re
import time
from typing import Any

import httpx

from app.discovery.jobs import filters
from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, text_or_none

PAGE_SIZE = 20
MAX_PAGES = 5
DETAIL_LIMIT = 15
DETAIL_SECONDS = 20.0
_TOKEN_RE = re.compile(r"^([a-z0-9-]+)\.(wd\d{1,2})/([A-Za-z0-9_-]+)$")


def split_token(token: str) -> tuple[str, str, str]:
    match = _TOKEN_RE.match(token)
    if not match:
        raise ProviderError(f"Not a Workday site token: {token}", retryable=False)
    return match.group(1), match.group(2), match.group(3)


def site_base(token: str) -> str:
    tenant, wd, site = split_token(token)
    return f"https://{tenant}.{wd}.myworkdayjobs.com/{site}"


def api_base(token: str) -> str:
    tenant, wd, site = split_token(token)
    return f"https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}"


def parse_list(payload: Any, target: SourceTarget) -> list[RawPosting]:
    from app.discovery.jobs.careers_crawl import relative_posted

    out: list[RawPosting] = []
    base = site_base(target.token)
    for job in as_list(as_dict(payload).get("jobPostings")):
        job = as_dict(job)
        title = text_or_none(job.get("title"))
        path = text_or_none(job.get("externalPath"))
        if not title or not path:
            continue
        location = text_or_none(job.get("locationsText"))
        # "3 Locations" is a count, not a place; the detail call gives the real ones.
        locations = [location] if location and not re.match(r"^\d+\s+locations?$", location, re.I) else []
        out.append(
            RawPosting(
                external_id=f"{target.token}:{path}",
                title=title,
                company_name=target.company_name,
                url=f"{base}{path}",
                locations=locations,
                posted_at=relative_posted(text_or_none(job.get("postedOn"))),
                remote="remote" in (location or "").lower(),
            )
        )
    return out


def apply_detail(posting: RawPosting, payload: Any) -> None:
    info = as_dict(as_dict(payload).get("jobPostingInfo"))
    if not info:
        return
    posting.description = info.get("jobDescription") or posting.description
    locations = [text_or_none(info.get("location"))] + [text_or_none(l) for l in as_list(info.get("additionalLocations"))]
    country = text_or_none(as_dict(info.get("country")).get("descriptor"))
    locations = [l for l in locations if l]
    if locations:
        posting.locations = [f"{l}, {country}" if country and country.lower() not in l.lower() else l for l in locations]
    elif country:
        posting.locations = [country]
    posting.country_code = posting.country_code or country
    posting.posted_at = info.get("startDate") or posting.posted_at
    posting.employment_type = text_or_none(info.get("timeType")) or posting.employment_type
    external = text_or_none(info.get("externalUrl"))
    if external:
        posting.url = external


class WorkdayProvider:
    key = "workday"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        api = api_base(target.token)
        postings: list[RawPosting] = []
        complete = True
        total = 0
        for page in range(MAX_PAGES):
            try:
                res = client.post(
                    f"{api}/jobs",
                    json={"appliedFacets": {}, "limit": PAGE_SIZE, "offset": page * PAGE_SIZE, "searchText": ""},
                    headers={"Accept": "application/json", "Content-Type": "application/json"},
                )
            except httpx.HTTPError as exc:
                raise ProviderError(f"Request failed: {exc.__class__.__name__}") from exc
            if res.status_code == 404:
                raise ProviderError("Workday site not found (404).", retryable=False)
            if res.status_code >= 400:
                raise ProviderError(f"HTTP {res.status_code}.")
            try:
                payload = res.json()
            except ValueError as exc:
                raise ProviderError("Response was not JSON.") from exc
            if page == 0:
                total = int(as_dict(payload).get("total") or 0)
            batch = parse_list(payload, target)
            postings.extend(batch)
            if len(batch) < PAGE_SIZE or len(postings) >= total:
                break
        else:
            complete = len(postings) >= total

        deadline = time.monotonic() + DETAIL_SECONDS
        wanted = [p for p in postings if filters.is_engineering_title(p.title) and not filters.is_executive_title(p.title)]
        for posting in wanted[:DETAIL_LIMIT]:
            if time.monotonic() > deadline:
                break
            path = posting.external_id.split(":", 1)[1]
            try:
                res = client.get(f"{api}{path}", headers={"Accept": "application/json"})
                if res.status_code == 200:
                    apply_detail(posting, res.json())
            except (httpx.HTTPError, ValueError):
                continue  # keep the list-level posting; filters fall back to title rules
        return FetchResult(postings, complete=complete)
