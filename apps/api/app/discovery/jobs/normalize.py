"""RawPosting → NormalizedJob (or a skip reason). Pure; runs inside fetch worker threads."""

from __future__ import annotations

from collections import Counter
from urllib.parse import urlparse
from dataclasses import dataclass, field
from datetime import datetime

from app.discovery.jobs import filters
from app.discovery.jobs.models import NormalizedJob, RawPosting
from app.discovery.jobs.text import clean_line, content_hash, dedupe_key, html_to_text
from app.discovery.timeutil import clamp_posted_at

MAX_TITLE = 300
MAX_LOCATION = 300


@dataclass
class NormalizeResult:
    jobs: list[NormalizedJob] = field(default_factory=list)
    skipped: Counter = field(default_factory=Counter)


def original_url(url: str | None) -> str | None:
    """The posting's original http(s) link, or None. Every stored job must have one so
    users can always open the source posting."""
    if not url:
        return None
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return url[:2000]


def display_location(locations: list[str]) -> str:
    seen: list[str] = []
    for loc in locations:
        # Drop empty comma parts ("Coimbatore, , India" → "Coimbatore, India").
        loc = ", ".join(p for p in (clean_line(part) for part in str(loc).split(",")) if p)
        if loc and loc.lower() not in (s.lower() for s in seen):
            seen.append(loc)
    return " · ".join(seen[:3])[:MAX_LOCATION] or "India"


def normalize_postings(
    postings: list[RawPosting],
    *,
    max_years_exclusive: int,
    include_internships: bool,
    now: datetime | None = None,
) -> NormalizeResult:
    result = NormalizeResult()
    seen_ids: set[str] = set()
    for posting in postings:
        if posting.external_id in seen_ids:
            result.skipped["duplicate_in_feed"] += 1
            continue
        seen_ids.add(posting.external_id)
        description = html_to_text(posting.description)
        outcome = filters.classify(
            posting,
            description,
            max_years_exclusive=max_years_exclusive,
            include_internships=include_internships,
        )
        if not outcome.keep:
            result.skipped[outcome.reason] += 1
            continue
        url = original_url(posting.url)
        if url is None:
            result.skipped["missing_url"] += 1  # never store a job without its original link
            continue
        title = clean_line(posting.title)[:MAX_TITLE]
        company = clean_line(posting.company_name)[:200]
        location = display_location(posting.locations)
        posted_at = clamp_posted_at(posting.posted_at, now)
        hashed = {
            "title": title,
            "company": company,
            "location": location,
            "url": url,
            "posted_at": posted_at,
            "description": description if posting.hash_description else None,
        }
        result.jobs.append(
            NormalizedJob(
                external_id=posting.external_id[:500],
                title=title,
                company_name=company,
                location=location,
                url=url,
                description=description,
                posted_at=posted_at,
                min_years=outcome.min_years,
                dedupe_key=dedupe_key(company, title, location),
                content_hash=content_hash(hashed),
            )
        )
    return result
