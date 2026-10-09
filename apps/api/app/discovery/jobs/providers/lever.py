"""Lever Postings API (public): api.lever.co/v0/postings/{company}?mode=json"""

from __future__ import annotations

from typing import Any

import httpx

from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_json, text_or_none

API = "https://api.lever.co/v0/postings/{token}"


def _description(job: dict[str, Any]) -> str:
    parts = [job.get("descriptionPlain") or job.get("description") or ""]
    for section in as_list(job.get("lists")):
        section = as_dict(section)
        heading = text_or_none(section.get("text"))
        if heading:
            parts.append(heading)
        parts.append(section.get("content") or "")
    parts.append(job.get("additionalPlain") or job.get("additional") or "")
    return "\n\n".join(p for p in parts if p)


def parse(payload: Any, target: SourceTarget) -> list[RawPosting]:
    out: list[RawPosting] = []
    for job in as_list(payload):
        job = as_dict(job)
        job_id = text_or_none(job.get("id"))
        title = text_or_none(job.get("text"))
        if not job_id or not title:
            continue
        categories = as_dict(job.get("categories"))
        locations = [text_or_none(categories.get("location")) or ""]
        locations += [str(loc) for loc in as_list(categories.get("allLocations")) if loc]
        out.append(
            RawPosting(
                external_id=f"{target.token}:{job_id}",
                title=title,
                company_name=target.company_name,
                url=text_or_none(job.get("hostedUrl")),
                locations=[loc for loc in locations if loc],
                country_code=text_or_none(job.get("country")),
                description=_description(job),
                posted_at=job.get("createdAt"),  # epoch ms
                employment_type=text_or_none(categories.get("commitment")),
                remote=str(job.get("workplaceType") or "").lower() == "remote",
            )
        )
    return out


class LeverProvider:
    key = "lever"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        payload = get_json(client, API.format(token=target.token), params={"mode": "json"})
        if not isinstance(payload, list):
            raise ProviderError("Unexpected Lever payload.")
        return FetchResult(parse(payload, target))
