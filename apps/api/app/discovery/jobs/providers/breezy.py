"""Breezy HR public careers feed: {subdomain}.breezy.hr/json

Keyless, and the same data the company's Breezy careers portal renders. The feed carries
no description, so `hash_description` is False: an update is detected from the other fields
and an empty description never overwrites one another source supplied.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.discovery.jobs import salary
from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_json, text_or_none

API = "https://{token}.breezy.hr/json"


def _location(loc: dict[str, Any]) -> tuple[str | None, str | None, bool]:
    name = text_or_none(loc.get("name"))
    country = as_dict(loc.get("country"))
    if not name:
        name = ", ".join(
            p for p in (text_or_none(loc.get("city")), text_or_none(as_dict(loc.get("state")).get("name")),
                        text_or_none(country.get("name"))) if p
        ) or None
    return name, text_or_none(country.get("id")), bool(loc.get("is_remote"))


def parse(payload: Any, target: SourceTarget) -> list[RawPosting]:
    out: list[RawPosting] = []
    for job in as_list(payload):
        job = as_dict(job)
        job_id = text_or_none(job.get("id"))
        title = text_or_none(job.get("name"))
        if not job_id or not title:
            continue
        locations: list[str] = []
        country_code: str | None = None
        remote = False
        entries = as_list(job.get("locations")) or [job.get("location")]
        for entry in entries:
            name, code, is_remote = _location(as_dict(entry))
            if name:
                locations.append(name)
            country_code = country_code or code
            remote = remote or is_remote
        out.append(
            RawPosting(
                external_id=f"{target.token}:{job_id}",
                title=title,
                company_name=text_or_none(as_dict(job.get("company")).get("name")) or target.company_name,
                url=text_or_none(job.get("url")),
                locations=locations,
                country_code=country_code,
                posted_at=job.get("published_date") or job.get("creation_date"),
                employment_type=text_or_none(as_dict(job.get("type")).get("name")),
                seniority_hint=text_or_none(as_dict(job.get("experience")).get("name")),
                remote=remote,
                # Breezy's public feed has no description.
                description="",
                hash_description=False,
                # `salary` is free text the company typed ("$0.05 – $0.06 / hour").
                salary=salary.from_text(str(job.get("salary") or ""), require_label=False),
            )
        )
    return out


class BreezyProvider:
    key = "breezy"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        payload = get_json(client, API.format(token=target.token))
        if not isinstance(payload, list):
            raise ProviderError("Unexpected Breezy payload.")
        return FetchResult(parse(payload, target))
