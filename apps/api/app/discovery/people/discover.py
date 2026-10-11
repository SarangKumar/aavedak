"""Automatic people discovery: find a company's *published* recruiting inbox and keep it
as a shared contact, so users have an email to reach out to without any CSV.

Published-only, by policy (see DISCOVERY.md): the email must actually appear in a public
source. Sources, in order, all already public:

  * the application emails already extracted from that company's job postings
    (`jobs.apply_email`);
  * the company's job board page (`company_sources.careers_url`), one fetch;
  * the company's own website: its official careers page when known, else the site the job
    board / postings link to (`company_site_hint`). At most two pages there — that page, then
    one same-site careers / jobs / contact page linked from it — with robots.txt respected.
    An address found on the site must be on the company's own domain.

An address is kept only when its local part marks it as an application / recruiting inbox
(`careers@`, `jobs@`, `hr@`, …); a personal-looking address is never captured. The inbox is
stored as a clearly-labelled company contact ("<Company> — Careers"), never as a real named
person, and always `unverified`. Emails are never inferred or guessed, and no third-party or
social site is scraped.
"""

from __future__ import annotations

from typing import Any

import re
from collections import Counter
from html import unescape
from urllib.parse import urljoin, urlparse

import httpx
import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.jobs import registry
from app.discovery.jobs.email_extractor import best_application_email, is_application_inbox
from app.discovery.jobs.providers.base import make_client
from app.discovery.jobs.providers.jsonld import robots_allows
from app.discovery.jobs.text import html_to_text
from app.discovery.people import store as people_store
from app.discovery.people.normalize import PersonRow
from app.discovery.runs.store import ClaimedItem, ItemOutcome, create_run

RUN_KIND = "people_discovery"
ITEM_KIND = "people_discover_company"

# A careers page is HTML/text; skip anything else (PDFs, redirects to apps) outright.
_TEXT_TYPES = ("text/html", "application/xhtml", "text/plain")

# Company-site pages get a short timeout so one slow site can't eat a worker tick.
_SITE_TIMEOUT = httpx.Timeout(8.0, connect=5.0)

# Hosts that are never the company's own site: hiring platforms, social networks, and the
# trackers / CDNs / consent tools that show up as links on board pages.
_NOT_COMPANY_HOST = re.compile(
    r"(^|\.)(greenhouse\.io|greenhouse\.com|ashbyhq\.com|lever\.co|smartrecruiters\.com|"
    r"workable\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|"
    r"youtube\.com|tiktok\.com|medium\.com|github\.com|glassdoor\.[a-z.]+|indeed\.[a-z.]+|"
    r"google\.[a-z.]+|googleapis\.com|gstatic\.com|cloudfront\.net|amazonaws\.com|"
    r"cloudflare\.com|jsdelivr\.net|unpkg\.com|w3\.org|schema\.org|apple\.com|"
    r"microsoft\.com|onetrust\.com|cookielaw\.org|hotjar\.com|sentry\.io|segment\.com|"
    r"eeoc\.gov|dol\.gov|bit\.ly|wikipedia\.org|crunchbase\.com)$",
    re.I,
)
_HREF = re.compile(r"""<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a>""", re.I | re.S)
_ABS_URL = re.compile(r"https?://[^\s\"'<>)]+", re.I)
_MAILTO = re.compile(r"""mailto:([^"'?\s>]+)""", re.I)
_TAG = re.compile(r"<[^>]+>")
# Same-site pages worth one more fetch, best first.
_FOLLOW_PRIORITY = (
    re.compile(r"career|jobs?\b|join|work[-_ ]?with|hiring|vacanc", re.I),
    re.compile(r"contact", re.I),
)
# Second-level labels under a two-letter country TLD (company.co.in, company.com.au).
_SECOND_LEVEL = {"co", "com", "org", "net", "ac", "gov", "edu"}


def registrable_domain(host: str) -> str:
    """`careers.withwaymo.com` → `withwaymo.com`; `www.zeta.co.in` → `zeta.co.in`."""
    labels = host.lower().strip(".").split(":")[0].split(".")
    if len(labels) >= 3 and len(labels[-1]) == 2 and labels[-2] in _SECOND_LEVEL:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def _company_host(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower().split(":")[0]
    if parsed.scheme not in ("http", "https") or "." not in host:
        return None
    return None if _NOT_COMPANY_HOST.search(host) else host


def company_site_hint(
    *, board_html: str | None, job_urls: list[str], descriptions: list[str]
) -> str | None:
    """The company's own website, or None — never guessed from the name. Pure.

    Order: where its postings live (when most link off the hiring platform), then the site the
    job board page links to most, then the site most linked from its job descriptions.
    """
    hosts = Counter(h for h in (_company_host(u) for u in job_urls) if h)
    if hosts and job_urls:
        host, count = hosts.most_common(1)[0]
        if count >= 0.5 * len(job_urls):
            return f"https://{host}/"
    # Board page: real links only (<a href>), not <meta>/<script> URLs such as ogp.me.
    board_links = [href for href, _ in _HREF.findall(board_html or "")]
    description_links = _ABS_URL.findall("\n".join(descriptions))
    for links in (board_links, description_links):
        found = Counter(h for h in (_company_host(unescape(u)) for u in links) if h)
        if found:
            return f"https://{found.most_common(1)[0][0]}/"
    return None


def follow_link(html: str, base_url: str) -> str | None:
    """One same-site careers / jobs (else contact) page linked from `html`, or None. Pure."""
    domain = registrable_domain(urlparse(base_url).netloc)
    current = base_url.rstrip("/")
    for pattern in _FOLLOW_PRIORITY:
        matches: list[str] = []
        for href, label in _HREF.findall(html):
            url = urljoin(base_url, unescape(href.strip())).split("#")[0]
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https") or url.rstrip("/") == current:
                continue
            if registrable_domain(parsed.netloc) != domain:
                continue
            if pattern.search(parsed.path) or pattern.search(_TAG.sub(" ", label)):
                matches.append(url)
        if matches:
            # A plain page beats a filtered search URL (`/jobs/search?page=1&…`).
            return next((u for u in matches if not urlparse(u).query), matches[0])
    return None


def site_inbox(html: str, site_url: str) -> str | None:
    """A published application inbox on a company-site page, on the company's own domain.
    Reads visible text and `mailto:` links. Pure."""
    domain = registrable_domain(urlparse(site_url).netloc)
    mailtos = " ".join(unescape(m) for m in _MAILTO.findall(html))
    email = best_application_email(f"{html_to_text(html)}\n{mailtos}")
    if not email or not is_application_inbox(email):
        return None
    return email if registrable_domain(email.rsplit("@", 1)[1]) == domain else None


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


def _get_page(client: httpx.Client, url: str, *, timeout: httpx.Timeout | None = None) -> str | None:
    """HTML/text of one page, or None on any failure. Never raises."""
    try:
        resp = client.get(
            url,
            follow_redirects=True,
            headers={"Accept": "text/html,application/xhtml+xml"},
            **({"timeout": timeout} if timeout else {}),
        )
        resp.raise_for_status()
    except (httpx.HTTPError, ValueError):
        return None
    ctype = resp.headers.get("content-type", "").lower()
    if ctype and not any(t in ctype for t in _TEXT_TYPES):
        return None
    return resp.text


def _company_site_email(client: httpx.Client, site_url: str) -> tuple[str | None, str | None, int]:
    """Read the company site page, then at most one linked careers / contact page.
    Returns (inbox, page it was on, pages read)."""
    pages = 0
    url: str | None = site_url
    for _ in range(2):
        if not url or not robots_allows(client, url):
            break
        html = _get_page(client, url, timeout=_SITE_TIMEOUT)
        pages += 1
        if html is None:
            break
        email = site_inbox(html, url)
        if email:
            return email, url, pages
        url = follow_link(html, url)
    return None, None, pages


def _company_job_links(
    conn: psycopg.Connection, company_id: str | None
) -> tuple[list[str], list[str]]:
    """Posting URLs and descriptions already stored for the company (for the site hint)."""
    if not company_id:
        return [], []
    rows = conn.execute(
        """SELECT url, description FROM jobs
           WHERE company_id = %s AND user_id IS NULL
           ORDER BY created_at DESC LIMIT 40""",
        (company_id,),
    ).fetchall()
    return (
        [r["url"] for r in rows if r["url"]],
        [r["description"] for r in rows if r["description"]],
    )


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
                "siteEmail": 0,
                "sitePages": 0,
                "created": 0,
                "enriched": 0,
                "unchanged": 0,
                "relevanceLinks": 0,
            }
            # Network I/O happens outside the DB transaction so it never holds a lock.
            board_html = _get_page(client, target.careers_url)
            page_email = best_application_email(html_to_text(board_html)) if board_html else None
            site_email: str | None = None
            site_page: str | None = None
            if not page_email:
                job_urls, descriptions = _company_job_links(conn, target.company_id)
                site = target.official_careers_url or company_site_hint(
                    board_html=board_html, job_urls=job_urls, descriptions=descriptions
                )
                if site:
                    site_email, site_page, counts["sitePages"] = _company_site_email(client, site)
            try:
                with conn.transaction():
                    candidates: list[tuple[str, str, str | None]] = []
                    for email in _published_job_emails(conn, target.company_id):
                        candidates.append((email, "job_posting", None))
                    counts["jobEmails"] = len(candidates)
                    if page_email:
                        counts["pageEmail"] = 1
                        candidates.append((page_email, "career_page", target.careers_url))
                    if site_email:
                        counts["siteEmail"] = 1
                        candidates.append((site_email, "company_site", site_page))

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
