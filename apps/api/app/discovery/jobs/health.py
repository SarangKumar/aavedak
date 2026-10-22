"""Ingest quality controls and the source-health report.

Two jobs:

* **Outage guard** (`guard_complete`) — a source that normally lists dozens of roles and
  suddenly returns almost none is far more likely to be broken (a changed board, a partial
  outage, a throttled API) than to have closed everything. Treating that fetch as the
  complete list would set `closed_at` on the whole company. The guard downgrades such a
  fetch to incomplete, so nothing is closed and the next scan decides. Pure.
* **Health report** (`source_health`) — one read-only snapshot for the admin page: what is
  configured, what was checked, what failed, what each ATS produced, and the validation
  problems in the stored jobs (missing links, blank titles, empty descriptions, duplicate
  listings, jobs nothing has re-listed for a long time).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import psycopg

from app.discovery.timeutil import iso_minus

# A fetch is only judged against its predecessor once the source has shown this many
# postings: for a board with 3 roles, going to 1 is ordinary hiring, not an outage.
OUTAGE_MIN_BASELINE = 10
# Below this share of the last count, a "complete" fetch is not believed.
OUTAGE_MIN_RATIO = 0.4
# A job no source has re-listed for this long is reported as stale (expiry still owns it).
STALE_AFTER_DAYS = 10


@dataclass(frozen=True)
class CompleteGuard:
    complete: bool
    guarded: bool
    previous: int | None = None


def guard_complete(*, complete: bool, fetched: int, previous: int | None) -> CompleteGuard:
    """Should this fetch be allowed to close the jobs it no longer lists?

    Only when it says it is complete **and** it did not collapse against the last count.
    """
    if not complete:
        return CompleteGuard(False, False, previous)
    if previous is None or previous < OUTAGE_MIN_BASELINE:
        return CompleteGuard(True, False, previous)
    if fetched < previous * OUTAGE_MIN_RATIO:
        return CompleteGuard(False, True, previous)
    return CompleteGuard(True, False, previous)


def _rows(conn: psycopg.Connection, sql: str, params: Any = None) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def _row(conn: psycopg.Connection, sql: str, params: Any = None) -> dict[str, Any]:
    found = conn.execute(sql, params).fetchone()
    return dict(found or {})


def source_health(conn: psycopg.Connection, *, expiry_days: int) -> dict[str, Any]:
    """Read-only health snapshot. Every number comes from a query; nothing is estimated."""
    day = iso_minus(86_400)
    week = iso_minus(7 * 86_400)
    stale = iso_minus(STALE_AFTER_DAYS * 86_400)

    boards = _row(
        conn,
        """SELECT COUNT(*) AS configured,
                  COUNT(*) FILTER (WHERE enabled = 1) AS enabled,
                  COUNT(*) FILTER (WHERE last_run_at IS NOT NULL) AS checked,
                  COUNT(*) FILTER (WHERE last_success_at IS NOT NULL) AS "everSucceeded",
                  COUNT(*) FILTER (WHERE last_success_at >= %(week)s) AS "succeededThisWeek",
                  COUNT(*) FILTER (WHERE last_error IS NOT NULL AND enabled = 1) AS failing,
                  COUNT(*) FILTER (WHERE consecutive_failures >= 5) AS "parkedWeekly",
                  MAX(last_success_at) AS "lastSuccessAt"
           FROM company_sources""",
        {"week": week},
    )
    by_ats = _rows(
        conn,
        """SELECT provider AS ats, COUNT(*) AS configured,
                  COUNT(*) FILTER (WHERE last_success_at IS NOT NULL) AS succeeded,
                  COUNT(*) FILTER (WHERE last_error IS NOT NULL) AS failing,
                  COALESCE(SUM(last_posting_count), 0) AS "postingsLastScan",
                  MAX(last_success_at) AS "lastSuccessAt"
           FROM company_sources GROUP BY provider ORDER BY configured DESC""",
    )
    pages = _row(
        conn,
        """SELECT COUNT(*) AS configured,
                  COUNT(*) FILTER (WHERE enabled = 1) AS enabled,
                  COUNT(*) FILTER (WHERE last_checked_at IS NOT NULL) AS checked,
                  COUNT(*) FILTER (WHERE last_status = 'ok') AS ok,
                  COUNT(*) FILTER (WHERE last_status = 'no_job_data') AS "noJobData",
                  COUNT(*) FILTER (WHERE last_status = 'blocked') AS blocked,
                  COUNT(*) FILTER (WHERE last_status = 'error') AS error,
                  MAX(last_checked_at) AS "lastCheckedAt"
           FROM career_pages""",
    )
    by_strategy = _rows(
        conn,
        """SELECT strategy, COUNT(*) AS pages, COALESCE(SUM(jobs_found), 0) AS "jobsFound",
                  COALESCE(SUM(jobs_kept), 0) AS "jobsKept"
           FROM career_pages WHERE last_status = 'ok' AND strategy IS NOT NULL
           GROUP BY strategy ORDER BY pages DESC""",
    )
    jobs = _row(
        conn,
        """SELECT COUNT(*) FILTER (WHERE expired_at IS NULL AND closed_at IS NULL) AS active,
                  COUNT(*) FILTER (WHERE first_seen_at >= %(day)s) AS "addedLast24h",
                  COUNT(*) FILTER (WHERE first_seen_at >= %(week)s) AS "addedLast7d",
                  COUNT(*) FILTER (WHERE updated_at >= %(day)s) AS "updatedLast24h",
                  COUNT(*) FILTER (WHERE closed_at >= %(day)s) AS "closedLast24h",
                  COUNT(*) FILTER (WHERE expired_at >= %(day)s) AS "expiredLast24h"
           FROM jobs WHERE user_id IS NULL""",
        {"day": day, "week": week},
    )
    validation = _row(
        conn,
        """SELECT
             COUNT(*) FILTER (WHERE url IS NULL OR url NOT LIKE 'http%%') AS "invalidUrl",
             COUNT(*) FILTER (WHERE COALESCE(TRIM(title), '') = '') AS "invalidTitle",
             COUNT(*) FILTER (WHERE COALESCE(description, '') = '') AS "emptyDescription",
             COUNT(*) FILTER (WHERE length(description) BETWEEN 1 AND 200) AS "shortDescription",
             COUNT(*) FILTER (WHERE id IN (
               SELECT j2.job_id FROM job_sources j2
               GROUP BY j2.job_id HAVING MAX(j2.last_seen_at) < %(stale)s)) AS "notRelistedRecently"
           FROM jobs
           WHERE user_id IS NULL AND expired_at IS NULL AND closed_at IS NULL""",
        {"stale": stale},
    )
    duplicates = _row(
        conn,
        """SELECT COUNT(*) AS "duplicateGroups", COALESCE(SUM(n) - COUNT(*), 0) AS "duplicateExtras"
           FROM (SELECT dedupe_key, COUNT(*) AS n FROM jobs
                 WHERE user_id IS NULL AND expired_at IS NULL AND closed_at IS NULL
                   AND dedupe_key IS NOT NULL
                 GROUP BY dedupe_key HAVING COUNT(*) > 1) d""",
    )
    discovery = _rows(
        conn,
        """SELECT status, COUNT(*) AS n FROM discovered_companies GROUP BY status ORDER BY n DESC""",
    )
    guarded = _rows(
        conn,
        """SELECT company_name AS company, provider AS ats, last_posting_count AS "lastCount",
                  last_counts_json AS counts
           FROM company_sources
           WHERE last_counts_json LIKE '%%outageGuard%%' ORDER BY company_name LIMIT 25""",
    )
    return {
        "boards": boards,
        "boardsByAts": by_ats,
        "careersPages": pages,
        "careersPagesByStrategy": by_strategy,
        "jobs": {**jobs, "expiryDays": expiry_days},
        "validation": {**validation, **duplicates, "staleAfterDays": STALE_AFTER_DAYS},
        "companyDiscovery": {r["status"]: r["n"] for r in discovery},
        "outageGuarded": [{k: v for k, v in r.items() if k != "counts"} for r in guarded],
    }
