"""`company_sources` registry: seed import, admin import, sharding, and scan status."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from urllib.parse import urlparse

import psycopg

from app.discovery.db import new_id
from app.discovery.jobs.models import SourceTarget
from app.discovery.jobs.providers import detect_source
from app.discovery.timeutil import iso_minus, now_iso

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "career_sources.json"
RETRY_FAILING_AFTER_SECONDS = 7 * 86_400
# An official careers page that publishes no job data (or blocks robots) is re-checked
# weekly instead of on every scan.
OFFICIAL_RECHECK_SECONDS = 7 * 86_400
OFFICIAL_STATUSES = ("ok", "no_job_data", "blocked", "error")


def clean_official_url(url: str | None) -> str | None:
    """An http(s) URL, trimmed, or None. Raises ValueError for anything else."""
    if url is None or not url.strip():
        return None
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Official careers URL must be an http(s) link.")
    return url[:2000]


def shard_seed(provider: str, token: str) -> int:
    """Stable 0..9999 seed; shard = seed % shard_count, so changing the count re-balances."""
    return int(hashlib.sha1(f"{provider}:{token}".encode()).hexdigest()[:8], 16) % 10_000


def load_seed() -> list[dict[str, Any]]:
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def _insert(
    conn: psycopg.Connection,
    *,
    company_name: str,
    provider: str,
    token: str,
    careers_url: str,
    sector: str | None,
    origin: str,
) -> bool:
    now = now_iso()
    cur = conn.execute(
        """INSERT INTO company_sources
             (id, company_name, provider, token, careers_url, sector, origin, enabled, shard_seed,
              created_at, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, %s, %s)
           ON CONFLICT (provider, token) DO NOTHING""",
        (new_id(), company_name[:200], provider, token, careers_url, sector, origin,
         shard_seed(provider, token), now, now),
    )
    return bool(cur.rowcount)


def _name_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def import_seed(conn: psycopg.Connection) -> dict[str, int]:
    """Idempotent sync of the seed into `company_sources`, safe to run on every scan cron so
    entries added to the seed reach an existing database. A seed row is skipped when its
    (provider, token) or its company name (case/punctuation-insensitive) is already present;
    existing rows (and admin edits) are left untouched, except that a seed
    `officialCareersUrl` fills an official careers page that is still empty. One batched
    statement (pipeline) instead of a round trip per row."""
    seed = load_seed()
    existing = conn.execute("SELECT provider, token, company_name FROM company_sources").fetchall()
    keys = {(r["provider"], r["token"].lower()) for r in existing}
    names = {_name_key(r["company_name"]) for r in existing}
    fresh, fill_official = [], []
    for row in seed:
        key = (row["provider"], row["token"].lower())
        if key in keys:
            if row.get("officialCareersUrl"):
                fill_official.append(row)
            continue
        if _name_key(row["name"]) in names:
            continue
        keys.add(key)
        names.add(_name_key(row["name"]))
        fresh.append(row)
    now = now_iso()
    with conn.transaction(), conn.cursor() as cur:
        if fresh:
            cur.executemany(
                """INSERT INTO company_sources
                     (id, company_name, provider, token, careers_url, sector, origin, enabled,
                      shard_seed, created_at, updated_at, official_careers_url,
                      official_careers_origin)
                   VALUES (%s, %s, %s, %s, %s, %s, 'seed', 1, %s, %s, %s, %s,
                           CASE WHEN %s::text IS NULL THEN NULL ELSE 'seed' END)
                   ON CONFLICT (provider, token) DO NOTHING""",
                [
                    (new_id(), row["name"][:200], row["provider"], row["token"], row["careersUrl"],
                     row.get("sector"), shard_seed(row["provider"], row["token"]), now, now,
                     row.get("officialCareersUrl"), row.get("officialCareersUrl"))
                    for row in fresh
                ],
            )
        if fill_official:
            cur.executemany(
                """UPDATE company_sources SET official_careers_url = %s,
                     official_careers_origin = 'seed'
                   WHERE provider = %s AND lower(token) = lower(%s)
                     AND official_careers_url IS NULL""",
                [(row["officialCareersUrl"], row["provider"], row["token"]) for row in fill_official],
            )
    added = len(fresh)
    return {"added": added, "existing": len(seed) - added}


# Cross-company index rows: not companies, so they are created from code rather than from
# `career_sources.json` (which the web app renders as the list of seed companies).
def import_index_sources(conn: psycopg.Connection) -> dict[str, int]:
    """Idempotent sync of the cross-company ATS index specs into `company_sources`.

    One row per Workable index query (`providers/workable_index.INDEX_TOKENS`), so each is
    its own bounded run item and spreads across the scan shards like any other source.
    """
    from app.discovery.jobs.providers.workable_index import INDEX_TOKENS

    now = now_iso()
    added = 0
    with conn.transaction():
        for token in INDEX_TOKENS:
            location, _, query = token.partition(":")
            label = f"Workable index — {query or 'all roles'} ({location})"
            cur = conn.execute(
                """INSERT INTO company_sources
                     (id, company_name, provider, token, careers_url, origin, enabled, shard_seed,
                      created_at, updated_at)
                   VALUES (%s, %s, 'workable_index', %s, %s, 'index', 1, %s, %s, %s)
                   ON CONFLICT (provider, token) DO NOTHING""",
                (new_id(), label[:200], token, "https://jobs.workable.com/",
                 shard_seed("workable_index", token), now, now),
            )
            added += bool(cur.rowcount)
    return {"added": added, "existing": len(INDEX_TOKENS) - added}


@dataclass
class ImportResult:
    added: int = 0
    existing: int = 0
    invalid: list[str] = field(default_factory=list)


def parse_import_line(line: str) -> tuple[str | None, str, str | None]:
    """`URL` | `Company, URL` | `Company, URL, sector` → (name, url, sector)."""
    parts = [p.strip() for p in line.split(",")]

    def looks_like_url(part: str) -> bool:
        return part.startswith(("http://", "https://")) or ("." in part and " " not in part and "/" in part)

    url_index = next((i for i, p in enumerate(parts) if looks_like_url(p)), None)
    if url_index is None:
        raise ValueError("no URL found")
    name = ", ".join(parts[:url_index]).strip() or None
    sector = parts[url_index + 1].lower() if len(parts) > url_index + 1 and parts[url_index + 1] else None
    if sector and sector not in ("software", "core", "mixed"):
        sector = None
    return name, parts[url_index], sector


def import_lines(conn: psycopg.Connection, text: str) -> ImportResult:
    result = ImportResult()
    with conn.transaction():
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            try:
                name, url, sector = parse_import_line(line)
                detected = detect_source(url)
            except ValueError:
                result.invalid.append(line[:200])
                continue
            company = name or detected.token.replace("-", " ").title()
            if _insert(
                conn,
                company_name=company,
                provider=detected.provider,
                token=detected.token,
                careers_url=detected.careers_url,
                sector=sector,
                origin="admin",
            ):
                result.added += 1
            else:
                result.existing += 1
    return result


def set_enabled(conn: psycopg.Connection, source_id: str, enabled: bool) -> bool:
    cur = conn.execute(
        """UPDATE company_sources SET enabled = %s, consecutive_failures = 0, updated_at = %s
           WHERE id = %s""",
        (1 if enabled else 0, now_iso(), source_id),
    )
    return bool(cur.rowcount)


def set_official_url(conn: psycopg.Connection, source_id: str, url: str | None) -> bool:
    """Admin sets (or clears) a source's official careers page; the next scan reads it."""
    cleaned = clean_official_url(url)
    cur = conn.execute(
        """UPDATE company_sources SET official_careers_url = %s,
             official_careers_origin = CASE WHEN %s::text IS NULL THEN NULL ELSE 'admin' END,
             official_status = NULL, official_checked_at = NULL, updated_at = %s
           WHERE id = %s""",
        (cleaned, cleaned, now_iso(), source_id),
    )
    return bool(cur.rowcount)


def record_official(
    conn: psycopg.Connection, source_id: str, *, status: str | None, hint: str | None
) -> None:
    """Store the latest official-page read (status None = not read this scan) and, when no
    official page is known yet, the one detected from where the board's postings live."""
    now = now_iso()
    if status is not None:
        conn.execute(
            """UPDATE company_sources SET official_status = %s, official_checked_at = %s
               WHERE id = %s""",
            (status, now, source_id),
        )
    if hint:
        conn.execute(
            """UPDATE company_sources SET official_careers_url = %s,
                 official_careers_origin = 'detected', updated_at = %s
               WHERE id = %s AND official_careers_url IS NULL""",
            (hint, now, source_id),
        )


def official_page_due(target: SourceTarget) -> bool:
    """Read the official page on this scan? Always when it last worked or was never read;
    weekly when it had no job data or robots.txt blocked it. Never for a source that already
    is a career page (`jsonld`)."""
    if not target.official_careers_url or target.provider == "jsonld":
        return False
    if target.official_status in ("no_job_data", "blocked"):
        return not target.official_checked_at or target.official_checked_at < iso_minus(
            OFFICIAL_RECHECK_SECONDS
        )
    return True


def scheduled_source_ids(
    conn: psycopg.Connection, *, shard: int | None, shard_count: int, max_failures: int
) -> list[str]:
    """Enabled sources for a shard (None = all). Sources failing repeatedly are only
    retried once a week until they succeed again. A board is only a fallback: it is left
    out while its company's own careers page (`career_pages`) returned the complete list
    within the last few days (the page crawl then reads the same jobs)."""
    from app.discovery.jobs import career_pages

    params: dict[str, Any] = {
        "max_failures": max_failures,
        "retry_before": iso_minus(RETRY_FAILING_AFTER_SECONDS),
        "covered_after": career_pages.board_cover_cutoff(),
    }
    sql = f"""SELECT id FROM company_sources
             WHERE enabled = 1
               AND (consecutive_failures < %(max_failures)s
                    OR last_run_at IS NULL OR last_run_at < %(retry_before)s)
               AND NOT {career_pages.BOARD_COVERED_SQL}"""
    if shard is not None:
        sql += " AND shard_seed %% %(count)s = %(shard)s"
        params.update(count=shard_count, shard=shard)
    sql += " ORDER BY company_name"
    return [r["id"] for r in conn.execute(sql, params).fetchall()]


def load_target(conn: psycopg.Connection, source_id: str) -> SourceTarget | None:
    row = conn.execute(
        """SELECT id, company_name, provider, token, careers_url, company_id,
                  official_careers_url, official_status, official_checked_at, last_posting_count
           FROM company_sources WHERE id = %s""",
        (source_id,),
    ).fetchone()
    if not row:
        return None
    return SourceTarget(
        id=row["id"],
        company_name=row["company_name"],
        provider=row["provider"],
        token=row["token"],
        careers_url=row["careers_url"],
        company_id=row["company_id"],
        official_careers_url=row["official_careers_url"],
        official_status=row["official_status"],
        official_checked_at=row["official_checked_at"],
        last_posting_count=row["last_posting_count"],
    )


def record_scan(
    conn: psycopg.Connection,
    source_id: str,
    *,
    ok: bool,
    error: str | None,
    counts: dict[str, Any],
    posting_count: int | None = None,
) -> None:
    """Store the outcome. `posting_count` (a successful scan's posting total) is the baseline
    the outage guard compares the next scan against; a failed scan never overwrites it."""
    now = now_iso()
    if ok:
        conn.execute(
            """UPDATE company_sources SET last_run_at = %s, last_success_at = %s, last_error = NULL,
                 consecutive_failures = 0, last_counts_json = %s,
                 last_posting_count = COALESCE(%s, last_posting_count), updated_at = %s
               WHERE id = %s""",
            (now, now, json.dumps(counts), posting_count, now, source_id),
        )
    else:
        conn.execute(
            """UPDATE company_sources SET last_run_at = %s, last_error = %s,
                 consecutive_failures = consecutive_failures + 1, last_counts_json = %s,
                 updated_at = %s WHERE id = %s""",
            (now, (error or "failed")[:500], json.dumps(counts), now, source_id),
        )


def list_sources(conn: psycopg.Connection, *, query: str = "", limit: int = 100, offset: int = 0) -> dict[str, Any]:
    like = f"%{query.strip().lower()}%"
    rows = conn.execute(
        """SELECT id, company_name, provider, token, careers_url, sector, origin, enabled,
                  last_run_at, last_success_at, last_error, consecutive_failures, last_counts_json,
                  official_careers_url, official_careers_origin, official_status,
                  official_checked_at
           FROM company_sources
           WHERE lower(company_name) LIKE %(q)s OR lower(token) LIKE %(q)s
           ORDER BY company_name LIMIT %(limit)s OFFSET %(offset)s""",
        {"q": like, "limit": limit, "offset": offset},
    ).fetchall()
    summary = conn.execute(
        """SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE enabled = 1) AS enabled,
                  COUNT(*) FILTER (WHERE last_error IS NOT NULL AND enabled = 1) AS failing,
                  COUNT(*) FILTER (WHERE last_error LIKE 'No JobPosting%%') AS unsupported,
                  COUNT(*) FILTER (WHERE official_careers_url IS NOT NULL) AS "withOfficialPage",
                  COUNT(*) FILTER (WHERE official_status = 'ok') AS "officialPageReadable"
           FROM company_sources"""
    ).fetchone()
    by_provider = conn.execute(
        "SELECT provider, COUNT(*) AS n FROM company_sources GROUP BY provider ORDER BY n DESC"
    ).fetchall()
    return {
        "sources": [
            {
                "id": r["id"],
                "companyName": r["company_name"],
                "provider": r["provider"],
                "token": r["token"],
                "careersUrl": r["careers_url"],
                "sector": r["sector"],
                "origin": r["origin"],
                "enabled": bool(r["enabled"]),
                "lastRunAt": r["last_run_at"],
                "lastSuccessAt": r["last_success_at"],
                "lastError": r["last_error"],
                "consecutiveFailures": r["consecutive_failures"],
                "lastCounts": json.loads(r["last_counts_json"] or "{}"),
                "officialCareersUrl": r["official_careers_url"],
                "officialCareersOrigin": r["official_careers_origin"],
                "officialStatus": r["official_status"],
                "officialCheckedAt": r["official_checked_at"],
            }
            for r in rows
        ],
        "summary": dict(summary or {}),
        "byProvider": {r["provider"]: r["n"] for r in by_provider},
    }
