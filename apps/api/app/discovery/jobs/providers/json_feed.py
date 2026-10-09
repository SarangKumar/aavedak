"""Permitted JSON job feed (replaces the old web `JOBS_FEED_URL` ingest).

Registry `token` = the feed URL. Body: a job array or `{ "jobs": [...] }`. Each item needs
`title`, `company`, and `externalId` / `external_id` / `id`.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, get_json, text_or_none
from app.discovery.jobs.text import content_hash


def parse(payload: Any, target: SourceTarget) -> list[RawPosting]:
    items = payload if isinstance(payload, list) else as_dict(payload).get("jobs")
    if not isinstance(items, list):
        raise ProviderError("Feed must return an array or { jobs: [] }.")
    feed_key = content_hash({"u": target.token})[:10]
    out: list[RawPosting] = []
    for item in items:
        row = as_dict(item)
        title = text_or_none(row.get("title") or row.get("role"))
        company = text_or_none(row.get("company") or row.get("company_name"))
        ext = text_or_none(row.get("externalId") or row.get("external_id") or row.get("id"))
        if not title or not company or not ext:
            continue
        location = text_or_none(row.get("location"))
        out.append(
            RawPosting(
                external_id=f"{feed_key}:{ext}",
                title=title,
                company_name=company,
                url=text_or_none(row.get("url")),
                locations=[location] if location else [],
                country_code=text_or_none(row.get("country") or row.get("countryCode")),
                description=row.get("description") or "",
                posted_at=row.get("postedAt") or row.get("posted_at") or row.get("published_at"),
                employment_type=text_or_none(row.get("employmentType")),
            )
        )
    return out


class JsonFeedProvider:
    key = "json_feed"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        return FetchResult(parse(get_json(client, target.token), target))
