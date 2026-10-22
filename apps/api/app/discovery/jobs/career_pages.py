"""`career_pages` registry: companies' own careers pages — the primary job source.

Seeded from `data/careers_pages.json` (built by `scripts/verify_careers_pages.py`, every URL
verified live), synced on each scan cron like the board seed, editable (enabled) by admins.
Each row stores what the last crawl found: the strategy that worked, status, counts.

Hiring-platform boards in `company_sources` become a fallback: a board whose company has
a careers page that last returned its complete list (`last_complete`) is not scanned
separately (see `registry.scheduled_source_ids`).
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import psycopg

from app.discovery.db import new_id
from app.discovery.jobs.careers_crawl import STRATEGY_LABELS, CareerPage, CrawlResult, registrable_domain
from app.discovery.timeutil import iso_minus, now_iso

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "careers_pages.json"
# A page that answered with job data is read on every daily scan; one without job data,
# blocked, or failing repeatedly is re-checked weekly.
RECHECK_SECONDS = 7 * 86_400
MAX_FAILURES = 5
# How recent a complete careers-page read must be for its board to be skipped.
BOARD_COVER_SECONDS = 3 * 86_400
FOCUSES = ("india", "india_office", "global")


def _name_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def shard_seed(url: str) -> int:
    return int(hashlib.sha1(f"careers:{url.lower()}".encode()).hexdigest()[:8], 16) % 10_000


def load_seed() -> list[dict[str, Any]]:
    if not SEED_PATH.exists():
        return []
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def import_seed(conn: psycopg.Connection) -> dict[str, int]:
    """Idempotent: insert seed pages whose URL (case-insensitive) or company name is not in
    the table yet; existing rows and admin edits are kept. New rows are linked to the board
    source of the same company (by name) so the two paths share one company name."""
    seed = load_seed()
    existing = conn.execute("SELECT lower(careers_url) AS u, company_name FROM career_pages").fetchall()
    urls = {r["u"] for r in existing}
    names = {_name_key(r["company_name"]) for r in existing}
    sources = {
        _name_key(r["company_name"]): r
        for r in conn.execute("SELECT id, company_name FROM company_sources").fetchall()
    }
    fresh = []
    for row in seed:
        url = row["careersUrl"]
        key = _name_key(row["name"])
        if url.lower() in urls or key in names:
            continue
        urls.add(url.lower())
        names.add(key)
        fresh.append(row)
    now = now_iso()
    if fresh:
        with conn.transaction(), conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO career_pages
                     (id, company_name, careers_url, domain, country_focus, tier, origin, enabled,
                      shard_seed, company_source_id, verified_at, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, 'seed', 1, %s, %s, %s, %s, %s)
                   ON CONFLICT DO NOTHING""",
                [
                    (
                        new_id(),
                        (sources.get(_name_key(r["name"])) or {}).get("company_name") or r["name"][:200],
                        r["careersUrl"][:2000],
                        r.get("domain") or registrable_domain(r["careersUrl"]),
                        r.get("countryFocus") if r.get("countryFocus") in FOCUSES else "global",
                        int(r.get("tier") or 3),
                        shard_seed(r["careersUrl"]),
                        (sources.get(_name_key(r["name"])) or {}).get("id"),
                        r.get("verifiedAt"),
                        now,
                        now,
                    )
                    for r in fresh
                ],
            )
    return {"added": len(fresh), "existing": len(seed) - len(fresh)}


def scheduled_ids(conn: psycopg.Connection, *, shard: int | None, shard_count: int) -> list[str]:
    """Enabled pages due for a crawl in a shard (None = all): pages that worked or were
    never read, daily; pages without job data, blocked, or failing repeatedly, weekly."""
    params: dict[str, Any] = {"recheck": iso_minus(RECHECK_SECONDS), "max_failures": MAX_FAILURES}
    sql = """SELECT id FROM career_pages
             WHERE enabled = 1
               AND (last_checked_at IS NULL
                    OR (last_status IN ('ok', 'error') AND consecutive_failures < %(max_failures)s)
                    OR last_checked_at < %(recheck)s)"""
    if shard is not None:
        sql += " AND shard_seed %% %(count)s = %(shard)s"
        params.update(count=shard_count, shard=shard)
    sql += " ORDER BY tier, company_name"
    return [r["id"] for r in conn.execute(sql, params).fetchall()]


def load(conn: psycopg.Connection, page_id: str) -> tuple[CareerPage, str | None] | None:
    """The page plus the company name to store jobs under (its board source's name when
    linked, so the same role from both paths shares one dedupe key)."""
    row = conn.execute(
        """SELECT p.id, p.company_name, p.careers_url, p.domain, p.last_posting_count,
                  s.company_name AS source_name
           FROM career_pages p LEFT JOIN company_sources s ON s.id = p.company_source_id
           WHERE p.id = %s""",
        (page_id,),
    ).fetchone()
    if not row:
        return None
    page = CareerPage(
        row["id"], row["company_name"], row["careers_url"], row["domain"], row["last_posting_count"]
    )
    return page, row["source_name"]


def record(
    conn: psycopg.Connection,
    page_id: str,
    result: CrawlResult,
    *,
    kept: int,
    counts: dict[str, Any],
    guarded: bool = False,
) -> None:
    now = now_iso()
    ok = result.status == "ok"
    embed = result.embed
    conn.execute(
        """UPDATE career_pages SET
             last_checked_at = %(now)s, last_status = %(status)s, last_error = %(error)s,
             strategy = CASE WHEN %(ok)s THEN %(strategy)s ELSE strategy END,
             platform_token = CASE WHEN %(ok)s THEN %(token)s ELSE platform_token END,
             final_url = COALESCE(%(final)s, final_url),
             last_complete = %(complete)s,
             jobs_found = CASE WHEN %(ok)s THEN %(found)s ELSE 0 END,
             -- A guarded read must not become the new baseline (see jobs/health.py).
             last_posting_count = CASE WHEN %(ok)s AND NOT %(guarded)s THEN %(found)s
                                       ELSE last_posting_count END,
             jobs_kept = CASE WHEN %(ok)s THEN %(kept)s ELSE 0 END,
             consecutive_failures = CASE WHEN %(status)s = 'error' THEN consecutive_failures + 1 ELSE 0 END,
             last_counts_json = %(counts)s, updated_at = %(now)s
           WHERE id = %(id)s""",
        {
            "now": now,
            "status": result.status,
            "error": (result.error or None) and result.error[:500],
            "ok": ok,
            "strategy": result.strategy,
            "token": embed.token if embed else None,
            "final": result.final_url,
            "complete": 1 if ok and result.complete else 0,
            "found": len(result.postings),
            "kept": kept,
            "guarded": guarded,
            "counts": json.dumps(counts),
            "id": page_id,
        },
    )
    if ok and embed:
        # The page runs on a board we also track: link them (fallback + shared company name).
        conn.execute(
            """UPDATE career_pages p SET company_source_id = s.id
               FROM company_sources s
               WHERE p.id = %s AND p.company_source_id IS NULL
                 AND s.provider = %s AND lower(s.token) = lower(%s)""",
            (page_id, embed.provider, embed.token),
        )


def set_enabled(conn: psycopg.Connection, page_id: str, enabled: bool) -> bool:
    cur = conn.execute(
        """UPDATE career_pages SET enabled = %s, consecutive_failures = 0, updated_at = %s
           WHERE id = %s""",
        (1 if enabled else 0, now_iso(), page_id),
    )
    return bool(cur.rowcount)


# Board sources covered by a careers page that returned its complete list recently.
BOARD_COVERED_SQL = """EXISTS (
    SELECT 1 FROM career_pages p
    WHERE p.company_source_id = company_sources.id AND p.enabled = 1
      AND p.last_status = 'ok' AND p.last_complete = 1
      AND p.last_checked_at >= %(covered_after)s)"""


def board_cover_cutoff() -> str:
    return iso_minus(BOARD_COVER_SECONDS)


def list_pages(conn: psycopg.Connection, *, query: str = "", limit: int = 1000, offset: int = 0) -> dict[str, Any]:
    like = f"%{query.strip().lower()}%"
    rows = conn.execute(
        """SELECT p.id, p.company_name, p.careers_url, p.domain, p.country_focus, p.tier, p.origin,
                  p.enabled, p.strategy, p.platform_token, p.final_url, p.last_checked_at,
                  p.last_status, p.last_error, p.last_complete, p.jobs_found, p.jobs_kept,
                  p.verified_at, s.provider AS board_provider
           FROM career_pages p LEFT JOIN company_sources s ON s.id = p.company_source_id
           WHERE lower(p.company_name) LIKE %(q)s OR lower(p.careers_url) LIKE %(q)s
           ORDER BY p.company_name LIMIT %(limit)s OFFSET %(offset)s""",
        {"q": like, "limit": limit, "offset": offset},
    ).fetchall()
    summary = conn.execute(
        """SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE enabled = 1) AS enabled,
                  COUNT(*) FILTER (WHERE last_checked_at IS NOT NULL) AS checked,
                  COUNT(*) FILTER (WHERE last_status = 'ok') AS ok,
                  COUNT(*) FILTER (WHERE last_status = 'no_job_data') AS "noJobData",
                  COUNT(*) FILTER (WHERE last_status = 'blocked') AS blocked,
                  COUNT(*) FILTER (WHERE last_status = 'error') AS error,
                  COUNT(*) FILTER (WHERE country_focus = 'india') AS india,
                  COUNT(*) FILTER (WHERE country_focus = 'india_office') AS "indiaOffice",
                  COUNT(*) FILTER (WHERE country_focus = 'global') AS global,
                  COALESCE(SUM(jobs_found) FILTER (WHERE last_status = 'ok'), 0) AS "jobsFound",
                  COALESCE(SUM(jobs_kept) FILTER (WHERE last_status = 'ok'), 0) AS "jobsKept"
           FROM career_pages"""
    ).fetchone()
    by_strategy = conn.execute(
        """SELECT strategy, COUNT(*) AS n, COALESCE(SUM(jobs_found), 0) AS jobs
           FROM career_pages WHERE last_status = 'ok' AND strategy IS NOT NULL
           GROUP BY strategy ORDER BY n DESC"""
    ).fetchall()
    return {
        "pages": [
            {
                "id": r["id"],
                "companyName": r["company_name"],
                "careersUrl": r["careers_url"],
                "domain": r["domain"],
                "countryFocus": r["country_focus"],
                "tier": r["tier"],
                "origin": r["origin"],
                "enabled": bool(r["enabled"]),
                "strategy": r["strategy"],
                "platformToken": r["platform_token"],
                "finalUrl": r["final_url"],
                "lastCheckedAt": r["last_checked_at"],
                "lastStatus": r["last_status"],
                "lastError": r["last_error"],
                "complete": bool(r["last_complete"]),
                "jobsFound": r["jobs_found"],
                "jobsKept": r["jobs_kept"],
                "verifiedAt": r["verified_at"],
                "boardProvider": r["board_provider"],
            }
            for r in rows
        ],
        "summary": {k: int(v or 0) for k, v in dict(summary or {}).items()},
        "byStrategy": [
            {"strategy": r["strategy"], "label": STRATEGY_LABELS.get(r["strategy"], r["strategy"]), "pages": r["n"], "jobs": int(r["jobs"])}
            for r in by_strategy
        ],
    }
