"""Data shapes passed between providers → normalize → store."""

from __future__ import annotations

from dataclasses import dataclass, field

PROVIDERS = ("greenhouse", "lever", "ashby", "workable", "smartrecruiters", "jsonld", "json_feed")


@dataclass(frozen=True)
class SourceTarget:
    """One row of the `company_sources` registry."""

    id: str
    company_name: str
    provider: str
    token: str
    careers_url: str
    company_id: str | None = None


@dataclass
class RawPosting:
    """A posting as read from a provider, before filtering. Never invent fields:
    unknown values stay None / empty."""

    external_id: str
    title: str
    company_name: str
    url: str | None
    locations: list[str] = field(default_factory=list)
    country_code: str | None = None
    description: str = ""
    posted_at: object = None
    employment_type: str | None = None
    # Provider seniority label when present (e.g. SmartRecruiters `experienceLevel.id`).
    seniority_hint: str | None = None
    remote: bool = False
    # False when the provider only sometimes supplies a description (SmartRecruiters):
    # the content hash then ignores it and an empty description never overwrites a stored one.
    hash_description: bool = True


@dataclass
class NormalizedJob:
    """A posting that passed the filters, ready to upsert."""

    external_id: str
    title: str
    company_name: str
    location: str
    url: str | None
    description: str
    posted_at: str | None
    min_years: int | None
    dedupe_key: str
    content_hash: str


@dataclass
class FetchResult:
    postings: list[RawPosting]
    # False when the provider list was truncated (paging cap); then missing postings
    # must not be treated as closed.
    complete: bool = True
