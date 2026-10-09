"""Greenhouse Job Board API (public, no auth): boards-api.greenhouse.io/v1/boards/{token}/jobs"""

from __future__ import annotations

from typing import Any

import httpx

from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_json, text_or_none

API = "https://boards-api.greenhouse.io/v1/boards/{token}/jobs"


def parse(payload: Any, target: SourceTarget) -> list[RawPosting]:
    jobs = as_list(as_dict(payload).get("jobs"))
    out: list[RawPosting] = []
    for job in jobs:
        job = as_dict(job)
        job_id = text_or_none(job.get("id"))
        title = text_or_none(job.get("title"))
        if not job_id or not title:
            continue
        locations = [text_or_none(as_dict(job.get("location")).get("name")) or ""]
        for office in as_list(job.get("offices")):
            office_loc = text_or_none(as_dict(office).get("location")) or text_or_none(as_dict(office).get("name"))
            if office_loc:
                locations.append(office_loc)
        out.append(
            RawPosting(
                external_id=f"{target.token}:{job_id}",
                title=title,
                company_name=text_or_none(job.get("company_name")) or target.company_name,
                url=text_or_none(job.get("absolute_url")),
                locations=[loc for loc in locations if loc],
                description=job.get("content") or "",
                # `first_published` is the posting date; `updated_at` changes on any edit.
                posted_at=job.get("first_published"),
            )
        )
    return out


class GreenhouseProvider:
    key = "greenhouse"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        payload = get_json(client, API.format(token=target.token), params={"content": "true"})
        if not isinstance(payload, dict) or "jobs" not in payload:
            raise ProviderError("Unexpected Greenhouse payload.")
        return FetchResult(parse(payload, target))
