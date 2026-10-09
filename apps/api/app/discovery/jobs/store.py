"""Incremental, idempotent writes of one company's postings into shared jobs.

Called right after each company is scanned (not at the end of a run), inside a single
transaction per company:

  new posting        → insert job + job_sources ref (or link to a cross-source duplicate)
  changed content    → update the job in place (never touches expired_at; posted_at only
                       moves earlier; an empty description never overwrites a stored one)
  unchanged          → bump last_seen_at only
  missing from a complete fetch → closed_at set (reopened if it reappears)

Expiry itself is handled by jobs/expiry.py.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass, field

import psycopg

from app.discovery.db import new_id
from app.discovery.jobs.models import NormalizedJob, SourceTarget
from app.discovery.jobs.text import name_key
from app.discovery.timeutil import expiry_cutoff_iso, iso_minus, now_iso

# Another source must have listed the job this recently to keep it open.
OTHER_SOURCE_RECENT_SECONDS = 36 * 3600


@dataclass
class IngestStats:
    inserted: int = 0
    linked: int = 0
    updated: int = 0
    unchanged: int = 0
    closed: int = 0
    reopened: int = 0
    skipped: Counter = field(default_factory=Counter)
    new_job_ids: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "inserted": self.inserted,
            "linked": self.linked,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "closed": self.closed,
            "reopened": self.reopened,
            "skipped": dict(self.skipped),
        }


def ensure_company(conn: psycopg.Connection, name: str) -> str:
    """Find or create a `companies` row by display name (same key rule as the web app)."""
    trimmed = name.strip()[:200] or "Unknown company"
    key = name_key(trimmed)
    row = conn.execute("SELECT id FROM companies WHERE name_key = %s LIMIT 1", (key,)).fetchone()
    if row:
        return row["id"]
    now = now_iso()
    conn.execute(
        """INSERT INTO companies (id, name, name_key, created_at, updated_at)
           VALUES (%s, %s, %s, %s, %s) ON CONFLICT (name_key) DO NOTHING""",
        (new_id(), trimmed, key, now, now),
    )
    return conn.execute("SELECT id FROM companies WHERE name_key = %s", (key,)).fetchone()["id"]


def known_external_ids(conn: psycopg.Connection, provider: str, company_source_id: str) -> frozenset[str]:
    rows = conn.execute(
        "SELECT external_id FROM job_sources WHERE source_key = %s AND company_source_id = %s",
        (provider, company_source_id),
    ).fetchall()
    return frozenset(r["external_id"] for r in rows)


def ingest_company(
    conn: psycopg.Connection,
    target: SourceTarget,
    jobs: list[NormalizedJob],
    *,
    complete: bool,
    scan_started_at: str,
    expiry_days: int,
) -> IngestStats:
    stats = IngestStats()
    provider = target.provider
    now = now_iso()
    cutoff = expiry_cutoff_iso(expiry_days)

    with conn.transaction():
        ids = [j.external_id for j in jobs]
        existing = {
            r["external_id"]: r
            for r in conn.execute(
                """SELECT external_id, job_id, content_hash FROM job_sources
                   WHERE source_key = %s AND external_id = ANY(%s)""",
                (provider, ids),
            ).fetchall()
        }

        new_jobs: list[NormalizedJob] = []
        changed: list[tuple[NormalizedJob, str]] = []
        for job in jobs:
            ref = existing.get(job.external_id)
            if ref is None:
                if job.posted_at and job.posted_at < cutoff:
                    stats.skipped["already_expired"] += 1  # never store dead postings
                    continue
                new_jobs.append(job)
            elif ref["content_hash"] != job.content_hash:
                changed.append((job, ref["job_id"]))
            else:
                stats.unchanged += 1

        company_ids: dict[str, str] = {}

        def company_id_for(name: str) -> str:
            if name not in company_ids:
                company_ids[name] = ensure_company(conn, name)
            return company_ids[name]

        # --- new postings: link to an existing canonical job or insert one ----------
        if new_jobs:
            keys = list({j.dedupe_key for j in new_jobs})
            canonical = {
                r["dedupe_key"]: r["id"]
                for r in conn.execute(
                    """SELECT DISTINCT ON (dedupe_key) dedupe_key, id FROM jobs
                       WHERE user_id IS NULL AND expired_at IS NULL AND dedupe_key = ANY(%s)
                       ORDER BY dedupe_key, first_seen_at""",
                    (keys,),
                ).fetchall()
            }
            job_rows, source_rows, link_dates = [], [], []
            for job in new_jobs:
                job_id = canonical.get(job.dedupe_key)
                if job_id:
                    stats.linked += 1
                    if job.posted_at:
                        link_dates.append({"id": job_id, "p": job.posted_at})
                else:
                    job_id = new_id()
                    canonical[job.dedupe_key] = job_id  # later in-batch duplicates link here
                    stats.inserted += 1
                    stats.new_job_ids.append(job_id)
                    job_rows.append(
                        (
                            job_id, job.title, job.company_name, company_id_for(job.company_name),
                            job.location, job.url, job.description, job.external_id, provider,
                            now, now, job.posted_at, 0 if job.posted_at else 1, now,
                            job.dedupe_key, job.min_years,
                        )
                    )
                source_rows.append(
                    (
                        new_id(), job_id, provider, job.external_id, target.id, job.url,
                        job.content_hash, json.dumps({"companySource": target.token}), now, now,
                    )
                )
            if job_rows:
                with conn.cursor() as cur:
                    cur.executemany(
                        """INSERT INTO jobs
                             (id, user_id, title, company, company_id, location, source, url,
                              description, salary, status, external_id, feed_source, created_at,
                              updated_at, posted_at, posted_at_estimated, first_seen_at,
                              dedupe_key, min_years)
                           VALUES (%s, NULL, %s, %s, %s, %s, 'careers', %s, %s, NULL, 'active',
                                   %s, %s, %s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT DO NOTHING""",
                        job_rows,
                    )
                # A legacy (feed_source, external_id) collision would skip an insert; never
                # leave a source ref pointing at a job that does not exist.
                inserted_ids = {
                    r["id"]
                    for r in conn.execute(
                        "SELECT id FROM jobs WHERE id = ANY(%s)", ([r[0] for r in job_rows],)
                    ).fetchall()
                }
                missing = {r[0] for r in job_rows} - inserted_ids
                if missing:
                    source_rows = [r for r in source_rows if r[1] not in missing]
                    stats.new_job_ids = [i for i in stats.new_job_ids if i not in missing]
                    stats.inserted -= len(missing)
                    stats.skipped["insert_conflict"] += len(missing)
            with conn.cursor() as cur:
                cur.executemany(
                    """INSERT INTO job_sources
                         (id, job_id, source_key, external_id, company_source_id, url,
                          content_hash, metadata_json, first_seen_at, last_seen_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (source_key, external_id) DO NOTHING""",
                    source_rows,
                )
                if link_dates:
                    # A repost never extends a job's life: keep the earliest posting date.
                    cur.executemany(
                        """UPDATE jobs SET posted_at = %(p)s, posted_at_estimated = 0
                           WHERE id = %(id)s AND (posted_at IS NULL OR %(p)s::text < posted_at)""",
                        link_dates,
                    )

        # --- changed postings: update in place ---------------------------------------
        if changed:
            with conn.cursor() as cur:
                cur.executemany(
                    """UPDATE jobs SET
                         title = %(title)s, company = %(company)s, company_id = %(company_id)s,
                         location = %(location)s, url = %(url)s,
                         description = CASE WHEN %(description)s::text = '' THEN description
                                            ELSE %(description)s::text END,
                         posted_at_estimated = CASE WHEN COALESCE(posted_at, %(p)s::text) IS NULL
                                                    THEN 1 ELSE 0 END,
                         posted_at = CASE WHEN %(p)s::text IS NOT NULL
                                           AND (posted_at IS NULL OR %(p)s::text < posted_at)
                                          THEN %(p)s::text ELSE posted_at END,
                         dedupe_key = %(dedupe_key)s, min_years = %(min_years)s,
                         updated_at = %(now)s
                       WHERE id = %(id)s AND user_id IS NULL""",
                    [
                        {
                            "id": job_id, "title": j.title, "company": j.company_name,
                            "company_id": company_id_for(j.company_name), "location": j.location,
                            "url": j.url, "description": j.description, "p": j.posted_at,
                            "dedupe_key": j.dedupe_key, "min_years": j.min_years, "now": now,
                        }
                        for j, job_id in changed
                    ],
                )
                cur.executemany(
                    """UPDATE job_sources SET content_hash = %s, url = %s
                       WHERE source_key = %s AND external_id = %s""",
                    [(j.content_hash, j.url, provider, j.external_id) for j, _ in changed],
                )
            stats.updated = len(changed)

        # --- everything listed now is "seen" ------------------------------------------
        if ids:
            conn.execute(
                """UPDATE job_sources SET last_seen_at = %s, company_source_id = %s
                   WHERE source_key = %s AND external_id = ANY(%s)""",
                (now, target.id, provider, ids),
            )
            reopened = conn.execute(
                """UPDATE jobs SET closed_at = NULL, updated_at = %s
                   WHERE closed_at IS NOT NULL AND user_id IS NULL AND id IN (
                     SELECT job_id FROM job_sources WHERE source_key = %s AND external_id = ANY(%s))""",
                (now, provider, ids),
            )
            stats.reopened = reopened.rowcount or 0

        # --- close jobs this source no longer lists (only after a complete fetch) -------
        if complete:
            closed = conn.execute(
                """UPDATE jobs j SET closed_at = %(now)s, updated_at = %(now)s
                   WHERE j.user_id IS NULL AND j.closed_at IS NULL
                     AND j.id IN (SELECT job_id FROM job_sources
                                  WHERE company_source_id = %(cs)s AND last_seen_at < %(scan)s)
                     AND NOT EXISTS (
                       SELECT 1 FROM job_sources s2
                       WHERE s2.job_id = j.id
                         AND s2.company_source_id IS DISTINCT FROM %(cs)s
                         AND s2.last_seen_at >= %(recent)s)""",
                {
                    "now": now,
                    "cs": target.id,
                    "scan": scan_started_at,
                    "recent": iso_minus(OTHER_SOURCE_RECENT_SECONDS),
                },
            )
            stats.closed = closed.rowcount or 0

    return stats
