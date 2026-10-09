"""Workable public widget API: apply.workable.com/api/v1/widget/accounts/{subdomain}?details=true"""

from __future__ import annotations

from typing import Any

import httpx

from app.discovery.jobs.filters import normalize_seniority
from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_json, text_or_none

API = "https://apply.workable.com/api/v1/widget/accounts/{token}"


def parse(payload: Any, target: SourceTarget) -> list[RawPosting]:
    out: list[RawPosting] = []
    for job in as_list(as_dict(payload).get("jobs")):
        job = as_dict(job)
        code = text_or_none(job.get("shortcode"))
        title = text_or_none(job.get("title"))
        if not code or not title:
            continue
        locations = [", ".join(p for p in (job.get("city"), job.get("state"), job.get("country")) if p)]
        country_code = None
        for loc in as_list(job.get("locations")):
            loc = as_dict(loc)
            locations.append(", ".join(str(loc.get(k)) for k in ("city", "region", "country") if loc.get(k)))
            country_code = country_code or text_or_none(loc.get("countryCode"))
        out.append(
            RawPosting(
                external_id=f"{target.token}:{code}",
                title=title,
                company_name=target.company_name,
                url=text_or_none(job.get("url")) or text_or_none(job.get("shortlink")),
                locations=[loc for loc in locations if loc],
                country_code=country_code,
                description=job.get("description") or "",
                posted_at=job.get("published_on") or job.get("created_at"),
                employment_type=text_or_none(job.get("employment_type")),
                seniority_hint=normalize_seniority(text_or_none(job.get("experience"))),
                remote=bool(job.get("telecommuting")),
            )
        )
    return out


class WorkableProvider:
    key = "workable"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        payload = get_json(client, API.format(token=target.token), params={"details": "true"})
        if not isinstance(payload, dict) or "jobs" not in payload:
            raise ProviderError("Unexpected Workable payload.")
        return FetchResult(parse(payload, target))
