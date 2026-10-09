"""Discovery settings (env-driven, all optional). Documented in docs/jobs-ingest.md."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import settings as core_settings

# Application statuses that an expired job may auto-move to `rejected` (reason
# `job_expired`). Never assessment / interview / offer / withdrawn / archived.
EXPIRY_REJECTABLE_STATUSES: tuple[str, ...] = (
    "bookmarked",
    "preparing",
    "applied",
    "under_review",
    "ghosted",
)
JOB_EXPIRED_REASON = "job_expired"


class DiscoverySettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    discovery_enabled: bool = True
    # Max new recommendations per user per IST day.
    discovery_daily_limit: int = Field(50, ge=1, le=200)
    # Jobs older than this (by posting date) leave the active tabs.
    job_expiry_days: int = Field(30, ge=1, le=365)
    # Keep a posting only when its stated minimum experience is strictly below this.
    junior_max_years_exclusive: int = Field(3, ge=1, le=15)
    include_internships: bool = False
    # Staggered daily scan crons the registry is split across (vercel.json has one per shard).
    discovery_shards: int = Field(6, ge=1, le=24)
    # Company sources fetched in parallel inside one tick.
    discovery_fetch_concurrency: int = Field(6, ge=1, le=16)
    # Wall-clock budget for one tick; leftover items wait for the next tick/drain cron.
    discovery_tick_budget_seconds: float = Field(45.0, ge=5, le=280)
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
    # Rows per people-import run item.
    people_batch_size: int = Field(100, ge=10, le=1000)

    @property
    def database_url(self) -> str:
        return core_settings.database_url

    @property
    def cron_secret(self) -> str:
        return core_settings.cron_secret


@lru_cache(maxsize=1)
def get_settings() -> DiscoverySettings:
    return DiscoverySettings()
