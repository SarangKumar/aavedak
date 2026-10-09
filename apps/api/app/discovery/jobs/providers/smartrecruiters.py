"""SmartRecruiters public Posting API: api.smartrecruiters.com/v1/companies/{id}/postings

The list endpoint has no description, so details are fetched only for new postings that
already pass the title/location filters — in parallel, capped in count and wall-clock time
per scan so one large board cannot overrun a tick. Already-known postings keep their stored
description; their content hash ignores the description. The posting URL is always the
stable `jobs.smartrecruiters.com/{company}/{id}` form so it never flips between scans.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import httpx

from app.discovery.config import get_settings
from app.discovery.jobs import filters
from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_json, text_or_none

LIST_API = "https://api.smartrecruiters.com/v1/companies/{token}/postings"
DETAIL_API = "https://api.smartrecruiters.com/v1/companies/{token}/postings/{id}"
PAGE_SIZE = 100
MAX_PAGES = 15
DETAIL_WORKERS = 8
DETAIL_SECONDS = 20.0


def parse_list(payload: Any, target: SourceTarget) -> list[RawPosting]:
    out: list[RawPosting] = []
    for job in as_list(as_dict(payload).get("content")):
        job = as_dict(job)
        job_id = text_or_none(job.get("id"))
        title = text_or_none(job.get("name"))
        if not job_id or not title:
            continue
        loc = as_dict(job.get("location"))
        location = text_or_none(loc.get("fullLocation")) or ", ".join(
            str(loc.get(k)) for k in ("city", "region", "country") if loc.get(k)
        )
        out.append(
            RawPosting(
                external_id=f"{target.token}:{job_id}",
                title=title,
                company_name=text_or_none(as_dict(job.get("company")).get("name")) or target.company_name,
                url=f"https://jobs.smartrecruiters.com/{target.token}/{job_id}",
                locations=[location] if location else [],
                country_code=text_or_none(loc.get("country")),
                posted_at=job.get("releasedDate"),
                employment_type=text_or_none(as_dict(job.get("typeOfEmployment")).get("label")),
                seniority_hint=filters.normalize_seniority(
                    text_or_none(as_dict(job.get("experienceLevel")).get("id"))
                ),
                remote=bool(loc.get("remote")),
                hash_description=False,
            )
        )
    return out


def parse_detail(payload: Any) -> str:
    """Description text from a posting detail."""
    sections = as_dict(as_dict(as_dict(payload).get("jobAd")).get("sections"))
    parts = []
    for key in ("jobDescription", "qualifications", "additionalInformation"):
        text = as_dict(sections.get(key)).get("text")
        if text:
            parts.append(str(text))
    return "\n\n".join(parts)


def _worth_details(posting: RawPosting) -> bool:
    title = posting.title
    return (
        filters.is_india(posting.locations, posting.country_code)
        and filters.is_engineering_title(title)
        and not filters.is_senior_title(title)
    )


class SmartRecruitersProvider:
    key = "smartrecruiters"

    def fetch(
        self, client: httpx.Client, target: SourceTarget, known_ids: frozenset[str] = frozenset()
    ) -> FetchResult:
        postings: list[RawPosting] = []
        complete = True
        for page in range(MAX_PAGES):
            payload = get_json(
                client,
                LIST_API.format(token=target.token),
                params={"limit": PAGE_SIZE, "offset": page * PAGE_SIZE, "country": "in"},
            )
            if not isinstance(payload, dict) or "content" not in payload:
                raise ProviderError("Unexpected SmartRecruiters payload.")
            batch = parse_list(payload, target)
            postings.extend(batch)
            total = int(payload.get("totalFound") or 0)
            if len(batch) < PAGE_SIZE or len(postings) >= total:
                break
        else:
            complete = False

        wanted = [
            p for p in postings if p.external_id not in known_ids and _worth_details(p)
        ][: get_settings().smartrecruiters_detail_limit]
        deadline = time.monotonic() + DETAIL_SECONDS

        def detail(posting: RawPosting) -> tuple[RawPosting, str | None]:
            if time.monotonic() > deadline:
                return posting, None
            job_id = posting.external_id.split(":", 1)[1]
            try:
                return posting, parse_detail(get_json(client, DETAIL_API.format(token=target.token, id=job_id)))
            except ProviderError:
                return posting, None  # keep the list-level posting; filters fall back to title rules

        if wanted:
            with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as pool:
                for future in as_completed([pool.submit(detail, p) for p in wanted]):
                    posting, text = future.result()
                    if text:
                        posting.description = text
        return FetchResult(postings, complete=complete)
