"""`company_sources` registry: seed import, admin import, sharding, and scan status."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psycopg

from app.discovery.db import new_id
from app.discovery.jobs.models import SourceTarget
from app.discovery.jobs.providers import detect_source
from app.discovery.timeutil import iso_minus, now_iso

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "career_sources.json"
RETRY_FAILING_AFTER_SECONDS = 7 * 86_400


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


def import_seed(conn: psycopg.Connection) -> dict[str, int]:
    """Idempotent: existing rows (and admin edits to them) are left untouched. One batched
    statement (pipeline) instead of a round trip per row — the API region may be far from
    the database."""
    seed = load_seed()
    before = conn.execute("SELECT COUNT(*) AS n FROM company_sources").fetchone()["n"]
    now = now_iso()
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO company_sources
                 (id, company_name, provider, token, careers_url, sector, origin, enabled,
                  shard_seed, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, 'seed', 1, %s, %s, %s)
               ON CONFLICT (provider, token) DO NOTHING""",
            [
                (new_id(), row["name"][:200], row["provider"], row["token"], row["careersUrl"],
                 row.get("sector"), shard_seed(row["provider"], row["token"]), now, now)
                for row in seed
            ],
        )
    added = conn.execute("SELECT COUNT(*) AS n FROM company_sources").fetchone()["n"] - before
    return {"added": added, "existing": len(seed) - added}


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


def scheduled_source_ids(
    conn: psycopg.Connection, *, shard: int | None, shard_count: int, max_failures: int
) -> list[str]:
    """Enabled sources for a shard (None = all). Sources failing repeatedly are only
    retried once a week until they succeed again."""
    params: dict[str, Any] = {
        "max_failures": max_failures,
        "retry_before": iso_minus(RETRY_FAILING_AFTER_SECONDS),
    }
    sql = """SELECT id FROM company_sources
             WHERE enabled = 1
               AND (consecutive_failures < %(max_failures)s
                    OR last_run_at IS NULL OR last_run_at < %(retry_before)s)"""
    if shard is not None:
        sql += " AND shard_seed %% %(count)s = %(shard)s"
        params.update(count=shard_count, shard=shard)
    sql += " ORDER BY company_name"
    return [r["id"] for r in conn.execute(sql, params).fetchall()]


def load_target(conn: psycopg.Connection, source_id: str) -> SourceTarget | None:
    row = conn.execute(
        """SELECT id, company_name, provider, token, careers_url, company_id
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
    )


def record_scan(
    conn: psycopg.Connection, source_id: str, *, ok: bool, error: str | None, counts: dict[str, Any]
) -> None:
    now = now_iso()
    if ok:
        conn.execute(
            """UPDATE company_sources SET last_run_at = %s, last_success_at = %s, last_error = NULL,
                 consecutive_failures = 0, last_counts_json = %s, updated_at = %s WHERE id = %s""",
            (now, now, json.dumps(counts), now, source_id),
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
                  last_run_at, last_success_at, last_error, consecutive_failures, last_counts_json
           FROM company_sources
           WHERE lower(company_name) LIKE %(q)s OR lower(token) LIKE %(q)s
           ORDER BY company_name LIMIT %(limit)s OFFSET %(offset)s""",
        {"q": like, "limit": limit, "offset": offset},
    ).fetchall()
    summary = conn.execute(
        """SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE enabled = 1) AS enabled,
                  COUNT(*) FILTER (WHERE last_error IS NOT NULL AND enabled = 1) AS failing,
                  COUNT(*) FILTER (WHERE last_error LIKE 'No JobPosting%%') AS unsupported
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
            }
            for r in rows
        ],
        "summary": dict(summary or {}),
        "byProvider": {r["provider"]: r["n"] for r in by_provider},
    }
