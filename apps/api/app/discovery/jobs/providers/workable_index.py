"""Workable's public cross-company job index: jobs.workable.com/api/v1/jobs

This is the one ATS index that is public and keyless: the API behind jobs.workable.com,
the board Workable itself publishes across all its customers who opt into it. Unlike every
other provider here it is not one company's board, so:

* the token is a query spec `"{location}:{query}"` (one registry row per spec, so each is
  its own bounded run item) — see `INDEX_TOKENS`;
* each posting carries its own company, so ingest creates/links the company per job;
* the result is never `complete`: it is a query view, not a company's full list, so it may
  never close a job.

It also feeds company discovery: every company in the index comes with its website, which
`jobs/company_discovery.py` turns into a candidate careers page / board.

robots.txt on jobs.workable.com disallows `/search`, `/profile*` and query-string search
URLs; `/api/*` is not disallowed. Paging is capped and the index rows are spread over the
scan shards, so the request rate stays low.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_json, text_or_none

API = "https://jobs.workable.com/api/v1/jobs"
PAGE_SIZE = 20
MAX_PAGES = 6

# One registry row per `location:query` spec. Locations are the two the product cares about
# (India and remote); the queries cover discovery's role scope broadly enough that the role
# filters, not the query, decide what is kept. Keep this list short: every entry is a run
# item on every scan.
INDEX_TOKENS: tuple[str, ...] = (
    "india:software engineer",
    "india:frontend developer",
    "india:backend developer",
    "india:data engineer",
    "india:machine learning",
    "india:devops",
    "india:qa engineer",
    "india:security engineer",
    "india:product designer",
    "india:support engineer",
    "remote:software engineer",
    "remote:data engineer",
)


def split_token(token: str) -> tuple[str, str]:
    """`"india:software engineer"` → `("india", "software engineer")`."""
    location, _, query = token.partition(":")
    location = location.strip()
    if not location:
        raise ProviderError(f"Not a Workable index token: {token}", retryable=False)
    return location, query.strip()


def _locations(job: dict[str, Any]) -> list[str]:
    location = as_dict(job.get("location"))
    parts = [
        text_or_none(location.get("city")),
        text_or_none(location.get("subregion")),
        text_or_none(location.get("countryName")),
    ]
    name = ", ".join(p for p in parts if p)
    names = [name] if name else []
    if not names:
        # Fall back to the flat list ("TELECOMMUTE", "India").
        names = [l for l in (text_or_none(x) for x in as_list(job.get("locations"))) if l and l != "TELECOMMUTE"]
    if str(job.get("workplace") or "").lower() == "remote":
        names = [f"Remote - {names[0]}" if names else "Remote"] + names[1:]
    return names


def _description(job: dict[str, Any]) -> str:
    return "\n\n".join(
        str(job.get(key) or "") for key in ("description", "requirementsSection", "benefitsSection")
    ).strip()


def parse(payload: Any, target: SourceTarget) -> list[RawPosting]:
    out: list[RawPosting] = []
    for job in as_list(as_dict(payload).get("jobs")):
        job = as_dict(job)
        job_id = text_or_none(job.get("id"))
        title = text_or_none(job.get("title"))
        url = text_or_none(job.get("url"))
        if not job_id or not title or not url:
            continue
        if str(job.get("state") or "published").lower() != "published":
            continue
        company = as_dict(job.get("company"))
        locations = _locations(job)
        out.append(
            RawPosting(
                # The posting id alone: the same job found through two index specs must be
                # one source ref, not two.
                external_id=f"workable-index:{job_id}",
                title=title,
                company_name=text_or_none(company.get("title")) or target.company_name,
                url=url,
                locations=locations,
                description=_description(job),
                posted_at=job.get("created"),
                employment_type=text_or_none(job.get("employmentType")),
                remote=str(job.get("workplace") or "").lower() == "remote",
            )
        )
    return out


def company_candidates(payload: Any) -> list[tuple[str, str | None]]:
    """(company name, website) pairs in one index page — the input for company discovery."""
    seen: dict[str, str | None] = {}
    for job in as_list(as_dict(payload).get("jobs")):
        company = as_dict(as_dict(job).get("company"))
        name = text_or_none(company.get("title"))
        if name and name not in seen:
            seen[name] = text_or_none(company.get("website"))
    return list(seen.items())


class WorkableIndexProvider:
    key = "workable_index"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        location, query = split_token(target.token)
        postings: list[RawPosting] = []
        hints: dict[str, str | None] = {}
        params: dict[str, Any] = {"location": location}
        if query:
            params["query"] = query
        for _ in range(MAX_PAGES):
            payload = get_json(client, API, params=params)
            if not isinstance(payload, dict) or "jobs" not in payload:
                raise ProviderError("Unexpected Workable index payload.")
            postings.extend(parse(payload, target))
            hints.update(company_candidates(payload))
            token = text_or_none(payload.get("nextPageToken"))
            if not token or len(as_list(payload.get("jobs"))) < PAGE_SIZE:
                break
            params = {**params, "pageToken": token}
        # A query view over many companies: it can never say a job is gone.
        return FetchResult(postings, complete=False, company_hints=list(hints.items()))
