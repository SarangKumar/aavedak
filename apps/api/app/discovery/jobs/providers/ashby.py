"""Ashby public job board API: api.ashbyhq.com/posting-api/job-board/{name}"""

from __future__ import annotations

from typing import Any

import httpx

from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_json, text_or_none

API = "https://api.ashbyhq.com/posting-api/job-board/{token}"


def parse(payload: Any, target: SourceTarget) -> list[RawPosting]:
    out: list[RawPosting] = []
    for job in as_list(as_dict(payload).get("jobs")):
        job = as_dict(job)
        if job.get("isListed") is False:
            continue
        job_id = text_or_none(job.get("id"))
        title = text_or_none(job.get("title"))
        if not job_id or not title:
            continue
        locations = [text_or_none(job.get("location")) or ""]
        locations += [
            text_or_none(as_dict(sec).get("location")) or "" for sec in as_list(job.get("secondaryLocations"))
        ]
        postal = as_dict(as_dict(job.get("address")).get("postalAddress"))
        country = text_or_none(postal.get("addressCountry"))
        out.append(
            RawPosting(
                external_id=f"{target.token}:{job_id}",
                title=title,
                company_name=target.company_name,
                url=text_or_none(job.get("jobUrl")),
                locations=[loc for loc in locations if loc],
                country_code=country,
                description=job.get("descriptionPlain") or job.get("descriptionHtml") or "",
                posted_at=job.get("publishedAt"),
                employment_type=text_or_none(job.get("employmentType")),
                remote=bool(job.get("isRemote")),
            )
        )
    return out


class AshbyProvider:
    key = "ashby"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        payload = get_json(client, API.format(token=target.token))
        if not isinstance(payload, dict) or "jobs" not in payload:
            raise ProviderError("Unexpected Ashby payload.")
        return FetchResult(parse(payload, target))
