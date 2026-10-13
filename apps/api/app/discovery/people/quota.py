"""Persistent, cross-invocation guards for metered third-party APIs, so the six daily cron
slots (and manual runs) together stay inside free tiers.

* Google Custom Search JSON API: 100 free queries per day, billed after that; Google's day
  resets at midnight US Pacific. Each query first reserves a slot with one atomic upsert
  (`count < cap`), so concurrent runs can never exceed `google_cse_daily_query_cap`.
* GitHub REST: the API itself reports the hourly budget (`X-RateLimit-Remaining` /
  `X-RateLimit-Reset`). When it runs low we persist a pause until the reset, so later
  companies and later cron runs skip GitHub instead of hitting 403s.
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import psycopg

from app.discovery.timeutil import now_iso

PACIFIC = ZoneInfo("America/Los_Angeles")


def pacific_day(now: datetime | None = None) -> str:
    """Google's quota day (midnight US Pacific, DST-aware)."""
    return (now or datetime.now(timezone.utc)).astimezone(PACIFIC).date().isoformat()


def reserve(conn: psycopg.Connection, provider: str, period: str, cap: int) -> bool:
    """Atomically take one unit of `provider`'s quota for `period`; False once `cap` is used."""
    if cap <= 0:
        return False
    row = conn.execute(
        """INSERT INTO external_api_usage (provider, period, count, updated_at)
           VALUES (%(p)s, %(d)s, 1, %(now)s)
           ON CONFLICT (provider, period) DO UPDATE
             SET count = external_api_usage.count + 1, updated_at = EXCLUDED.updated_at
             WHERE external_api_usage.count < %(cap)s
           RETURNING count""",
        {"p": provider, "d": period, "now": now_iso(), "cap": cap},
    ).fetchone()
    return row is not None


def used(conn: psycopg.Connection, provider: str, period: str) -> int:
    row = conn.execute(
        "SELECT count FROM external_api_usage WHERE provider = %s AND period = %s", (provider, period)
    ).fetchone()
    return int(row["count"]) if row else 0


class CseQuota:
    """Callable gate passed to the search source: True = one CSE query may be sent."""

    def __init__(self, conn: psycopg.Connection, cap: int) -> None:
        self.conn = conn
        self.cap = cap
        self.denied = False

    def __call__(self) -> bool:
        if self.denied:
            return False
        ok = reserve(self.conn, "google_cse", pacific_day(), self.cap)
        self.denied = not ok
        return ok


class GitHubGuard:
    """Skip GitHub while its rate-limit window is (nearly) used up, across runs."""

    PROVIDER = "github_rate_pause"

    def __init__(self, conn: psycopg.Connection, min_remaining: int) -> None:
        self.conn = conn
        self.min_remaining = min_remaining
        self.paused = False

    def available(self) -> bool:
        if self.paused:
            return False
        row = self.conn.execute(
            "SELECT period FROM external_api_usage WHERE provider = %s", (self.PROVIDER,)
        ).fetchone()
        if row and row["period"] > now_iso():
            self.paused = True
        return not self.paused

    def observe(self, status: int | None, headers: dict[str, str] | None) -> None:
        """Read GitHub's own budget from response headers; pause until reset when low."""
        if not headers:
            return
        remaining = headers.get("x-ratelimit-remaining")
        reset = headers.get("x-ratelimit-reset")
        low = remaining is not None and remaining.isdigit() and int(remaining) <= self.min_remaining
        limited = status in (403, 429) and remaining == "0"
        if not (low or limited) or not (reset and reset.isdigit()):
            return
        until = datetime.fromtimestamp(int(reset), tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        self.conn.execute(
            """INSERT INTO external_api_usage (provider, period, count, updated_at)
               VALUES (%s, %s, 0, %s)
               ON CONFLICT (provider, period) DO NOTHING""",
            (self.PROVIDER, until, now_iso()),
        )
        self.conn.execute(
            "DELETE FROM external_api_usage WHERE provider = %s AND period <> %s", (self.PROVIDER, until)
        )
        self.paused = True
