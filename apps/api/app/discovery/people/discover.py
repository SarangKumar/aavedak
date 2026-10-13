"""People discovery v2: find real people (recruiters, hiring managers, engineering leads,
founders) at the companies users apply to, from lawful public sources, and merge them into
the global `people` directory with field-level provenance. See DISCOVERY.md.

Per target company (one run item):
  1. Resolve its domain from stored evidence (never guessed from the name).
  2. Company website: team / about / leadership pages (JSON-LD Person + name/title cards),
     robots.txt respected; also the published careers inbox and the GitHub org it links.
  3. GitHub API: the org's *public* members and their public profiles.
  4. Search API (if a key is set): LinkedIn profile URLs + headlines from result titles only.
  5. Providers (if keys are set): Hunter domain search, Apollo people search.
  6. Email pattern from evidence → `inferred` addresses (with MX check), never `verified`.
  7. Merge (LinkedIn → email → GitHub → name+company), record provenance, link to jobs.

Every company has a request budget; items run only under `kinds=[ITEM_KIND]` ticks from the
people cron so the jobs-scan backlog cannot starve them.
"""

from __future__ import annotations

import logging
from typing import Any

import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.jobs.email_extractor import is_application_inbox
from app.discovery.people import emails, quota, targets
from app.discovery.people import store as people_store
from app.discovery.people.candidate import SOURCE_CONFIDENCE, Candidate
from app.discovery.people.domains import (  # re-exported for callers / tests
    company_site_hint,
    follow_link,
    registrable_domain,
    resolve_domain,
    site_inbox,
)
from app.discovery.people.fetch import Fetcher
from app.discovery.people.merge import upsert_candidate
from app.discovery.people.sources import github, providers, search, site
from app.discovery.runs.store import ClaimedItem, ItemOutcome, create_run, refresh_run
from app.discovery.timeutil import now_iso

__all__ = ["company_site_hint", "follow_link", "registrable_domain", "site_inbox"]

logger = logging.getLogger("aavedak.discovery.people")

RUN_KIND = "people_discovery"
ITEM_KIND = "people_discover_target"
LEGACY_ITEM_KIND = "people_discover_company"


def configured_sources(settings: DiscoverySettings) -> dict[str, bool]:
    """Which optional sources have keys (booleans only — never the values)."""
    return {
        "companySite": True,
        "github": True,
        "githubToken": bool(settings.github_token),
        "brave": bool(settings.brave_search_api_key),
        "serpapi": bool(settings.serpapi_key),
        "googleCse": bool(settings.google_cse_key and settings.google_cse_cx),
        "hunter": bool(settings.hunter_api_key),
        "apollo": bool(settings.apollo_api_key),
    }


def retire_legacy_items(conn: psycopg.Connection) -> int:
    """v1 items (one per scan-registry source) never got processed behind the scan backlog;
    close them so their runs finish instead of sitting at "running" forever."""
    rows = conn.execute(
        """UPDATE discovery_run_items SET status = 'failed', last_error = 'superseded by people discovery v2',
             lease_until = NULL, updated_at = %s
           WHERE kind = %s AND status IN ('pending', 'running')
           RETURNING run_id""",
        (now_iso(), LEGACY_ITEM_KIND),
    ).fetchall()
    run_ids = {r["run_id"] for r in rows}
    for run_id in run_ids:
        refresh_run(conn, run_id)
    return len(rows)


def create_discovery_run(
    conn: psycopg.Connection,
    settings: DiscoverySettings,
    *,
    created_by: str | None,
    run_key: str | None = None,
    company_ids: list[str] | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    """Queue the due target companies (or the given ones). Idempotent per `run_key`."""
    retired = retire_legacy_items(conn)
    if run_key:
        existing = conn.execute("SELECT * FROM discovery_runs WHERE run_key = %s", (run_key,)).fetchone()
        if existing:
            return {"runId": existing["id"], "created": False, "companies": existing["total_items"], "retired": retired}
    rows = targets.due_targets(conn, limit=limit or settings.people_companies_per_run, company_ids=company_ids)
    run, created = create_run(
        conn,
        kind=RUN_KIND,
        run_key=run_key,
        items=[(ITEM_KIND, r["id"], {"name": r["name"]}) for r in rows],
        created_by=created_by,
    )
    if created and rows:
        targets.claim(conn, [r["id"] for r in rows])
    return {"runId": run["id"], "created": created, "companies": len(rows), "retired": retired}


def _known_evidence(conn: psycopg.Connection, company_id: str, domain: str) -> list[tuple[str, str]]:
    """(name, email) pairs already stored for this company that are not inferred."""
    rows = conn.execute(
        """SELECT p.name, c.value_key AS email FROM people p
           JOIN person_contacts c ON c.person_id = p.id AND c.kind = 'email'
           WHERE p.company_id = %s AND c.verification <> 'inferred' AND c.value_key LIKE %s""",
        (company_id, f"%@{domain}"),
    ).fetchall()
    return [(r["name"], r["email"]) for r in rows]


def _store_pattern(conn: psycopg.Connection, domain: str, pattern: str, count: int, confidence: int, source: str, mx_ok: bool | None) -> None:
    conn.execute(
        """INSERT INTO company_email_patterns (domain, pattern, evidence_count, confidence, source, mx_ok, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (domain) DO UPDATE SET pattern = EXCLUDED.pattern, evidence_count = EXCLUDED.evidence_count,
             confidence = EXCLUDED.confidence, source = EXCLUDED.source, mx_ok = EXCLUDED.mx_ok,
             updated_at = EXCLUDED.updated_at""",
        (domain, pattern, count, confidence, source, None if mx_ok is None else int(mx_ok), now_iso()),
    )


def _choose(candidates: list[tuple[str, str, str | None]]) -> tuple[str, str, str | None] | None:
    """Pick one `(email, source, provenance_url)` recruiting inbox: the first clear
    application inbox; a personal-looking address is never chosen here."""
    seen: set[str] = set()
    for email, source, prov in candidates:
        key = email.lower()
        if key in seen or not is_application_inbox(email):
            continue
        seen.add(key)
        return email, source, prov
    return None


def _published_job_emails(conn: psycopg.Connection, company_id: str) -> list[str]:
    rows = conn.execute(
        """SELECT DISTINCT apply_email FROM jobs
           WHERE company_id = %s AND user_id IS NULL AND apply_email IS NOT NULL
             AND expired_at IS NULL AND closed_at IS NULL""",
        (company_id,),
    ).fetchall()
    return [r["apply_email"] for r in rows if r["apply_email"]]


def discover_company(
    conn: psycopg.Connection, settings: DiscoverySettings, fetcher: Fetcher, company_id: str, company_name: str
) -> tuple[dict[str, Any], str | None, str | None]:
    """Collect and merge people for one company. Returns (counts, domain, github org)."""
    counts: dict[str, Any] = {
        "created": 0, "enriched": 0, "unchanged": 0, "ambiguous": 0,
        "site": 0, "github": 0, "search": 0, "hunter": 0, "apollo": 0,
        "emailsPublished": 0, "emailsInferred": 0, "inbox": 0, "pages": 0, "requests": 0, "relevanceLinks": 0,
    }
    state = targets.cached_state(conn, company_id) or {}
    domain = state.get("domain")
    if not domain:
        domain, _how = resolve_domain(conn, company_id)
    org = state.get("github_org")
    candidates: list[Candidate] = []
    evidence: list[tuple[str, str]] = []
    hunter_pattern: str | None = None

    site_result = site.SiteResult()
    if domain:
        site_result = site.discover(fetcher, domain, max_pages=settings.people_site_pages)
        candidates += site_result.candidates
        evidence += site_result.evidence
        counts["site"] = len(site_result.candidates)
        counts["pages"] = site_result.pages

    guard = quota.GitHubGuard(conn, settings.github_min_remaining)
    if not org and not fetcher.exhausted:
        found = github.find_org(fetcher, token=settings.github_token or None, domain=domain,
                                hint=site_result.github_org, company=company_name, guard=guard)
        if found:
            org = found[0]
            domain = domain or found[1]
    if org and not fetcher.exhausted:
        members = github.members(fetcher, token=settings.github_token or None, org=org, company=company_name,
                                 limit=settings.people_github_members, guard=guard)
        candidates += members
        counts["github"] = len(members)

    keys = {
        "brave": settings.brave_search_api_key or None,
        "serpapi": settings.serpapi_key or None,
        "google_key": settings.google_cse_key or None,
        "google_cx": settings.google_cse_cx or None,
    }
    if any(keys.values()) and not fetcher.exhausted:
        cse_gate = quota.CseQuota(conn, settings.google_cse_daily_query_cap)
        _provider, hits = search.discover(fetcher, keys, company_name, limit=settings.people_search_results,
                                          cse_allowed=cse_gate)
        counts["cseCapReached"] = int(cse_gate.denied)
        candidates += hits
        counts["search"] = len(hits)

    if domain and settings.hunter_api_key and not fetcher.exhausted:
        hunter_pattern, hunter_people = providers.hunter(fetcher, settings.hunter_api_key, domain)
        candidates += hunter_people
        counts["hunter"] = len(hunter_people)
    if domain and settings.apollo_api_key and not fetcher.exhausted:
        apollo_people = providers.apollo(fetcher, settings.apollo_api_key, domain)
        candidates += apollo_people
        counts["apollo"] = len(apollo_people)

    # Email pattern: published pairs (site, GitHub profiles, providers, already stored).
    pattern = None
    if domain:
        evidence += [(c.name, c.email) for c in candidates if c.email and c.email_status in ("published", "provider")]
        evidence += _known_evidence(conn, company_id, domain)
        inferred = emails.infer_pattern(evidence, domain)
        if inferred is None and hunter_pattern:
            inferred = (hunter_pattern, 0, 60)
            pattern_source = "hunter"
        else:
            pattern_source = "evidence"
        if inferred:
            pattern, count, pattern_conf = inferred
            mx_ok = emails.mx_lookup(fetcher, domain) if not fetcher.exhausted else None
            if mx_ok is not False:
                for cand in candidates:
                    if cand.email or cand.is_inbox:
                        continue
                    address = emails.render(pattern, cand.name, domain)
                    if address:
                        cand.email, cand.email_status = address, "inferred"
                        cand.email_confidence = emails.inferred_confidence(pattern_conf, mx_ok)
            _store_pattern(conn, domain, pattern, count, pattern_conf, pattern_source, mx_ok)

    inbox_options = [(e, "job_posting", None) for e in _published_job_emails(conn, company_id)]
    if site_result.inbox:
        inbox_options.append((site_result.inbox[0], "company_site", site_result.inbox[1]))
    chosen = _choose(inbox_options)
    if chosen:
        inbox, _src, page = chosen
        candidates.append(Candidate(
            name=f"{company_name} — Careers", source="careers_inbox", source_url=page,
            title="Careers / recruiting inbox", email=inbox, email_status="published",
            email_confidence=SOURCE_CONFIDENCE["careers_inbox"], confidence=SOURCE_CONFIDENCE["careers_inbox"],
            is_inbox=True,
        ))
        counts["inbox"] = 1

    counts["requests"] = fetcher.used
    counts["githubPaused"] = int(guard.paused)
    with conn.transaction():
        person_ids: list[str] = []
        for cand in candidates:
            outcome = upsert_candidate(conn, cand, company_id=company_id, company_name=company_name, domain=domain)
            counts[outcome.action] += 1
            counts["ambiguous"] += int(outcome.ambiguous)
            if cand.email:
                counts["emailsInferred" if cand.email_status == "inferred" else "emailsPublished"] += 1
            person_ids.append(outcome.person_id)
        counts["relevanceLinks"] = people_store.link_person_to_company_jobs(conn, sorted(set(person_ids)))
    counts["pattern"] = pattern
    return counts, domain, org


def process_items(
    conn: psycopg.Connection, settings: DiscoverySettings, items: list[ClaimedItem]
) -> dict[str, ItemOutcome]:
    outcomes: dict[str, ItemOutcome] = {}
    for item in items:
        company = conn.execute("SELECT id, name FROM companies WHERE id = %s", (item.ref_id,)).fetchone()
        if company is None:
            outcomes[item.id] = ItemOutcome(True, {"skipped": 1, "reason": "company_removed"})
            continue
        with Fetcher(
            user_agent=settings.discovery_user_agent,
            budget=settings.people_requests_per_company,
            host_delay=settings.people_host_delay_seconds,
        ) as fetcher:
            try:
                counts, domain, org = discover_company(conn, settings, fetcher, company["id"], company["name"])
            except psycopg.Error as exc:
                outcomes[item.id] = ItemOutcome(False, {}, f"Database error: {exc.__class__.__name__}: {exc}"[:300])
                continue
            except Exception as exc:  # noqa: BLE001 - one bad company never stops the run
                logger.exception("people discovery failed for %s", company["name"])
                targets.finish(conn, company["id"], domain=None, github_org=None, counts={},
                               refresh_days=settings.people_refresh_days, error=str(exc)[:300])
                outcomes[item.id] = ItemOutcome(False, {}, f"{exc.__class__.__name__}: {exc}"[:300])
                continue
        targets.finish(conn, company["id"], domain=domain, github_org=org, counts=counts,
                       refresh_days=settings.people_refresh_days)
        result = {k: v for k, v in counts.items() if isinstance(v, (int, float))}
        outcomes[item.id] = ItemOutcome(True, result)
    return outcomes


def stats(conn: psycopg.Connection, settings: DiscoverySettings) -> dict[str, Any]:
    people = conn.execute(
        """SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE origin = 'system')::int AS discovered,
                  COUNT(*) FILTER (WHERE linkedin_url_normalized IS NOT NULL)::int AS with_linkedin,
                  COUNT(*) FILTER (WHERE github_login IS NOT NULL)::int AS with_github,
                  COUNT(*) FILTER (WHERE email IS NOT NULL)::int AS with_email,
                  COUNT(*) FILTER (WHERE role_title IS NOT NULL)::int AS with_title,
                  COUNT(*) FILTER (WHERE location IS NOT NULL)::int AS with_location,
                  COUNT(*) FILTER (WHERE last_seen_at >= %s)::int AS seen_last_7d
           FROM people WHERE status = 'active'""",
        (_days_ago(7),),
    ).fetchone()
    by_source = conn.execute(
        """SELECT source, COUNT(DISTINCT person_id)::int AS n FROM person_field_sources GROUP BY source ORDER BY n DESC"""
    ).fetchall()
    emails_by = conn.execute(
        """SELECT verification, COUNT(*)::int AS n FROM person_contacts WHERE kind = 'email' GROUP BY verification"""
    ).fetchall()
    patterns = conn.execute("SELECT COUNT(*)::int AS n FROM company_email_patterns").fetchone()["n"]
    last_run = conn.execute(
        "SELECT id, status, created_at, finished_at, total_items, done_items, failed_items FROM discovery_runs WHERE kind = %s ORDER BY created_at DESC LIMIT 1",
        (RUN_KIND,),
    ).fetchone()
    open_items = conn.execute(
        "SELECT COUNT(*)::int AS n FROM discovery_run_items WHERE kind = %s AND status IN ('pending', 'running')",
        (ITEM_KIND,),
    ).fetchone()["n"]
    return {
        "people": {
            "total": people["total"], "discovered": people["discovered"], "withLinkedin": people["with_linkedin"],
            "withGithub": people["with_github"], "withEmail": people["with_email"], "withTitle": people["with_title"],
            "withLocation": people["with_location"], "seenLast7Days": people["seen_last_7d"],
        },
        "bySource": {r["source"]: r["n"] for r in by_source},
        "emails": {r["verification"]: r["n"] for r in emails_by},
        "emailPatterns": patterns,
        "targets": targets.target_counts(conn),
        "openItems": open_items,
        "lastRun": dict(last_run) if last_run else None,
        "sources": configured_sources(settings),
        "quotas": {
            "googleCse": {
                "usedToday": quota.used(conn, "google_cse", quota.pacific_day()),
                "cap": settings.google_cse_daily_query_cap,
                "day": quota.pacific_day(),
            },
        },
        "limits": {
            "companiesPerRun": settings.people_companies_per_run,
            "requestsPerCompany": settings.people_requests_per_company,
            "refreshDays": settings.people_refresh_days,
        },
    }


def _days_ago(days: int) -> str:
    from app.discovery.timeutil import iso_plus

    return iso_plus(-days * 86400)
