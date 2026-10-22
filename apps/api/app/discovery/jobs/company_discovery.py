"""Find companies to scan instead of only reading a hand-curated list.

`discovered_companies` is the candidate ledger. Candidates arrive from three feeds, all of
them data Aavedak already has or already reads:

1. **Cross-company ATS index** — every company Workable's public index reported, with the
   website it publishes (`providers/workable_index.py` → `FetchResult.company_hints`).
2. **The product's own data** — companies users applied to, and companies of shared jobs,
   that have no board source and no careers page yet.
3. **Careers-page embeds** — a page whose crawl found a hiring platform we track but whose
   (platform, token) is not in `company_sources` (`register_embed`, free: no extra request).

Resolving one candidate is one leased run item with a small request budget:

    known domain → try its usual careers paths (robots.txt respected)
                 → read the page's embedded hiring platform  → register a board source
                 → otherwise register the careers page itself
    nothing found → probe likely board tokens on the public ATS APIs (bounded)
    still nothing → status `none`, re-checked after `RECHECK_SECONDS`

Everything registered keeps its provenance (`discovery_source`, `origin = 'discovered'`),
so an admin can see where a company came from and disable it. Nothing is invented: a
careers URL is stored only after it answered 200 with HTML that looks like a careers page.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.db import new_id
from app.discovery.jobs import board_probe, career_pages, registry
from app.discovery.jobs.careers_crawl import (
    PoliteFetcher,
    detect_embeds,
    make_crawl_client,
    registrable_domain,
)
from app.discovery.jobs.text import compact_name_key
from app.discovery.runs.store import ClaimedItem, ItemOutcome
from app.discovery.timeutil import iso_minus, now_iso

logger = logging.getLogger("aavedak.discovery.companies")

ITEM_KIND = "company_discovery"
STATUSES = ("pending", "board", "careers_page", "none", "error")
SOURCES = ("workable_index", "applications", "shared_jobs", "careers_embed")

# A candidate that resolved to nothing is tried again after this long (companies move onto
# a hiring platform, or publish a careers page, over weeks — not days).
RECHECK_SECONDS = 30 * 86_400
MAX_ATTEMPTS = 3
# Per candidate: page fetches (plus robots.txt) and then board-token probes.
PAGE_REQUESTS = 6
PROBE_REQUESTS = 12
# A careers page was found: only the likeliest token is probed, across the platforms.
PROBE_REQUESTS_WITH_PAGE = len(board_probe.PROBE_ORDER)
RESOLVE_SECONDS = 25.0

_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_CAREERS_WORDS = re.compile(
    r"career|job|join|work(?:ing)?[-_ ]?(?:with|at|for)|opportunit|vacanc|talent|hiring|openings|life[-_ ]?at|recruit",
    re.I,
)
_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
_SOFT_404 = re.compile(r"\b404\b|not found|page (?:does not|doesn't) exist|no longer available", re.I)
# Hosts that are a hiring platform or a social network, never a company's own site.
_NOT_A_COMPANY_SITE = re.compile(
    r"(^|\.)(workable\.com|greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|rippling\.com|"
    r"breezy\.hr|personio\.[a-z.]+|teamtailor\.com|myworkdayjobs\.com|icims\.com|taleo\.net|"
    r"linkedin\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|crunchbase\.com|"
    r"glassdoor\.[a-z.]+|indeed\.[a-z.]+|naukri\.com|wellfound\.com|angel\.co|google\.[a-z.]+)$",
    re.I,
)


# --- pure helpers -------------------------------------------------------------------------


def candidate_domain(website: str | None) -> str | None:
    """The registrable domain of a company website, or None when it is not one (a hiring
    platform, a social profile, or not an http(s) URL)."""
    if not website:
        return None
    raw = website.strip()
    if _SCHEME.match(raw) and not raw.lower().startswith(("http://", "https://")):
        return None  # mailto:, tel:, javascript: … are never a company website
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    if parsed.scheme not in ("http", "https") or "." not in parsed.netloc:
        return None
    domain = registrable_domain(raw if "://" in raw else f"https://{raw}")
    if not domain or _NOT_A_COMPANY_SITE.search(domain):
        return None
    return domain[:200]


def careers_url_candidates(domain: str) -> list[str]:
    """The paths companies actually use, most common first. Bounded on purpose."""
    return [
        f"https://{domain}/careers",
        f"https://careers.{domain}/",
        f"https://{domain}/jobs",
        f"https://{domain}/about/careers",
    ]


def looks_like_careers_page(final_url: str, html: str) -> bool:
    """A page that answered 200 HTML and is actually about jobs (not a home page it
    redirected to, and not a soft 404)."""
    match = _TITLE.search(html)
    title = re.sub(r"\s+", " ", match.group(1)).strip()[:200] if match else ""
    if _SOFT_404.search(title):
        return False
    parsed = urlparse(final_url)
    return bool(_CAREERS_WORDS.search(parsed.netloc + parsed.path) or _CAREERS_WORDS.search(title))


# --- the ledger ----------------------------------------------------------------------------


@dataclass(frozen=True)
class Candidate:
    id: str
    name: str
    domain: str | None
    discovery_source: str


def _insert(conn: psycopg.Connection, rows: list[tuple[str, str | None, str]]) -> int:
    """(name, domain, discovery_source) → new ledger rows. Idempotent by company name key:
    a candidate already known (or already a scanned source) is skipped by the caller."""
    if not rows:
        return 0
    now = now_iso()
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO discovered_companies
                 (id, name, name_key, domain, discovery_source, status, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, 'pending', %s, %s)
               ON CONFLICT (name_key) DO UPDATE
                 SET domain = COALESCE(discovered_companies.domain, EXCLUDED.domain),
                     updated_at = EXCLUDED.updated_at""",
            [(new_id(), name[:200], compact_name_key(name), domain, source, now, now) for name, domain, source in rows],
        )
    return len(rows)


def _known_name_keys(conn: psycopg.Connection, names: list[str]) -> set[str]:
    """Name keys already covered: a board source, a careers page, or the ledger."""
    keys = [compact_name_key(n) for n in names]
    if not keys:
        return set()
    rows = conn.execute(
        """SELECT k FROM unnest(%s::text[]) AS k
           WHERE EXISTS (SELECT 1 FROM company_sources s
                         WHERE regexp_replace(lower(s.company_name), '[^a-z0-9]', '', 'g') = k)
              OR EXISTS (SELECT 1 FROM career_pages p
                         WHERE regexp_replace(lower(p.company_name), '[^a-z0-9]', '', 'g') = k)
              OR EXISTS (SELECT 1 FROM discovered_companies d WHERE d.name_key = k)""",
        (keys,),
    ).fetchall()
    return {r["k"] for r in rows}


def record_hints(
    conn: psycopg.Connection, hints: list[tuple[str, str | None]], *, source: str = "workable_index"
) -> int:
    """Candidates a cross-company index reported, minus the ones already covered."""
    pairs = [(name.strip(), candidate_domain(site)) for name, site in hints if name and name.strip()]
    if not pairs:
        return 0
    known = _known_name_keys(conn, [name for name, _ in pairs])
    fresh = [(name, domain, source) for name, domain in pairs if compact_name_key(name) not in known]
    return _insert(conn, fresh)


def collect_from_database(conn: psycopg.Connection, *, limit: int = 50) -> int:
    """Companies the product already knows about but does not scan: the ones users applied
    to first, then companies of shared jobs. Their domain comes from where their postings
    and application links live (never guessed from the name)."""
    from app.discovery.people import domains

    rows = conn.execute(
        """SELECT c.id, c.name,
                  COUNT(DISTINCT a.id) AS applications,
                  COUNT(DISTINCT j.id) AS jobs
           FROM companies c
           LEFT JOIN applications a ON a.company_id = c.id
           LEFT JOIN jobs j ON j.company_id = c.id AND j.user_id IS NULL
                           AND j.expired_at IS NULL AND j.closed_at IS NULL
           WHERE NOT EXISTS (SELECT 1 FROM company_sources s
                             WHERE regexp_replace(lower(s.company_name), '[^a-z0-9]', '', 'g')
                                 = regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g'))
             AND NOT EXISTS (SELECT 1 FROM career_pages p
                             WHERE regexp_replace(lower(p.company_name), '[^a-z0-9]', '', 'g')
                                 = regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g'))
             AND NOT EXISTS (SELECT 1 FROM discovered_companies d
                             WHERE d.name_key = regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g'))
           GROUP BY c.id, c.name
           HAVING COUNT(DISTINCT a.id) > 0 OR COUNT(DISTINCT j.id) > 0
           ORDER BY COUNT(DISTINCT a.id) DESC, COUNT(DISTINCT j.id) DESC
           LIMIT %s""",
        (limit,),
    ).fetchall()
    fresh: list[tuple[str, str | None, str]] = []
    for row in rows:
        domain, _ = domains.resolve_domain(conn, row["id"])
        fresh.append(
            (row["name"], candidate_domain(domain), "applications" if row["applications"] else "shared_jobs")
        )
    return _insert(conn, fresh)


def register_embed(conn: psycopg.Connection, *, company_name: str, provider: str, token: str, careers_url: str) -> str | None:
    """A careers page runs on a hiring platform we track but the board is not registered:
    add it, so the board keeps working if the page later stops publishing job data. Returns
    the new source id, or None when it was already there."""
    existing = conn.execute(
        "SELECT id FROM company_sources WHERE provider = %s AND lower(token) = lower(%s)",
        (provider, token),
    ).fetchone()
    if existing:
        return None
    now = now_iso()
    row = conn.execute(
        """INSERT INTO company_sources
             (id, company_name, provider, token, careers_url, origin, enabled, shard_seed,
              official_careers_url, official_careers_origin, created_at, updated_at)
           VALUES (%s, %s, %s, %s, %s, 'discovered', 1, %s, %s, 'detected', %s, %s)
           ON CONFLICT (provider, token) DO NOTHING
           RETURNING id""",
        (new_id(), company_name[:200], provider, token, careers_url[:2000],
         registry.shard_seed(provider, token), careers_url[:2000], now, now),
    ).fetchone()
    return row["id"] if row else None


def scheduled_ids(conn: psycopg.Connection, *, limit: int) -> list[str]:
    """Candidates due for resolution: never tried first, then ones last tried long ago."""
    rows = conn.execute(
        """SELECT id FROM discovered_companies
           WHERE attempts < %(max_attempts)s
             AND (checked_at IS NULL
                  OR (status IN ('none', 'error') AND checked_at < %(recheck)s))
           ORDER BY checked_at NULLS FIRST, created_at
           LIMIT %(limit)s""",
        {"max_attempts": MAX_ATTEMPTS, "recheck": iso_minus(RECHECK_SECONDS), "limit": limit},
    ).fetchall()
    return [r["id"] for r in rows]


def load(conn: psycopg.Connection, candidate_id: str) -> Candidate | None:
    row = conn.execute(
        "SELECT id, name, domain, discovery_source FROM discovered_companies WHERE id = %s",
        (candidate_id,),
    ).fetchone()
    if not row:
        return None
    return Candidate(row["id"], row["name"], row["domain"], row["discovery_source"])


def _record(
    conn: psycopg.Connection,
    candidate_id: str,
    *,
    status: str,
    domain: str | None = None,
    careers_url: str | None = None,
    ats: str | None = None,
    ats_token: str | None = None,
    source_id: str | None = None,
    page_id: str | None = None,
    error: str | None = None,
) -> None:
    now = now_iso()
    conn.execute(
        """UPDATE discovered_companies SET
             status = %(status)s,
             domain = COALESCE(%(domain)s, domain),
             careers_url = COALESCE(%(careers_url)s, careers_url),
             ats = COALESCE(%(ats)s, ats),
             ats_token = COALESCE(%(ats_token)s, ats_token),
             promoted_source_id = COALESCE(%(source_id)s, promoted_source_id),
             promoted_page_id = COALESCE(%(page_id)s, promoted_page_id),
             last_error = %(error)s,
             attempts = attempts + 1,
             checked_at = %(now)s,
             updated_at = %(now)s
           WHERE id = %(id)s""",
        {
            "id": candidate_id, "status": status, "domain": domain, "careers_url": careers_url,
            "ats": ats, "ats_token": ats_token, "source_id": source_id, "page_id": page_id,
            "error": (error or None) and error[:500], "now": now,
        },
    )


def _add_careers_page(
    conn: psycopg.Connection, *, name: str, careers_url: str, domain: str, source_id: str | None
) -> str | None:
    """Add a verified careers page to the crawl registry (origin `discovered`)."""
    now = now_iso()
    row = conn.execute(
        """INSERT INTO career_pages
             (id, company_name, careers_url, domain, country_focus, tier, origin, enabled,
              shard_seed, company_source_id, verified_at, created_at, updated_at)
           VALUES (%s, %s, %s, %s, 'global', 3, 'discovered', 1, %s, %s, %s, %s, %s)
           ON CONFLICT DO NOTHING
           RETURNING id""",
        (new_id(), name[:200], careers_url[:2000], domain, career_pages.shard_seed(careers_url),
         source_id, now, now, now),
    ).fetchone()
    return row["id"] if row else None


# --- resolution ---------------------------------------------------------------------------


@dataclass
class Resolution:
    status: str
    careers_url: str | None = None
    ats: str | None = None
    ats_token: str | None = None
    requests: int = 0
    error: str | None = None


def resolve(fetcher: PoliteFetcher, candidate: Candidate) -> Resolution:
    """Network-only (no database): find this company's board or careers page.

    A page is read once per candidate path; the first page that looks like a careers page
    wins. Its embedded hiring platform, when we track one, is the better source (a complete
    posting list), so it is preferred over the page itself.
    """
    careers_url: str | None = None
    if candidate.domain:
        for url in careers_url_candidates(candidate.domain):
            if fetcher.requests >= PAGE_REQUESTS or fetcher.time_left() < 5:
                break
            if not fetcher.allowed(url):
                continue
            try:
                response = fetcher.get(url)
            except Exception:  # noqa: BLE001 — a dead path is not an error for the candidate
                continue
            if response.status_code != 200 or "html" not in response.headers.get("content-type", ""):
                continue
            final = str(response.url)
            if not looks_like_careers_page(final, response.text):
                continue
            careers_url = final
            for embed in detect_embeds(response.text, final)[:2]:
                return Resolution("board", final, embed.provider, embed.token, fetcher.requests)
            break

    # Board probing calls public posting APIs, not pages, so it goes through the shared
    # client rather than the page fetcher; `find_board` tries each token across the
    # platforms, so consecutive requests hit different hosts. With a careers page already
    # in hand, only the likeliest token is worth probing — the page is a usable source
    # either way, and a board is just a better one.
    budget = PROBE_REQUESTS_WITH_PAGE if careers_url else PROBE_REQUESTS
    if fetcher.time_left() > 8 and budget:
        found, used = board_probe.find_board(fetcher.client, candidate.name, max_requests=budget)
        fetcher.requests += used
        if found:
            return Resolution("board", careers_url, found.provider, found.token, fetcher.requests)

    if careers_url:
        return Resolution("careers_page", careers_url, requests=fetcher.requests)
    return Resolution("none", requests=fetcher.requests, error="No careers page or public board found.")


def process_items(
    conn: psycopg.Connection,
    settings: DiscoverySettings,
    items: list[ClaimedItem],
    *,
    deadline: float | None = None,
) -> dict[str, ItemOutcome]:
    """Resolve claimed candidates one at a time (each is a handful of polite requests).

    Sequential on purpose: discovery is background work behind the scans, and one candidate
    hits several hosts with robots.txt and a per-host pause already.
    """
    outcomes: dict[str, ItemOutcome] = {}
    client = make_crawl_client(min(settings.discovery_http_timeout_seconds, 15.0))
    try:
        for item in items:
            candidate = load(conn, item.ref_id or "")
            if candidate is None:
                outcomes[item.id] = ItemOutcome(True, {"skipped": 1, "reason": "candidate_removed"})
                continue
            fetcher = PoliteFetcher(
                client,
                max_requests=PAGE_REQUESTS + PROBE_REQUESTS,
                deadline_seconds=RESOLVE_SECONDS,
                host_delay=settings.people_host_delay_seconds,
            )
            try:
                result = resolve(fetcher, candidate)
            except Exception as exc:  # noqa: BLE001 — one odd site must not fail the tick
                logger.exception("company discovery failed for %s", candidate.name)
                result = Resolution("error", requests=fetcher.requests, error=f"Unexpected error: {exc.__class__.__name__}")
            outcomes[item.id] = _apply(conn, candidate, result)
    finally:
        client.close()
    return outcomes


def _apply(conn: psycopg.Connection, candidate: Candidate, result: Resolution) -> ItemOutcome:
    domain = candidate.domain or (result.careers_url and registrable_domain(result.careers_url)) or None
    source_id: str | None = None
    page_id: str | None = None
    if result.status == "board" and result.ats and result.ats_token:
        source_id = register_embed(
            conn,
            company_name=candidate.name,
            provider=result.ats,
            token=result.ats_token,
            careers_url=result.careers_url or "",
        )
    if result.status in ("board", "careers_page") and result.careers_url and domain:
        page_id = _add_careers_page(
            conn, name=candidate.name, careers_url=result.careers_url, domain=domain, source_id=source_id
        )
    _record(
        conn,
        candidate.id,
        status=result.status,
        domain=domain,
        careers_url=result.careers_url,
        ats=result.ats,
        ats_token=result.ats_token,
        source_id=source_id,
        page_id=page_id,
        error=result.error,
    )
    return ItemOutcome(
        result.status != "error",
        {
            "status": result.status,
            "ats": result.ats,
            "requests": result.requests,
            "registeredBoard": bool(source_id),
            "registeredPage": bool(page_id),
        },
        result.error,
        retryable=result.status == "error",
    )


def list_candidates(
    conn: psycopg.Connection, *, query: str = "", limit: int = 200, offset: int = 0
) -> dict[str, Any]:
    like = f"%{query.strip().lower()}%"
    rows = conn.execute(
        """SELECT id, name, domain, careers_url, ats, ats_token, discovery_source, status,
                  last_error, attempts, checked_at, promoted_source_id, promoted_page_id, created_at
           FROM discovered_companies
           WHERE lower(name) LIKE %(q)s OR lower(COALESCE(domain, '')) LIKE %(q)s
           ORDER BY checked_at DESC NULLS LAST, created_at DESC
           LIMIT %(limit)s OFFSET %(offset)s""",
        {"q": like, "limit": limit, "offset": offset},
    ).fetchall()
    summary = conn.execute(
        """SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                  COUNT(*) FILTER (WHERE status = 'board') AS board,
                  COUNT(*) FILTER (WHERE status = 'careers_page') AS "careersPage",
                  COUNT(*) FILTER (WHERE status = 'none') AS none,
                  COUNT(*) FILTER (WHERE status = 'error') AS error,
                  COUNT(*) FILTER (WHERE promoted_source_id IS NOT NULL) AS "boardsRegistered",
                  COUNT(*) FILTER (WHERE promoted_page_id IS NOT NULL) AS "pagesRegistered"
           FROM discovered_companies"""
    ).fetchone()
    by_source = conn.execute(
        "SELECT discovery_source, COUNT(*) AS n FROM discovered_companies GROUP BY discovery_source ORDER BY n DESC"
    ).fetchall()
    return {
        "candidates": [
            {
                "id": r["id"], "name": r["name"], "domain": r["domain"],
                "careersUrl": r["careers_url"], "ats": r["ats"], "atsToken": r["ats_token"],
                "discoverySource": r["discovery_source"], "status": r["status"],
                "lastError": r["last_error"], "attempts": r["attempts"],
                "checkedAt": r["checked_at"], "registeredSourceId": r["promoted_source_id"],
                "registeredPageId": r["promoted_page_id"], "createdAt": r["created_at"],
            }
            for r in rows
        ],
        "summary": {k: int(v or 0) for k, v in dict(summary or {}).items()},
        "bySource": {r["discovery_source"]: r["n"] for r in by_source},
    }
