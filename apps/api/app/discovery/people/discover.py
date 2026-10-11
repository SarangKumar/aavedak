"""Automatic people discovery: find a company's *published* recruiting inbox and keep it
as a shared contact, so users have an email to reach out to without any CSV.

Published-only, by policy (see DISCOVERY.md): the email must actually appear in a public
source. Two sources are used, both already public:

  * the application emails already extracted from that company's job postings
    (`jobs.apply_email`), and
  * a single fetch of the company's own careers page (`company_sources.careers_url`) — one
    page per company, no crawling of other paths, robots left untouched.

An address is kept only when its local part marks it as an application / recruiting inbox
(`careers@`, `jobs@`, `hr@`, …); a personal-looking address is never captured. The inbox is
stored as a clearly-labelled company contact ("<Company> — Careers"), never as a real named
person, and always `unverified`. Emails are never inferred or guessed, and no third-party or
social site is scraped.
"""

from __future__ import annotations

from typing import Any

import httpx
import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.jobs import registry
from app.discovery.jobs.email_extractor import best_application_email, is_application_inbox
from app.discovery.jobs.providers.base import make_client
from app.discovery.jobs.text import html_to_text
from app.discovery.people import store as people_store
from app.discovery.people.normalize import PersonRow
from app.discovery.runs.store import ClaimedItem, ItemOutcome, create_run

RUN_KIND = "people_discovery"
ITEM_KIND = "people_discover_company"

# A careers page is HTML/text; skip anything else (PDFs, redirects to apps) outright.
_TEXT_TYPES = ("text/html", "application/xhtml", "text/plain")


def create_discovery_run(
    conn: psycopg.Connection,
    settings: DiscoverySettings,
    *,
    created_by: str | None,
    run_key: str | None = None,
    source_ids: list[str] | None = None,
) -> dict[str, Any]:
    """One run item per enabled company source. Idempotent per `run_key` (daily cron)."""
    ids = source_ids or registry.scheduled_source_ids(
        conn,
        shard=None,
        shard_count=settings.discovery_shards,
        max_failures=settings.discovery_max_failures,
    )
    run, created = create_run(
        conn,
        kind=RUN_KIND,
        run_key=run_key,
        items=[(ITEM_KIND, source_id, {}) for source_id in ids],
        created_by=created_by,
    )
    return {"runId": run["id"], "created": created, "companies": len(ids)}


def _page_email(client: httpx.Client, url: str) -> str | None:
    """Best published application inbox on a single careers page, or None. Never raises."""
    try:
        resp = client.get(url, follow_redirects=True)
        resp.raise_for_status()
    except (httpx.HTTPError, ValueError):
        return None
    ctype = resp.headers.get("content-type", "").lower()
    if ctype and not any(t in ctype for t in _TEXT_TYPES):
        return None
    return best_application_email(html_to_text(resp.text))


def _published_job_emails(conn: psycopg.Connection, company_id: str | None) -> list[str]:
    if not company_id:
        return []
    rows = conn.execute(
        """SELECT DISTINCT apply_email FROM jobs
           WHERE company_id = %s AND user_id IS NULL AND apply_email IS NOT NULL
             AND expired_at IS NULL AND closed_at IS NULL""",
        (company_id,),
    ).fetchall()
    return [r["apply_email"] for r in rows if r["apply_email"]]


def _choose(candidates: list[tuple[str, str, str | None]]) -> tuple[str, str, str | None] | None:
    """Pick one `(email, source, provenance_url)`: prefer a clear application inbox, and
    never pick an address that is not one (we don't capture personal mailboxes here)."""
    seen: set[str] = set()
    for email, source, prov in candidates:
        key = email.lower()
        if key in seen or not is_application_inbox(email):
            continue
        seen.add(key)
        return email, source, prov
    return None


def process_items(
    conn: psycopg.Connection, settings: DiscoverySettings, items: list[ClaimedItem]
) -> dict[str, ItemOutcome]:
    outcomes: dict[str, ItemOutcome] = {}
    with make_client() as client:
        for item in items:
            target = registry.load_target(conn, item.ref_id or "")
            if target is None:
                outcomes[item.id] = ItemOutcome(True, {"skipped": 1, "reason": "source_removed"})
                continue
            counts = {
                "jobEmails": 0,
                "pageEmail": 0,
                "created": 0,
                "enriched": 0,
                "unchanged": 0,
                "relevanceLinks": 0,
            }
            # Fetch the page outside the DB transaction so network I/O never holds a lock.
            page_email = _page_email(client, target.careers_url)
            try:
                with conn.transaction():
                    candidates: list[tuple[str, str, str | None]] = []
                    for email in _published_job_emails(conn, target.company_id):
                        candidates.append((email, "job_posting", None))
                    counts["jobEmails"] = len(candidates)
                    if page_email:
                        counts["pageEmail"] = 1
                        candidates.append((page_email, "career_page", target.careers_url))

                    chosen = _choose(candidates)
                    if chosen:
                        email, source, prov = chosen
                        row = PersonRow(
                            name=f"{target.company_name} — Careers",
                            company=target.company_name,
                            role_title="Careers / recruiting inbox",
                            email=email,
                            source_url=prov,
                        )
                        outcome = people_store.upsert_person(
                            conn, row, source=source, company_cache={}
                        )
                        counts[outcome.action] += 1
                        counts["relevanceLinks"] = people_store.link_person_to_company_jobs(
                            conn, [outcome.person_id]
                        )
            except psycopg.Error as exc:
                outcomes[item.id] = ItemOutcome(
                    False, {}, f"Database error: {exc.__class__.__name__}: {exc}"[:300]
                )
                continue
            outcomes[item.id] = ItemOutcome(True, counts)
    return outcomes
