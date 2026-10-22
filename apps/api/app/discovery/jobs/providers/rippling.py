"""Rippling ATS public job board API: ats.rippling.com/api/v2/board/{slug}/jobs

Public and keyless — the same endpoint a Rippling-hosted board (`ats.rippling.com/{slug}`)
calls itself. The list is paged (20 per page) and carries no date or description, so those
come from one detail call per posting, made only for titles already in discovery's role
scope and capped / time-boxed like Workday and SmartRecruiters.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.discovery.jobs import filters, salary
from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_json, text_or_none

LIST_API = "https://ats.rippling.com/api/v2/board/{token}/jobs"
DETAIL_API = "https://ats.rippling.com/api/v2/board/{token}/jobs/{job_id}"
MAX_PAGES = 10
DETAIL_LIMIT = 25
DETAIL_SECONDS = 20.0


def _locations(job: dict[str, Any]) -> tuple[list[str], str | None, bool]:
    names: list[str] = []
    country_code: str | None = None
    remote = False
    for loc in as_list(job.get("locations")):
        loc = as_dict(loc)
        name = text_or_none(loc.get("name"))
        if not name:
            name = ", ".join(
                p for p in (text_or_none(loc.get("city")), text_or_none(loc.get("state")), text_or_none(loc.get("country"))) if p
            ) or None
        if name:
            names.append(name)
        country_code = country_code or text_or_none(loc.get("countryCode"))
        if str(loc.get("workplaceType") or "").upper() == "REMOTE":
            remote = True
    return names, country_code, remote


def parse_list(payload: Any, target: SourceTarget) -> list[RawPosting]:
    out: list[RawPosting] = []
    for job in as_list(as_dict(payload).get("items")):
        job = as_dict(job)
        job_id = text_or_none(job.get("id")) or text_or_none(job.get("uuid"))
        title = text_or_none(job.get("name"))
        if not job_id or not title:
            continue
        locations, country_code, remote = _locations(job)
        out.append(
            RawPosting(
                external_id=f"{target.token}:{job_id}",
                title=title,
                company_name=target.company_name,
                url=text_or_none(job.get("url")) or f"https://ats.rippling.com/{target.token}/jobs/{job_id}",
                locations=locations,
                country_code=country_code,
                remote=remote,
                # The list has no description; the detail call fills it for in-scope roles.
                hash_description=False,
            )
        )
    return out


def _description(value: Any) -> str:
    """`description` is `{company: html, role: html}` (either part may be missing)."""
    if isinstance(value, dict):
        return "\n\n".join(str(v) for k, v in value.items() if v and k in ("role", "company"))
    return str(value or "")


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _pay(details: Any) -> salary.SalaryInfo | None:
    """`payRangeDetails`: [{currency, payRangeLowerBound, payRangeUpperBound, payFrequency}]."""
    for entry in as_list(details):
        entry = as_dict(entry)
        currency = str(entry.get("currency") or "").upper() or None
        text = salary.format_range(
            _num(entry.get("payRangeLowerBound") or entry.get("lowerBound")),
            _num(entry.get("payRangeUpperBound") or entry.get("upperBound")),
            currency,
            entry.get("payFrequency") or entry.get("frequency"),
        )
        if text:
            return salary.SalaryInfo(text, currency)
    return None


def apply_detail(posting: RawPosting, payload: Any) -> None:
    job = as_dict(payload)
    if not job:
        return
    description = _description(job.get("description"))
    if description:
        posting.description = description
        posting.hash_description = True
    posting.posted_at = job.get("createdOn") or posting.posted_at
    posting.employment_type = text_or_none(as_dict(job.get("employmentType")).get("id")) or posting.employment_type
    locations = [l for l in (text_or_none(x) for x in as_list(job.get("workLocations"))) if l]
    if locations:
        posting.locations = locations
    company = text_or_none(job.get("companyName"))
    if company:
        posting.company_name = company
    posting.salary = posting.salary or _pay(job.get("payRangeDetails"))


class RipplingProvider:
    key = "rippling"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        postings: list[RawPosting] = []
        complete = True
        for page in range(1, MAX_PAGES + 1):
            payload = get_json(client, LIST_API.format(token=target.token), params={"page": page})
            if not isinstance(payload, dict) or "items" not in payload:
                raise ProviderError("Unexpected Rippling payload.")
            postings.extend(parse_list(payload, target))
            total_pages = int(as_dict(payload).get("totalPages") or 1)
            if page >= total_pages:
                break
        else:
            # More pages than the cap: missing postings must not be treated as closed.
            complete = False

        deadline = time.monotonic() + DETAIL_SECONDS
        wanted = [
            p for p in postings
            if filters.is_engineering_title(p.title) and not filters.is_executive_title(p.title)
        ]
        for posting in wanted[:DETAIL_LIMIT]:
            if time.monotonic() > deadline:
                break
            job_id = posting.external_id.rsplit(":", 1)[-1]
            try:
                response = client.get(DETAIL_API.format(token=target.token, job_id=job_id))
                if response.status_code == 200:
                    apply_detail(posting, response.json())
            except (httpx.HTTPError, ValueError):
                continue  # keep the list-level posting; title rules still apply
        return FetchResult(postings, complete=complete)
