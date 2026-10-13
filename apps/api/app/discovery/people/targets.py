"""Which companies people discovery works on: those users actually applied to (by name) or
that have live shared job postings — not the scan registry. An incremental cursor in
`people_discovery_state` (`next_due_at`) means each run picks up the companies that are due,
most-applied first, and never re-processes one before its refresh interval."""

from __future__ import annotations

from typing import Any

import psycopg

from app.discovery.timeutil import iso_plus, now_iso

_TARGETS_SQL = """
WITH app_counts AS (
  SELECT lower(regexp_replace(btrim(company_name), '\\s+', ' ', 'g')) AS k, COUNT(*) AS n
  FROM applications GROUP BY 1
), job_counts AS (
  SELECT company_id, COUNT(*) AS n FROM jobs
  WHERE company_id IS NOT NULL AND expired_at IS NULL AND closed_at IS NULL
  GROUP BY company_id
)
SELECT c.id, c.name, COALESCE(a.n, 0)::int AS applications, COALESCE(j.n, 0)::int AS jobs,
       s.next_due_at, s.last_run_at
FROM companies c
LEFT JOIN app_counts a ON a.k = c.name_key
LEFT JOIN job_counts j ON j.company_id = c.id
LEFT JOIN people_discovery_state s ON s.company_id = c.id
WHERE (COALESCE(a.n, 0) > 0 OR COALESCE(j.n, 0) > 0)
"""


def due_targets(conn: psycopg.Connection, *, limit: int, company_ids: list[str] | None = None) -> list[dict[str, Any]]:
    if company_ids:
        return conn.execute(_TARGETS_SQL + " AND c.id = ANY(%s) ORDER BY c.name", (company_ids,)).fetchall()
    return conn.execute(
        _TARGETS_SQL
        + """ AND (s.next_due_at IS NULL OR s.next_due_at <= %s)
            ORDER BY (s.last_run_at IS NULL) DESC, COALESCE(a.n, 0) DESC, COALESCE(j.n, 0) DESC, c.name
            LIMIT %s""",
        (now_iso(), limit),
    ).fetchall()


def target_counts(conn: psycopg.Connection) -> dict[str, int]:
    row = conn.execute(
        f"""SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE t.next_due_at IS NULL OR t.next_due_at <= %s)::int AS due,
                   COUNT(*) FILTER (WHERE t.last_run_at IS NULL)::int AS never,
                   COUNT(*) FILTER (WHERE t.applications > 0)::int AS from_applications
            FROM ({_TARGETS_SQL}) t""",
        (now_iso(),),
    ).fetchone()
    return dict(row)


def claim(conn: psycopg.Connection, company_ids: list[str], *, hold_hours: int = 6) -> None:
    """Advance the cursor at enqueue time so overlapping runs don't pick the same company;
    `finish` sets the real next due time."""
    now = now_iso()
    hold = iso_plus(hold_hours * 3600)
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO people_discovery_state (company_id, next_due_at, updated_at)
               VALUES (%s, %s, %s)
               ON CONFLICT (company_id) DO UPDATE SET next_due_at = EXCLUDED.next_due_at,
                 updated_at = EXCLUDED.updated_at""",
            [(cid, hold, now) for cid in company_ids],
        )


def finish(
    conn: psycopg.Connection, company_id: str, *, domain: str | None, github_org: str | None,
    counts: dict[str, Any], refresh_days: int, error: str | None = None,
) -> None:
    import json

    now = now_iso()
    found = counts.get("created", 0) + counts.get("enriched", 0)
    # Nothing found and no domain: look again less often.
    days = refresh_days if (found or domain) else refresh_days * 2
    conn.execute(
        """INSERT INTO people_discovery_state
             (company_id, domain, github_org, last_run_at, next_due_at, last_counts_json, last_error, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (company_id) DO UPDATE SET
             domain = COALESCE(EXCLUDED.domain, people_discovery_state.domain),
             github_org = COALESCE(EXCLUDED.github_org, people_discovery_state.github_org),
             last_run_at = EXCLUDED.last_run_at, next_due_at = EXCLUDED.next_due_at,
             last_counts_json = EXCLUDED.last_counts_json, last_error = EXCLUDED.last_error,
             updated_at = EXCLUDED.updated_at""",
        (company_id, domain, github_org, now, iso_plus(days * 86400), json.dumps(counts), error, now),
    )


def cached_state(conn: psycopg.Connection, company_id: str) -> dict[str, Any] | None:
    return conn.execute("SELECT * FROM people_discovery_state WHERE company_id = %s", (company_id,)).fetchone()
