"""Job expiry (posting date + `job_expiry_days`) and the linked application side effect.

Both steps are set-based and safe to re-run:
  1. Shared jobs older than the cutoff get `expired_at` (never cleared; raising the expiry
     setting later does not resurrect anything).
  2. Applications linked to an expired job in an early status move to `rejected` with
     reason `job_expired`. A unique system event per (application, reason) guarantees this
     happens at most once — if the user reopens the application it is never re-rejected.
     History is kept in `application_events`; nothing is deleted.

Manual / pasted jobs (user_id set) and applications without a job never expire.
"""

from __future__ import annotations

import psycopg

from app.discovery.config import EXPIRY_REJECTABLE_STATUSES, JOB_EXPIRED_REASON, DiscoverySettings
from app.discovery.timeutil import expiry_cutoff_iso, now_iso

BATCH = 1000


def expire_jobs(conn: psycopg.Connection, settings: DiscoverySettings) -> int:
    now = now_iso()
    cur = conn.execute(
        """UPDATE jobs SET expired_at = %s, updated_at = %s
           WHERE user_id IS NULL AND expired_at IS NULL
             AND COALESCE(posted_at, first_seen_at, created_at) < %s""",
        (now, now, expiry_cutoff_iso(settings.job_expiry_days)),
    )
    return cur.rowcount or 0


def reject_expired_applications(conn: psycopg.Connection) -> int:
    """Returns the number of applications moved to rejected (bounded per call)."""
    now = now_iso()
    total = 0
    while True:
        rows = conn.execute(
            """WITH eligible AS (
                 SELECT a.id, a.user_id, a.status
                 FROM applications a
                 JOIN jobs j ON j.id = a.job_id
                 WHERE j.user_id IS NULL AND j.expired_at IS NOT NULL
                   AND a.status = ANY(%(statuses)s)
                   AND NOT EXISTS (
                     SELECT 1 FROM application_events e
                     WHERE e.application_id = a.id AND e.actor = 'system' AND e.reason = %(reason)s)
                 LIMIT %(batch)s
               ), events AS (
                 INSERT INTO application_events
                   (id, application_id, user_id, from_status, to_status, reason, actor, created_at)
                 SELECT gen_random_uuid()::text, id, user_id, status, 'rejected', %(reason)s, 'system', %(now)s
                 FROM eligible
                 ON CONFLICT DO NOTHING
                 RETURNING application_id
               )
               UPDATE applications SET status = 'rejected', status_reason = %(reason)s,
                      status_changed_at = %(now)s, updated_at = %(now)s
               WHERE id IN (SELECT application_id FROM events)
               RETURNING id""",
            {
                "statuses": list(EXPIRY_REJECTABLE_STATUSES),
                "reason": JOB_EXPIRED_REASON,
                "batch": BATCH,
                "now": now,
            },
        ).fetchall()
        total += len(rows)
        if len(rows) < BATCH:
            return total


def run_expiry(conn: psycopg.Connection, settings: DiscoverySettings) -> dict[str, int]:
    return {"jobsExpired": expire_jobs(conn, settings), "applicationsRejected": reject_expired_applications(conn)}
