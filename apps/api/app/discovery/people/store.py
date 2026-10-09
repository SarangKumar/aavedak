"""People persistence: match → enrich or create, contacts, and job relevance.

Rules:
  * Matching order: normalized LinkedIn URL → email → name + company. A name+company match
    whose stored email/LinkedIn conflicts with the incoming row is *not* merged (counted as
    ambiguous and created separately) — never silently merge two different people.
  * Enrichment only fills empty fields; it never overwrites user-entered data.
  * Imported emails are stored as `unverified`; nothing is ever marked verified here.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg

from app.discovery.db import new_id
from app.discovery.jobs.store import ensure_company
from app.discovery.people.normalize import (
    PersonRow,
    job_relevance,
    normalize_email,
    normalize_linkedin,
    person_dedupe_key,
)
from app.discovery.timeutil import now_iso


@dataclass
class UpsertOutcome:
    person_id: str
    action: str  # created | enriched | unchanged
    ambiguous: bool = False


def backfill_people_keys(conn: psycopg.Connection) -> int:
    """Give legacy / web-created people a company link and a dedupe key so imports enrich
    them instead of creating duplicates. SQL mirrors `name_key` / `person_dedupe_key`."""
    linked = conn.execute(
        """UPDATE people p SET company_id = c.id
           FROM companies c
           WHERE p.company_id IS NULL AND p.company IS NOT NULL
             AND c.name_key = lower(regexp_replace(btrim(p.company), '\\s+', ' ', 'g'))"""
    ).rowcount or 0
    keyed = conn.execute(
        """UPDATE people SET dedupe_key =
             btrim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g')) || '|' ||
             lower(regexp_replace(btrim(COALESCE(company, '')), '\\s+', ' ', 'g'))
           WHERE dedupe_key IS NULL"""
    ).rowcount or 0
    return linked + keyed


def _find(conn: psycopg.Connection, linkedin: str | None, email: str | None, dedupe: str) -> tuple[dict | None, bool]:
    if linkedin:
        row = conn.execute("SELECT * FROM people WHERE linkedin_url_normalized = %s", (linkedin,)).fetchone()
        if row:
            return row, False
    if email:
        row = conn.execute(
            """SELECT p.* FROM people p
               WHERE lower(p.email) = %(e)s
                  OR EXISTS (SELECT 1 FROM person_contacts c
                             WHERE c.person_id = p.id AND c.kind = 'email' AND c.value_key = %(e)s
                               AND c.visibility = 'shared')
               ORDER BY p.created_at LIMIT 1""",
            {"e": email},
        ).fetchone()
        if row:
            return row, False
    row = conn.execute(
        "SELECT * FROM people WHERE dedupe_key = %s AND status = 'active' ORDER BY created_at LIMIT 1", (dedupe,)
    ).fetchone()
    if row:
        conflicting = (linkedin and row["linkedin_url_normalized"] and row["linkedin_url_normalized"] != linkedin) or (
            email and row["email"] and row["email"].lower() != email
        )
        if conflicting:
            return None, True
        return row, False
    return None, False


def add_contact(
    conn: psycopg.Connection,
    person_id: str,
    kind: str,
    value: str,
    value_key: str,
    *,
    source: str,
    provenance_url: str | None,
    added_by: str | None = None,
) -> None:
    now = now_iso()
    conn.execute(
        """INSERT INTO person_contacts
             (id, person_id, kind, value, value_key, source, provenance_url, verification,
              added_by_user_id, visibility, created_at, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, 'unverified', %s, 'shared', %s, %s)
           ON CONFLICT (person_id, kind, value_key) DO NOTHING""",
        (new_id(), person_id, kind, value, value_key, source, provenance_url, added_by, now, now),
    )


def upsert_person(
    conn: psycopg.Connection, row: PersonRow, *, source: str, company_cache: dict[str, str]
) -> UpsertOutcome:
    email = normalize_email(row.email)
    linkedin = normalize_linkedin(row.linkedin)
    company_id = None
    if row.company:
        if row.company not in company_cache:
            company_cache[row.company] = ensure_company(conn, row.company)
        company_id = company_cache[row.company]
    dedupe = person_dedupe_key(row.name, row.company)
    existing, ambiguous = _find(conn, linkedin, email, dedupe)
    now = now_iso()

    if existing is None:
        person_id = new_id()
        conn.execute(
            """INSERT INTO people
                 (id, user_id, name, email, company, role_title, notes, application_id, status,
                  created_at, updated_at, company_id, origin, dedupe_key, linkedin_url_normalized)
               VALUES (%s, NULL, %s, %s, %s, %s, NULL, NULL, 'active', %s, %s, %s, 'system', %s, %s)""",
            (person_id, row.name, email, row.company, row.role_title, now, now, company_id, dedupe, linkedin),
        )
        action = "created"
    else:
        person_id = existing["id"]
        # Fill gaps only — user-entered values always win.
        cur = conn.execute(
            """UPDATE people SET
                 email = COALESCE(email, %(email)s),
                 company = COALESCE(company, %(company)s),
                 company_id = COALESCE(company_id, %(company_id)s),
                 role_title = COALESCE(role_title, %(role)s),
                 dedupe_key = COALESCE(dedupe_key, %(dedupe)s),
                 linkedin_url_normalized = COALESCE(linkedin_url_normalized, %(linkedin)s),
                 updated_at = %(now)s
               WHERE id = %(id)s AND (
                 (email IS NULL AND %(email)s::text IS NOT NULL)
                 OR (company IS NULL AND %(company)s::text IS NOT NULL)
                 OR (company_id IS NULL AND %(company_id)s::text IS NOT NULL)
                 OR (role_title IS NULL AND %(role)s::text IS NOT NULL)
                 OR (linkedin_url_normalized IS NULL AND %(linkedin)s::text IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM people o WHERE o.linkedin_url_normalized = %(linkedin)s)))""",
            {
                "id": person_id, "email": email, "company": row.company, "company_id": company_id,
                "role": row.role_title, "dedupe": dedupe, "linkedin": linkedin, "now": now,
            },
        )
        action = "enriched" if cur.rowcount else "unchanged"

    if email:
        add_contact(conn, person_id, "email", email, email, source=source, provenance_url=row.source_url)
    if linkedin:
        add_contact(conn, person_id, "linkedin", f"https://www.{linkedin}", linkedin, source=source,
                    provenance_url=row.source_url)
    return UpsertOutcome(person_id, action, ambiguous)


def link_person_to_company_jobs(conn: psycopg.Connection, person_ids: list[str]) -> int:
    """Upsert relevance between these people and active shared jobs at their companies."""
    if not person_ids:
        return 0
    pairs = conn.execute(
        """SELECT p.id AS person_id, p.role_title, j.id AS job_id, j.title
           FROM people p
           JOIN jobs j ON j.company_id = p.company_id
           WHERE p.id = ANY(%s) AND p.status = 'active'
             AND j.user_id IS NULL AND j.expired_at IS NULL AND j.closed_at IS NULL""",
        (person_ids,),
    ).fetchall()
    return _upsert_relevance(conn, pairs)


def link_jobs_to_company_people(conn: psycopg.Connection, job_ids: list[str]) -> int:
    """Same, from the job side (called after a scan inserts new jobs)."""
    if not job_ids:
        return 0
    pairs = conn.execute(
        """SELECT p.id AS person_id, p.role_title, j.id AS job_id, j.title
           FROM jobs j
           JOIN people p ON p.company_id = j.company_id AND p.status = 'active'
           WHERE j.id = ANY(%s)""",
        (job_ids,),
    ).fetchall()
    return _upsert_relevance(conn, pairs)


def _upsert_relevance(conn: psycopg.Connection, pairs: list[dict]) -> int:
    if not pairs:
        return 0
    now = now_iso()
    rows = []
    for pair in pairs:
        score, reason = job_relevance(pair["role_title"], pair["title"])
        rows.append((pair["job_id"], pair["person_id"], score, reason, now))
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO job_person_relevance (job_id, person_id, score, reason, updated_at)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (job_id, person_id) DO UPDATE SET
                 score = EXCLUDED.score, reason = EXCLUDED.reason, updated_at = EXCLUDED.updated_at""",
            rows,
        )
    return len(rows)
