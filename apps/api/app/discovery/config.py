"""Discovery settings: typed tuning constants in code (`DiscoveryTuning`) plus the few
values that come from env (kill switch, optional source keys). See docs/env.md."""

from __future__ import annotations

from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import ENV_FILES
from app.core.config import settings as core_settings


class DiscoveryTuning(BaseModel):
    """Non-secret tuning, typed and versioned here in code (not env). Change a value by
    editing this class; tests may pass overrides to `DiscoverySettings(...)`."""

    model_config = ConfigDict(extra="ignore")

    # Max new recommendations per user per IST day.
    discovery_daily_limit: int = Field(50, ge=1, le=200)
    # Jobs older than this (by posting date) leave the active tabs.
    job_expiry_days: int = Field(30, ge=1, le=365)
    # Ingest: postings are stored worldwide; skip only roles whose minimum years (stated, or
    # inferred from a Senior/Staff title) exceed this — no user's window reaches them.
    ingest_max_min_years: int = Field(10, ge=1, le=25)
    # Matching: a user with N years sees jobs whose minimum required years is within
    # [0, N + experience_window_years] (jobs that state none are included). Users without
    # `years_experience` count as `default_years_experience`.
    experience_window_years: float = Field(2.0, ge=0, le=10)
    default_years_experience: float = Field(0.0, ge=0, le=40)
    include_internships: bool = False
    # Scan crons the registry is split across (vercel.json has one per shard): two a day,
    # 05:45 and 17:45 IST. Each run queues its shard; the drain crons finish what a run could
    # not fit in its budget, so the shard count sets how often a company is revisited, not how
    # much work gets done in a day.
    discovery_shards: int = Field(2, ge=1, le=24)
    # Company sources fetched in parallel inside one tick (kept modest for Hobby Active CPU).
    discovery_fetch_concurrency: int = Field(4, ge=1, le=16)
    # Wall-clock budget for one tick; leftover items wait for the next tick/drain cron. Kept
    # under the 60 s maxDuration of the web routes that proxy a tick (admin, people cron).
    discovery_tick_budget_seconds: float = Field(45.0, ge=5, le=280)
    # Budget for the scan/drain crons Vercel calls on the API service directly (Hobby Fluid
    # Active CPU is ~4 CPU-h/month). 2 scan + 3 drain ticks/day × ~90 s at concurrency 4
    # still clears backlog across the day without saturating Active CPU.
    discovery_cron_tick_budget_seconds: float = Field(90.0, ge=5, le=280)
    discovery_lease_seconds: int = Field(180, ge=30, le=900)
    discovery_max_attempts: int = Field(3, ge=1, le=10)
    # Minimum match score for a recommendation when the user has skills/resume text.
    discovery_min_match_score: int = Field(30, ge=0, le=100)
    # Scheduled scans skip a source after this many consecutive failures (retried weekly).
    discovery_max_failures: int = Field(5, ge=1, le=100)
    discovery_http_timeout_seconds: float = Field(20.0, ge=3, le=60)
    discovery_user_agent: str = "AavedakJobsBot/1.0 (+https://aavedak.vercel.app)"
    # SmartRecruiters lists omit descriptions; cap per-posting detail fetches per company.
    smartrecruiters_detail_limit: int = Field(40, ge=0, le=200)
    # Company discovery (jobs/company_discovery.py): candidates resolved per scan shard, and
    # product-data candidates collected per scan. Both are small: discovery rides behind the
    # scans in the same ticks, so it must never crowd out job fetching.
    company_discovery_per_scan: int = Field(15, ge=0, le=100)
    company_candidates_per_scan: int = Field(25, ge=0, le=200)
    # Rows per people-import run item.
    people_batch_size: int = Field(100, ge=10, le=1000)
    # People discovery v2 (see DISCOVERY.md): per-run and per-company limits.
    people_companies_per_run: int = Field(25, ge=1, le=200)
    people_requests_per_company: int = Field(60, ge=5, le=200)
    people_host_delay_seconds: float = Field(1.0, ge=0, le=10)
    people_refresh_days: int = Field(14, ge=1, le=180)
    people_site_pages: int = Field(8, ge=1, le=12)
    people_github_members: int = Field(30, ge=0, le=50)
    people_search_results: int = Field(15, ge=0, le=50)
    # Google Custom Search JSON API: 100 queries/day free, then billed. Hard cap per Pacific day
    # (Google's reset), shared by all cron slots and manual runs; tracked in external_api_usage.
    google_cse_daily_query_cap: int = Field(90, ge=0, le=100)
    # Pause GitHub (until its reset time) once fewer than this many requests remain this hour.
    github_min_remaining: int = Field(10, ge=0, le=1000)


class _DiscoveryEnv(BaseSettings):
    """The only discovery values read from the environment: the deployment kill switch and
    optional third-party keys (secrets). Each source is skipped when its key is empty."""

    model_config = SettingsConfigDict(env_file=ENV_FILES, env_file_encoding="utf-8", extra="ignore")

    discovery_enabled: bool = True
    github_token: str = ""
    brave_search_api_key: str = ""
    serpapi_key: str = ""
    google_cse_key: str = ""
    google_cse_cx: str = ""
    hunter_api_key: str = ""
    apollo_api_key: str = ""


class DiscoverySettings(DiscoveryTuning):
    discovery_enabled: bool = True
    github_token: str = ""
    brave_search_api_key: str = ""
    serpapi_key: str = ""
    google_cse_key: str = ""
    google_cse_cx: str = ""
    hunter_api_key: str = ""
    apollo_api_key: str = ""

    @property
    def database_url(self) -> str:
        return core_settings.database_url

    @property
    def cron_secret(self) -> str:
        return core_settings.cron_secret


@lru_cache(maxsize=1)
def get_settings() -> DiscoverySettings:
    return DiscoverySettings(**_DiscoveryEnv().model_dump())
