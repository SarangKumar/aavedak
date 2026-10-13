"""Merge discovered candidates into the global `people` table with field-level provenance.

Matching order (first hit wins): normalized LinkedIn URL → email (person or shared contact)
→ GitHub login → name + company. A name + company match whose stored LinkedIn / email /
GitHub conflicts with the candidate is *not* merged — two different people are never fused.

Updates only fill empty fields, so anything a user typed always wins; every value any source
reported is still recorded in `person_field_sources` (field, value, source, URL, confidence,
first/last seen). Inferred addresses live only in `person_contacts` as `inferred`; the
person's primary `email` is only ever a published or provider-reported address. Nothing here
ever writes `verified`.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg

from app.discovery.db import new_id
from app.discovery.jobs.locations import canonical_location
from app.discovery.people.candidate import Candidate
from app.discovery.people.classify import department, seniority
from app.discovery.people.normalize import normalize_email, normalize_linkedin, person_dedupe_key
from app.discovery.timeutil import now_iso


@dataclass
class MergeOutcome:
    person_id: str
    action: str  # created | enriched | unchanged
    ambiguous: bool = False


def _github_url(login: str | None) -> str | None:
    return f"https://github.com/{login}" if login else None


def _location(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return canonical_location(raw) or raw.strip()[:120]
    except Exception:  # noqa: BLE001 - a bad location never blocks a merge
        return raw.strip()[:120]


def find_person(
    conn: psycopg.Connection, *, linkedin: str | None, email: str | None, github: str | None, dedupe: str
) -> tuple[dict | None, bool]:
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
    if github:
        row = conn.execute("SELECT * FROM people WHERE lower(github_login) = %s", (github,)).fetchone()
        if row:
            return row, False
    row = conn.execute(
        "SELECT * FROM people WHERE dedupe_key = %s AND status = 'active' ORDER BY created_at LIMIT 1", (dedupe,)
    ).fetchone()
    if row:
        conflicting = (
            (linkedin and row.get("linkedin_url_normalized") and row["linkedin_url_normalized"] != linkedin)
            or (email and row.get("email") and row["email"].lower() != email)
            or (github and row.get("github_login") and row["github_login"].lower() != github)
        )
        if conflicting:
            return None, True
        return row, False
    return None, False


def record_field(
    conn: psycopg.Connection, person_id: str, field: str, value: str, *, source: str, url: str | None, confidence: int, now: str
) -> None:
    conn.execute(
        """INSERT INTO person_field_sources
             (person_id, field, value, source, source_url, confidence, first_seen_at, last_seen_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (person_id, field, source, value) DO UPDATE SET
             last_seen_at = EXCLUDED.last_seen_at,
             confidence = GREATEST(person_field_sources.confidence, EXCLUDED.confidence),
             source_url = COALESCE(EXCLUDED.source_url, person_field_sources.source_url)""",
        (person_id, field, value[:500], source, url, confidence, now, now),
    )


def add_contact(
    conn: psycopg.Connection, person_id: str, kind: str, value: str, value_key: str, *,
    source: str, url: str | None, verification: str, confidence: int | None, now: str,
) -> None:
    if verification not in ("unverified", "inferred"):
        raise ValueError("people discovery never writes verified contacts")
    conn.execute(
        """INSERT INTO person_contacts
             (id, person_id, kind, value, value_key, source, provenance_url, verification,
              added_by_user_id, visibility, created_at, updated_at, confidence)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, 'shared', %s, %s, %s)
           ON CONFLICT (person_id, kind, value_key) DO UPDATE SET
             confidence = GREATEST(COALESCE(person_contacts.confidence, 0), COALESCE(EXCLUDED.confidence, 0)),
             verification = CASE
               WHEN person_contacts.verification = 'verified' THEN 'verified'
               WHEN EXCLUDED.verification = 'unverified' THEN 'unverified'
               ELSE person_contacts.verification END,
             provenance_url = COALESCE(person_contacts.provenance_url, EXCLUDED.provenance_url),
             updated_at = EXCLUDED.updated_at""",
        (new_id(), person_id, kind, value, value_key, source, url, verification, now, now, confidence),
    )


def upsert_candidate(
    conn: psycopg.Connection, cand: Candidate, *, company_id: str, company_name: str, domain: str | None
) -> MergeOutcome:
    now = now_iso()
    email = normalize_email(cand.email)
    inferred = cand.email_status == "inferred"
    primary_email = None if inferred else email
    linkedin = normalize_linkedin(cand.linkedin)
    github = (cand.github_login or "").lower() or None
    dedupe = person_dedupe_key(cand.name, company_name)
    existing, ambiguous = find_person(conn, linkedin=linkedin, email=email, github=github, dedupe=dedupe)
    title = (cand.title or "").strip()[:200] or None
    values = {
        "email": primary_email,
        "company": company_name,
        "company_id": company_id,
        "role": title,
        "seniority": seniority(title),
        "department": department(title),
        "domain": domain,
        "location": _location(cand.location),
        "github_login": cand.github_login,
        "github_url": _github_url(cand.github_login),
        "website": cand.website,
        "twitter": cand.twitter,
        "phone": cand.phone,
        "confidence": cand.confidence,
        "source": cand.source,
        "dedupe": dedupe,
        "linkedin": linkedin,
        "now": now,
    }

    if existing is None:
        person_id = new_id()
        conn.execute(
            """INSERT INTO people
                 (id, user_id, name, email, company, role_title, notes, application_id, status,
                  created_at, updated_at, company_id, origin, dedupe_key, linkedin_url_normalized,
                  seniority, department, company_domain, location, github_login, github_url,
                  website_url, twitter_url, phone, confidence, last_seen_at, discovery_source)
               VALUES (%(id)s, NULL, %(name)s, %(email)s, %(company)s, %(role)s, NULL, NULL, 'active',
                  %(now)s, %(now)s, %(company_id)s, 'system', %(dedupe)s, %(linkedin)s,
                  %(seniority)s, %(department)s, %(domain)s, %(location)s, %(github_login)s, %(github_url)s,
                  %(website)s, %(twitter)s, %(phone)s, %(confidence)s, %(now)s, %(source)s)""",
            {**values, "id": person_id, "name": cand.name},
        )
        action = "created"
    else:
        person_id = existing["id"]
        before = conn.execute(
            """SELECT md5(concat_ws('|', email, company_id, role_title, seniority, department, company_domain,
                 location, github_login, website_url, twitter_url, phone, linkedin_url_normalized)) AS h
               FROM people WHERE id = %s""",
            (person_id,),
        ).fetchone()["h"]
        conn.execute(
            """UPDATE people SET
                 email = COALESCE(email, %(email)s),
                 company = COALESCE(company, %(company)s),
                 company_id = COALESCE(company_id, %(company_id)s),
                 role_title = COALESCE(role_title, %(role)s),
                 seniority = COALESCE(seniority, %(seniority)s),
                 department = COALESCE(department, %(department)s),
                 company_domain = COALESCE(company_domain, %(domain)s),
                 location = COALESCE(location, %(location)s),
                 github_login = COALESCE(github_login, CASE WHEN NOT EXISTS
                   (SELECT 1 FROM people o WHERE lower(o.github_login) = lower(%(github_login)s::text)) THEN %(github_login)s END),
                 github_url = COALESCE(github_url, %(github_url)s),
                 website_url = COALESCE(website_url, %(website)s),
                 twitter_url = COALESCE(twitter_url, %(twitter)s),
                 phone = COALESCE(phone, %(phone)s),
                 dedupe_key = COALESCE(dedupe_key, %(dedupe)s),
                 linkedin_url_normalized = COALESCE(linkedin_url_normalized, CASE WHEN NOT EXISTS
                   (SELECT 1 FROM people o WHERE o.linkedin_url_normalized = %(linkedin)s) THEN %(linkedin)s END),
                 confidence = GREATEST(COALESCE(confidence, 0), %(confidence)s),
                 discovery_source = COALESCE(discovery_source, %(source)s),
                 last_seen_at = %(now)s
               WHERE id = %(id)s""",
            {**values, "id": person_id},
        )
        after = conn.execute(
            """SELECT md5(concat_ws('|', email, company_id, role_title, seniority, department, company_domain,
                 location, github_login, website_url, twitter_url, phone, linkedin_url_normalized)) AS h
               FROM people WHERE id = %s""",
            (person_id,),
        ).fetchone()["h"]
        action = "enriched" if after != before else "unchanged"
        if action == "enriched":
            conn.execute("UPDATE people SET updated_at = %s WHERE id = %s", (now, person_id))

    # Provenance for every reported value, including ones that did not overwrite anything.
    url = cand.source_url
    for field, value in cand.fields().items():
        if not value or (field == "email" and inferred):
            continue
        record_field(conn, person_id, field, str(value), source=cand.source, url=url, confidence=cand.confidence, now=now)
    if email:
        add_contact(
            conn, person_id, "email", email, email,
            source="email_pattern" if inferred else cand.source, url=url,
            verification="inferred" if inferred else "unverified",
            confidence=cand.email_confidence or cand.confidence, now=now,
        )
        if inferred:
            record_field(conn, person_id, "email", email, source="email_pattern", url=None,
                         confidence=cand.email_confidence or 0, now=now)
    if linkedin:
        add_contact(conn, person_id, "linkedin", f"https://www.{linkedin}", linkedin, source=cand.source,
                    url=url, verification="unverified", confidence=cand.confidence, now=now)
    if cand.phone:
        key = "".join(ch for ch in cand.phone if ch.isdigit() or ch == "+")
        add_contact(conn, person_id, "phone", cand.phone, key, source=cand.source, url=url,
                    verification="unverified", confidence=cand.confidence, now=now)
    return MergeOutcome(person_id, action, ambiguous)
