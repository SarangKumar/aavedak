"""Job expiry (posting date + `job_expiry_days`), filled-job pruning and compaction.

Set-based and safe to re-run. Shared jobs older than the cutoff get `expired_at` (never
cleared; raising the expiry setting later does not resurrect anything). Expiry only marks the
job: applications linked to it keep their status (the tracker badges them "Posting expired").
Applications rejected by the old rule keep `status_reason = 'job_expired'` and their system
`application_events` row.

Manual / pasted jobs (user_id set) and applications without a job never expire.
"""

from __future__ import annotations

import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.timeutil import expiry_cutoff_iso, now_iso


def expire_jobs(conn: psycopg.Connection, settings: DiscoverySettings) -> int:
    now = now_iso()
    cur = conn.execute(
        """UPDATE jobs SET expired_at = %s, updated_at = %s
           WHERE user_id IS NULL AND expired_at IS NULL
             AND COALESCE(posted_at, first_seen_at, created_at) < %s""",
        (now, now, expiry_cutoff_iso(settings.job_expiry_days)),
    )
    return cur.rowcount or 0


def prune_filled_jobs(conn: psycopg.Connection) -> int:
    """Drop 'filled' / removed-from-portal shared jobs from every user's Discover pool.

    A posting that a company fills or pulls stops being listed by its source, so a complete
    scan sets `jobs.closed_at`. This clears those jobs' `recommended_at` in `user_job_state`
    so they leave Discover and are never re-offered. Applications are left untouched: a user
    who applied or bookmarked keeps the application (the UI badges it as removed from the
    portal). Set-based and safe to re-run."""
    now = now_iso()
    cur = conn.execute(
        """UPDATE user_job_state s SET recommended_at = NULL, updated_at = %s
           FROM jobs j
           WHERE s.job_id = j.id AND j.user_id IS NULL AND j.closed_at IS NOT NULL
             AND s.recommended_at IS NOT NULL AND s.application_id IS NULL""",
        (now, now),
    )
    return cur.rowcount or 0


# Expired / closed shared jobs keep their row (dedupe, history) but drop the description
# after this many days unless someone applied to them — keeps the worldwide pool inside
# Neon's free 0.5 GB.
COMPACT_AFTER_DAYS = 7


def compact_dead_jobs(conn: psycopg.Connection) -> int:
    cur = conn.execute(
        """UPDATE jobs j SET description = '', description_raw = NULL
           WHERE j.user_id IS NULL AND (j.description <> '' OR j.description_raw IS NOT NULL)
             AND COALESCE(j.expired_at, j.closed_at) IS NOT NULL
             AND COALESCE(j.expired_at, j.closed_at) < %s
             AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)""",
        (expiry_cutoff_iso(COMPACT_AFTER_DAYS),),
    )
    return cur.rowcount or 0


def run_expiry(conn: psycopg.Connection, settings: DiscoverySettings) -> dict[str, int]:
    return {
        "jobsExpired": expire_jobs(conn, settings),
        "jobsCompacted": compact_dead_jobs(conn),
    }
