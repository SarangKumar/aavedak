"""Data shapes passed between providers → normalize → store."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.discovery.jobs.salary import SalaryInfo

PROVIDERS = (
    "greenhouse", "lever", "ashby", "workable", "smartrecruiters", "jsonld", "json_feed", "workday",
)


@dataclass(frozen=True)
class SourceTarget:
    """One row of the `company_sources` registry."""

    id: str
    company_name: str
    provider: str
    token: str
    careers_url: str
    company_id: str | None = None
    # The company's own careers page (primary source of truth), when known. Read on each
    # scan alongside the board when it publishes job data; see scan.py.
    official_careers_url: str | None = None
    official_status: str | None = None
    official_checked_at: str | None = None


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
    # Pay the provider publishes in structured form (normalize also reads the posting text).
    salary: SalaryInfo | None = None


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
    # Application / recruiting email published in the posting text, if any (never guessed).
    apply_email: str | None = None
    # Salary / stipend the company states, as display text (never estimated).
    salary: str | None = None
    # The parsed description before boilerplate stripping, when stripping changed it.
    description_raw: str | None = None
    # Upper end of a stated experience range ("2-4 years" → 4), else None.
    max_years: int | None = None
    # india | india_remote | remote | global (filters.job_region).
    region: str = "global"
    country_code: str | None = None


@dataclass
class FetchResult:
    postings: list[RawPosting]
    # False when the provider list was truncated (paging cap); then missing postings
    # must not be treated as closed.
    complete: bool = True
    # Where the board's postings actually live when that is the company's own site (e.g.
    # Greenhouse `absolute_url` on careers.airbnb.com): a hint for the official careers page.
    official_url_hint: str | None = None
