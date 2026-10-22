"""Crawl a company's own careers page — the source of truth for its jobs.

One crawl reads one registry row (`career_pages`) within a small request and time budget,
politely (identified User-Agent, robots.txt for every URL, a pause between hits to one
host) and returns the postings it found plus the strategy that worked:

1. ``<ats>`` — the page (or the "open roles" page it links to) is powered by an embedded
   hiring platform widget (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Workday).
   The platform's public posting API is then only the *parsing mechanism*: it returns the
   complete list, and apply links point back to the company's page when the embed supports
   it (Greenhouse ``?gh_jid=``, Ashby ``?ashby_jid=``).
2. ``jsonld`` — schema.org ``JobPosting`` JSON-LD on the page itself.
3. ``embedded_json`` — a job list in the page's own data (``__NEXT_DATA__``, JSON script
   tags, ``window.X = {...}`` / Phenom ``phApp.ddo`` assignments).
4. ``jsonld_links`` — ``JobPosting`` JSON-LD on job pages the careers page links to.
5. ``jsonld_sitemap`` — the same, for job pages listed in the site's sitemap.

Nothing is guessed: a page whose jobs are rendered only by client-side JavaScript yields
``no_job_data``. Pure helpers (detection, extraction) are fixture-tested.
"""

from __future__ import annotations

import json
import re
import time
from collections import Counter
from dataclasses import dataclass, field, replace
from datetime import timedelta
from typing import Any, Iterator
from urllib.parse import parse_qs, urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx

from app.discovery.jobs.models import RawPosting, SourceTarget
from app.discovery.jobs.providers import ProviderError, get_provider
from app.discovery.jobs.providers.base import as_dict, as_list, text_or_none
from app.discovery.jobs.providers.jsonld import parse_html as parse_jsonld
from app.discovery.jobs.providers.smartrecruiters import SmartRecruitersProvider
from app.discovery.jobs.text import content_hash
from app.discovery.timeutil import to_iso, utcnow

# Identified crawler: a browser-compatible prefix (many CDNs refuse bare library agents)
# that still names the bot and where to read about it. robots.txt rules are matched on
# ROBOTS_AGENT.
CRAWLER_UA = "Mozilla/5.0 (compatible; AavedakJobsBot/1.0; +https://aavedak.vercel.app/how-it-works)"
ROBOTS_AGENT = "AavedakJobsBot"

ATS_STRATEGIES = (
    "greenhouse", "lever", "ashby", "smartrecruiters", "workable", "workday",
    "rippling", "breezy", "personio", "teamtailor",
)
STRATEGIES = ATS_STRATEGIES + ("jsonld", "embedded_json", "jsonld_links", "jsonld_sitemap")
STATUSES = ("ok", "no_job_data", "blocked", "error")

# Display names for the platforms / methods (homepage + admin).
STRATEGY_LABELS = {
    "greenhouse": "Greenhouse",
    "lever": "Lever",
    "ashby": "Ashby",
    "smartrecruiters": "SmartRecruiters",
    "workable": "Workable",
    "workday": "Workday",
    "rippling": "Rippling",
    "breezy": "Breezy HR",
    "personio": "Personio",
    "teamtailor": "Teamtailor",
    "jsonld": "schema.org JobPosting",
    "embedded_json": "Page data",
    "jsonld_links": "Job pages (JobPosting)",
    "jsonld_sitemap": "Sitemap (JobPosting)",
}


@dataclass(frozen=True)
class CareerPage:
    """One row of the `career_pages` registry."""

    id: str
    company_name: str
    careers_url: str
    domain: str
    # Postings the last successful crawl found; the outage guard (jobs/health.py) compares a
    # new complete read against it before letting it close jobs.
    last_posting_count: int | None = None


@dataclass(frozen=True)
class Embed:
    provider: str
    token: str


@dataclass
class CrawlResult:
    status: str  # ok | no_job_data | blocked | error
    strategy: str | None = None
    postings: list[RawPosting] = field(default_factory=list)
    # True only when the source returned its full list (ATS APIs); a page read never closes jobs.
    complete: bool = False
    final_url: str | None = None
    embed: Embed | None = None
    error: str | None = None
    requests: int = 0


# --- domains ------------------------------------------------------------------------------

_SECOND_LEVEL = {"co", "com", "org", "net", "ac", "gov", "edu", "or", "ne", "go"}
_SUBDOMAIN_PREFIXES = ("www.", "careers.", "career.", "jobs.", "job.", "join.", "work.", "talent.")


def host_of(url: str) -> str:
    host = urlparse(url if "://" in url else f"https://{url}").netloc.lower().split(":")[0]
    return host[4:] if host.startswith("www.") else host


def registrable_domain(url: str) -> str:
    """`https://careers.tcs.com/x` → `tcs.com`; `jobs.example.co.in` → `example.co.in`."""
    labels = host_of(url).split(".")
    if len(labels) >= 3 and len(labels[-1]) == 2 and labels[-2] in _SECOND_LEVEL:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


# --- ATS embed detection (pure) -------------------------------------------------------------

_TOKEN = r"([A-Za-z0-9][A-Za-z0-9_.-]{0,80})"
_EMBED_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("greenhouse", re.compile(r"greenhouse\.io/embed/job_board(?:/js)?\?(?:[^\"'\s<>]*?&(?:amp;)?)?for=" + _TOKEN, re.I)),
    ("greenhouse", re.compile(r"boards-api\.greenhouse\.io/v1/boards/" + _TOKEN, re.I)),
    ("greenhouse", re.compile(r"(?:job-)?boards(?:\.eu)?\.greenhouse\.io/(?!embed\b)" + _TOKEN, re.I)),
    ("greenhouse", re.compile(r"Grnhse\.Settings\.boardToken\s*=\s*[\"']" + _TOKEN, re.I)),
    ("lever", re.compile(r"api\.(?:eu\.)?lever\.co/v0/postings/" + _TOKEN, re.I)),
    ("lever", re.compile(r"jobs\.(?:eu\.)?lever\.co/" + _TOKEN, re.I)),
    ("ashby", re.compile(r"api\.ashbyhq\.com/posting-api/job-board/" + _TOKEN, re.I)),
    ("ashby", re.compile(r"jobs\.ashbyhq\.com/(?!api\b)" + _TOKEN, re.I)),
    ("smartrecruiters", re.compile(r"api\.smartrecruiters\.com/v1/companies/" + _TOKEN, re.I)),
    ("smartrecruiters", re.compile(r"(?:careers|jobs)\.smartrecruiters\.com/" + _TOKEN, re.I)),
    ("workable", re.compile(r"apply\.workable\.com/api/v[13]/(?:widget/)?accounts/" + _TOKEN, re.I)),
    ("workable", re.compile(r"apply\.workable\.com/(?!api\b|j\b)" + _TOKEN, re.I)),
    (
        "workday",
        re.compile(
            r"([a-z0-9-]+)\.(wd\d{1,2})\.myworkdayjobs\.com/(?:wday/cxs/[a-z0-9-]+/)?(?:[a-z]{2}-[A-Z]{2}/)?([A-Za-z0-9_-]+)",
            re.I,
        ),
    ),
    ("rippling", re.compile(r"api\.rippling\.com/platform/api/ats/v1/board/" + _TOKEN, re.I)),
    ("rippling", re.compile(r"ats\.rippling\.com/(?:api/v\d/board/)?(?!api\b)" + _TOKEN, re.I)),
    ("breezy", re.compile(r"\b([a-z0-9][a-z0-9-]{1,60})\.breezy\.hr", re.I)),
    ("personio", re.compile(r"\b([a-z0-9][a-z0-9-]{1,60})\.jobs\.personio\.(?:de|com)", re.I)),
)

# Teamtailor serves the careers site from the company's own domain, so its token is that
# host, not a slug in the markup — detected from the platform's asset/script references.
_TEAMTAILOR_RE = re.compile(r"teamtailor(?:-cdn)?\.com|tt-assets|data-tt-|teamtailor\.js", re.I)
# Path segments that are never a board name.
_NOT_TOKENS = {
    "embed", "api", "js", "v0", "v1", "jobs", "job", "static", "assets", "css", "images", "img",
    "favicon.ico", "robots.txt", "sitemap.xml", "index.html", "en", "en-us", "en-US", "wday", "cxs",
    "search", "widget", "careers", "posting-api", "logo", "fonts",
}


def detect_embeds(html: str, page_url: str = "") -> list[Embed]:
    """Hiring-platform boards referenced by a page (its scripts, iframes, links) or its own
    URL, most-referenced first. Workday tokens are `tenant.wdN/site`."""
    counts: Counter[Embed] = Counter()
    text = f"{page_url}\n{html}"
    for provider, pattern in _EMBED_PATTERNS:
        for match in pattern.finditer(text):
            if provider == "workday":
                tenant, wd, site = match.group(1).lower(), match.group(2).lower(), match.group(3)
                if site.lower() in _NOT_TOKENS or tenant in ("www", "wd"):
                    continue
                token = f"{tenant}.{wd}/{site}"
            else:
                token = match.group(1).rstrip(".")
                if token.lower() in _NOT_TOKENS or len(token) < 2:
                    continue
                if provider != "smartrecruiters":
                    token = token.lower()
            counts[Embed(provider, token)] += 1
    host = host_of(page_url)
    if host and _TEAMTAILOR_RE.search(html):
        counts[Embed("teamtailor", host)] += 1
    return [embed for embed, _ in counts.most_common()]


def embeds_on_page(html: str) -> dict[str, bool]:
    """Which platforms render *inside* the company's page (so `?gh_jid=` style links work)."""
    lower = html.lower()
    return {
        "greenhouse": "grnhse" in lower or "greenhouse.io/embed/job_board" in lower,
        "ashby": "ashby_jid" in lower or ("jobs.ashbyhq.com" in lower and "/embed" in lower),
    }


def point_to_company_page(posting: RawPosting, embed: Embed, page_url: str, inline: dict[str, bool]) -> None:
    """When the platform renders inside the company's page, link the posting there instead
    of the platform's hosted board. Links already on the company's own site are kept."""
    url = posting.url or ""
    host = host_of(url)
    base = urlunparse(urlparse(page_url)._replace(query="", fragment=""))
    job_id = posting.external_id.rsplit(":", 1)[-1]
    if embed.provider == "greenhouse" and inline["greenhouse"] and host.endswith("greenhouse.io"):
        posting.url = f"{base}?gh_jid={job_id}"
    elif embed.provider == "ashby" and inline["ashby"] and host.endswith("ashbyhq.com"):
        posting.url = f"{base}?ashby_jid={job_id}"


# --- embedded JSON job lists (pure) ----------------------------------------------------------

_TITLE_KEYS = ("title", "jobTitle", "job_title", "postingTitle", "requisitionTitle", "positionName", "name")
_URL_KEYS = ("applyUrl", "apply_url", "jobUrl", "job_url", "absolute_url", "absoluteUrl", "url", "link", "detailUrl", "canonicalUrl", "externalUrl")
_LOCATION_KEYS = ("location", "locations", "city", "jobLocation", "job_location", "locationName", "primaryLocation", "cityState", "multi_location", "country", "locationsText", "workLocation")
_ID_KEYS = ("jobId", "job_id", "reqId", "req_id", "requisitionId", "requisition_id", "jobSeqNo", "jobReqId", "postingId", "externalPath", "refNum", "jobCode")
_DESC_KEYS = ("description", "jobDescription", "descriptionTeaser", "shortDescription", "summary", "content")
_DATE_KEYS = ("datePosted", "postedDate", "posted_date", "postingDate", "publishedAt", "published_at", "postedOn", "createdDate", "dateCreated", "first_published")

_NEXT_DATA_RE = re.compile(r"<script[^>]+id=[\"']__NEXT_DATA__[\"'][^>]*>(.*?)</script>", re.I | re.S)
_JSON_SCRIPT_RE = re.compile(r"<script[^>]+type=[\"']application/json[\"'][^>]*>(.*?)</script>", re.I | re.S)
_ASSIGN_RE = re.compile(r"(?:window\.|phApp\.)?([A-Za-z_$][\w$.]{1,60})\s*=\s*(?=[{\[])")


def _json_blobs(html: str) -> Iterator[Any]:
    for pattern in (_NEXT_DATA_RE, _JSON_SCRIPT_RE):
        for block in pattern.findall(html):
            try:
                yield json.loads(block.strip())
            except ValueError:
                continue
    decoder = json.JSONDecoder()
    for script in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.I | re.S):
        if len(script) < 40:
            continue
        for match in _ASSIGN_RE.finditer(script):
            name = match.group(1).lower()
            if not any(k in name for k in ("ddo", "state", "data", "jobs", "props", "nuxt", "initial", "preload")):
                continue
            try:
                value, _ = decoder.raw_decode(script, match.end())
            except ValueError:
                continue
            yield value


def _first(row: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if row.get(key) not in (None, "", [], {}):
            return row[key]
    return None


def _is_job_row(row: Any) -> bool:
    if not isinstance(row, dict):
        return False
    title = _first(row, _TITLE_KEYS)
    if not isinstance(title, str) or not title.strip() or len(title) > 200:
        return False
    # A title plus a location or a job identifier: nav items and blog posts have neither.
    return _first(row, _LOCATION_KEYS) is not None or _first(row, _ID_KEYS) is not None


def _job_lists(node: Any, depth: int = 0) -> Iterator[list[dict[str, Any]]]:
    if depth > 12:
        return
    if isinstance(node, list):
        rows = [r for r in node if isinstance(r, dict)]
        if rows and sum(_is_job_row(r) for r in rows) >= max(1, int(0.6 * len(rows))):
            yield [r for r in rows if _is_job_row(r)]
            return
        for item in node:
            yield from _job_lists(item, depth + 1)
    elif isinstance(node, dict):
        for value in node.values():
            if isinstance(value, (list, dict)):
                yield from _job_lists(value, depth + 1)


def _location_texts(value: Any) -> list[str]:
    out: list[str] = []
    for item in value if isinstance(value, list) else [value]:
        if isinstance(item, str):
            if item.strip():
                out.append(item.strip())
        elif isinstance(item, dict):
            address = as_dict(item.get("address")) or item
            parts = [
                text_or_none(address.get(k))
                for k in ("name", "city", "addressLocality", "state", "addressRegion", "country", "addressCountry")
            ]
            parts = [p for p in parts if p and not p.startswith("{")]
            if parts:
                out.append(", ".join(dict.fromkeys(parts)))
    return out


def extract_embedded_jobs(html: str, page: CareerPage, page_url: str) -> list[RawPosting]:
    """Job rows from the page's own embedded data. Only lists whose rows look like jobs
    (title + location or job id) are read; the largest such list wins."""
    best: list[dict[str, Any]] = []
    for blob in _json_blobs(html):
        for rows in _job_lists(blob):
            if len(rows) > len(best):
                best = rows
    out: list[RawPosting] = []
    for row in best:
        title = text_or_none(_first(row, _TITLE_KEYS))
        if not title:
            continue
        raw_url = _first(row, _URL_KEYS)
        url = urljoin(page_url, raw_url) if isinstance(raw_url, str) and raw_url.strip() else None
        if url and urlparse(url).scheme not in ("http", "https"):
            url = None
        ident = _first(row, _ID_KEYS) or row.get("id")
        locations = []
        for key in ("city", "location", "locations", "jobLocation", "job_location", "locationName", "primaryLocation", "cityState", "multi_location", "locationsText", "workLocation"):
            if row.get(key) not in (None, "", []):
                locations = _location_texts(row[key])
                if locations:
                    break
        country = text_or_none(row.get("country")) if isinstance(row.get("country"), str) else None
        if country and locations and country.lower() not in locations[0].lower():
            locations[0] = f"{locations[0]}, {country}"
        elif country and not locations:
            locations = [country]
        desc = _first(row, _DESC_KEYS)
        external = text_or_none(ident) or url or content_hash({"t": title, "l": locations})[:16]
        out.append(
            RawPosting(
                external_id=f"{page.id}:{external}",
                title=title,
                company_name=page.company_name,
                url=url,
                locations=locations,
                country_code=None,
                description=desc if isinstance(desc, str) else "",
                posted_at=_first(row, _DATE_KEYS),
                employment_type=text_or_none(row.get("employmentType") or row.get("type")) if isinstance(row.get("employmentType") or row.get("type"), str) else None,
                remote=bool(row.get("isRemote") or row.get("remote") is True),
            )
        )
    return out


# --- links and sitemaps (pure) --------------------------------------------------------------

_HREF_RE = re.compile(r"<a\b[^>]*?href=[\"']([^\"'#]+)[\"'][^>]*>(.*?)</a>", re.I | re.S)
_JOB_PATH_RE = re.compile(
    r"/(?:jobs?|careers?|positions?|openings?|vacanc(?:y|ies)|opportunit(?:y|ies)|requisitions?|roles?|job-details?|jobdetail)/"
    r"(?:[^?#]*/)?(?:[^/?#]*\d{4,}[^/?#]*|[a-z0-9]+(?:-[a-z0-9]+){2,})/?$",
    re.I,
)
_LISTING_TEXT_RE = re.compile(
    r"\b(?:(?:view|see|search|browse|explore|find)\s+(?:all\s+)?(?:open\s+|current\s+|our\s+)?(?:jobs|roles|positions|openings|opportunities|vacancies)"
    r"|open\s+(?:positions|roles)|job\s+openings|current\s+openings|all\s+jobs|job\s+search|search\s+jobs)\b",
    re.I,
)
_TAG_RE = re.compile(r"<[^>]+>")
_SKIP_SLUGS = ("life-at", "our-culture", "benefits", "students", "early-careers", "teams", "faq", "privacy", "blog")


def same_site(url: str, domain: str) -> bool:
    host = host_of(url)
    return host == domain or host.endswith("." + domain)


def job_links(html: str, page_url: str, domain: str, limit: int = 8) -> list[str]:
    """Job detail pages on the company's own site linked from the page."""
    out: list[str] = []
    page_path = urlparse(page_url).path.rstrip("/")
    for href, _ in _HREF_RE.findall(html):
        url = urljoin(page_url, href.strip()).split("#")[0]
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not same_site(url, domain):
            continue
        if parsed.path.rstrip("/") == page_path or any(s in parsed.path.lower() for s in _SKIP_SLUGS):
            continue
        if _JOB_PATH_RE.search(parsed.path) and url not in out:
            out.append(url)
        if len(out) >= limit:
            break
    return out


def listing_links(html: str, page_url: str, limit: int = 2) -> list[str]:
    """"View open roles" style links: the page that actually lists the jobs."""
    out: list[str] = []
    for href, inner in _HREF_RE.findall(html):
        text = re.sub(r"\s+", " ", _TAG_RE.sub(" ", inner)).strip()
        if not text or len(text) > 80 or not _LISTING_TEXT_RE.search(text):
            continue
        url = urljoin(page_url, href.strip()).split("#")[0]
        if urlparse(url).scheme in ("http", "https") and url.rstrip("/") != page_url.rstrip("/") and url not in out:
            out.append(url)
        if len(out) >= limit:
            break
    return out


_LOC_RE = re.compile(r"<url>\s*<loc>\s*([^<\s]+)\s*</loc>(?:\s*<lastmod>\s*([^<\s]+)\s*</lastmod>)?", re.I)
_SITEMAP_RE = re.compile(r"<sitemap>\s*<loc>\s*([^<\s]+)\s*</loc>", re.I)


def sitemap_children(xml: str) -> list[str]:
    """Child sitemaps of a sitemap index that likely hold job pages."""
    children = _SITEMAP_RE.findall(xml)
    return [c for c in children if re.search(r"job|career|position|opening|vacanc", c, re.I)][:2]


def sitemap_job_urls(xml: str, domain: str, limit: int = 8) -> list[str]:
    """Job detail URLs in a sitemap on the company's site, most recently modified first."""
    rows = []
    for loc, lastmod in _LOC_RE.findall(xml):
        if same_site(loc, domain) and _JOB_PATH_RE.search(urlparse(loc).path):
            rows.append((lastmod or "", loc))
    rows.sort(reverse=True)
    return [loc for _, loc in rows[:limit]]


# --- fetching -----------------------------------------------------------------------------


class _Budget(Exception):
    pass


class PoliteFetcher:
    """GETs with robots.txt per origin, a pause between hits to one host, and request/time caps."""

    def __init__(self, client: httpx.Client, *, max_requests: int, deadline_seconds: float, host_delay: float) -> None:
        self.client = client
        self.max_requests = max_requests
        self.deadline = time.monotonic() + deadline_seconds
        self.host_delay = host_delay
        self.requests = 0
        self._robots: dict[str, RobotFileParser | None] = {}
        self._last_hit: dict[str, float] = {}
        self.sitemaps: dict[str, list[str]] = {}

    def time_left(self) -> float:
        return self.deadline - time.monotonic()

    def _wait_turn(self, host: str) -> None:
        if self.requests >= self.max_requests or self.time_left() < 3:
            raise _Budget()
        last = self._last_hit.get(host)
        if last is not None:
            pause = self.host_delay - (time.monotonic() - last)
            if pause > 0:
                time.sleep(pause)
        self._last_hit[host] = time.monotonic()
        self.requests += 1

    def allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return False
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots:
            parser: RobotFileParser | None = None
            try:
                self._wait_turn(parsed.netloc)
                res = self.client.get(f"{origin}/robots.txt", headers={"Accept": "text/plain"})
                if res.status_code < 400:
                    parser = RobotFileParser()
                    lines = res.text.splitlines()
                    parser.parse(lines)
                    # Sitemap: lines may be relative or name another scheme; keep absolute http(s) only.
                    found = [urljoin(f"{origin}/", l.split(":", 1)[1].strip()) for l in lines if l.lower().startswith("sitemap:")]
                    self.sitemaps[origin] = [u for u in found if urlparse(u).scheme in ("http", "https")][:3]
            except httpx.HTTPError:
                parser = None  # unreachable robots.txt → standard practice is to allow
            self._robots[origin] = parser
        parser = self._robots[origin]
        return True if parser is None else parser.can_fetch(ROBOTS_AGENT, url)

    def get(self, url: str, *, accept: str = "text/html,application/xhtml+xml") -> httpx.Response:
        self._wait_turn(urlparse(url).netloc)
        return self.client.get(url, headers={"Accept": accept})


def make_crawl_client(timeout: float = 15.0) -> httpx.Client:
    return httpx.Client(
        timeout=httpx.Timeout(timeout, connect=8.0),
        headers={"User-Agent": CRAWLER_UA, "Accept-Language": "en-IN,en;q=0.8"},
        follow_redirects=True,
    )


def _fetch_embed(client: httpx.Client, page: CareerPage, embed: Embed, page_url: str) -> tuple[list[RawPosting], bool]:
    target = SourceTarget(
        id=page.id, company_name=page.company_name, provider=embed.provider, token=embed.token, careers_url=page_url
    )
    provider = get_provider(embed.provider)
    fetched = provider.fetch(client, target, frozenset()) if isinstance(provider, SmartRecruitersProvider) else provider.fetch(client, target)
    for posting in fetched.postings:
        posting.company_name = page.company_name
    return fetched.postings, fetched.complete


def _jsonld(html: str, page: CareerPage, url: str) -> list[RawPosting]:
    target = SourceTarget(id=page.id, company_name=page.company_name, provider="jsonld", token=page.id, careers_url=url)
    postings = parse_jsonld(html, target, url)
    for posting in postings:
        posting.company_name = page.company_name
    return postings


def _prefix(postings: list[RawPosting], page: CareerPage, strategy: str) -> list[RawPosting]:
    """Career-page ids: `<page id>:<strategy>:<native id>` so two strategies never collide."""
    for posting in postings:
        native = posting.external_id.split(":", 1)[1] if posting.external_id.startswith(f"{page.id}:") else posting.external_id
        posting.external_id = f"{page.id}:{strategy}:{native}"
    return postings


def crawl(
    client: httpx.Client,
    page: CareerPage,
    *,
    max_requests: int = 16,
    deadline_seconds: float = 45.0,
    host_delay: float = 0.6,
) -> CrawlResult:
    fetcher = PoliteFetcher(client, max_requests=max_requests, deadline_seconds=deadline_seconds, host_delay=host_delay)
    try:
        return _crawl(fetcher, page)
    except _Budget:
        if fetcher.time_left() < 3:
            # Out of time, not out of ideas: an error, so the page is retried rather than parked weekly.
            return CrawlResult("error", error="Ran out of time before job data was found.", requests=fetcher.requests)
        return CrawlResult("no_job_data", error="Request budget used before job data was found.", requests=fetcher.requests)
    except httpx.HTTPError as exc:
        return CrawlResult("error", error=f"Request failed: {exc.__class__.__name__}", requests=fetcher.requests)
    except Exception as exc:  # noqa: BLE001 - one odd page must never break a scan batch
        return CrawlResult("error", error=f"Unexpected page shape: {exc.__class__.__name__}", requests=fetcher.requests)


def _crawl(fetcher: PoliteFetcher, page: CareerPage) -> CrawlResult:
    if not fetcher.allowed(page.careers_url):
        return CrawlResult("blocked", error="robots.txt disallows this page.", requests=fetcher.requests)
    res = fetcher.get(page.careers_url)
    final_url = str(res.url)
    if res.status_code in (401, 403, 429):
        return CrawlResult("blocked", error=f"HTTP {res.status_code} (the site refuses crawlers).", final_url=final_url, requests=fetcher.requests)
    if res.status_code >= 400:
        return CrawlResult("error", error=f"HTTP {res.status_code}.", final_url=final_url, requests=fetcher.requests)

    # Links count as the company's site on the domain the careers URL redirected to.
    page = replace(page, domain=registrable_domain(final_url)) if not same_site(final_url, page.domain) else page

    def result(strategy: str, postings: list[RawPosting], *, complete: bool = False, embed: Embed | None = None, url: str = final_url) -> CrawlResult:
        return CrawlResult("ok", strategy, _prefix(postings, page, strategy), complete, url, embed, requests=fetcher.requests)

    pages = [(final_url, res.text)]
    # The careers landing page often only links to the page that lists the jobs.
    for listing in listing_links(res.text, final_url):
        if detect_embeds("", listing):
            pages.append((listing, ""))  # a hosted board link: its URL names the board
            continue
        if not same_site(listing, page.domain) or not fetcher.allowed(listing):
            continue
        try:
            sub = fetcher.get(listing)
        except _Budget:
            break
        if sub.status_code == 200 and "html" in sub.headers.get("content-type", ""):
            pages.append((str(sub.url), sub.text))
        break

    errors: list[str] = []
    for url, html in pages:
        for embed in detect_embeds(html, url)[:2]:
            try:
                postings, complete = _fetch_embed(fetcher.client, page, embed, url)
            except ProviderError as exc:
                errors.append(f"{embed.provider}/{embed.token}: {exc}")
                continue
            fetcher.requests += 1
            if postings:
                inline = embeds_on_page(html)
                for posting in postings:
                    point_to_company_page(posting, embed, url if html else final_url, inline)
                return result(embed.provider, postings, complete=complete, embed=embed, url=url if html else final_url)
        if not html:
            continue
        postings = _jsonld(html, page, url)
        if postings:
            return result("jsonld", postings, url=url)
        postings = extract_embedded_jobs(html, page, url)
        if postings:
            return result("embedded_json", postings, url=url)

    # Job detail pages linked from the careers pages, then the sitemap.
    links: list[str] = []
    for url, html in pages:
        links += [l for l in job_links(html, url, page.domain) if l not in links]
    postings = _read_job_pages(fetcher, page, links[:8])
    if postings:
        return result("jsonld_links", postings)

    sitemap_urls = _sitemap_job_urls(fetcher, page, final_url)
    postings = _read_job_pages(fetcher, page, sitemap_urls)
    if postings:
        return result("jsonld_sitemap", postings)

    if fetcher.time_left() < 5:
        # The link and sitemap reads stop early when time runs short; that is no verdict.
        return CrawlResult("error", error="Ran out of time before job data was found.", final_url=final_url, requests=fetcher.requests)
    return CrawlResult(
        "no_job_data",
        error="; ".join(errors)[:400] or "No job data found (likely rendered client-side).",
        final_url=final_url,
        requests=fetcher.requests,
    )


def _read_job_pages(fetcher: PoliteFetcher, page: CareerPage, urls: list[str]) -> list[RawPosting]:
    found: list[RawPosting] = []
    misses = 0
    for url in urls:
        if fetcher.time_left() < 5 or misses >= 3 and not found:
            break  # three detail pages without JSON-LD: the site does not publish it
        try:
            if not fetcher.allowed(url):
                continue
            res = fetcher.get(url)
        except (_Budget, httpx.HTTPError):
            break
        if res.status_code != 200:
            misses += 1
            continue
        postings = _jsonld(res.text, page, str(res.url))
        if postings:
            found += postings
        else:
            misses += 1
    return found


def _sitemap_job_urls(fetcher: PoliteFetcher, page: CareerPage, final_url: str) -> list[str]:
    parsed = urlparse(final_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    fetcher.allowed(final_url)  # loads robots.txt (and its Sitemap: lines) for this origin
    candidates = fetcher.sitemaps.get(origin) or [f"{origin}/sitemap.xml"]
    for sitemap in candidates[:2]:
        try:
            if not fetcher.allowed(sitemap):
                continue
            res = fetcher.get(sitemap, accept="application/xml,text/xml")
        except (_Budget, httpx.HTTPError):
            return []
        if res.status_code != 200 or len(res.content) > 8_000_000:
            continue
        xml = res.text
        urls = sitemap_job_urls(xml, page.domain)
        for child in sitemap_children(xml) if not urls else []:
            try:
                sub = fetcher.get(child, accept="application/xml,text/xml")
            except (_Budget, httpx.HTTPError):
                break
            if sub.status_code == 200 and len(sub.content) <= 8_000_000:
                urls = sitemap_job_urls(sub.text, page.domain)
                if urls:
                    break
        if urls:
            return urls
    return []


def relative_posted(text: str | None) -> str | None:
    """Workday-style "Posted Today" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" → ISO."""
    if not text:
        return None
    lower = text.lower()
    now = utcnow()
    if "today" in lower:
        return to_iso(now)
    if "yesterday" in lower:
        return to_iso(now - timedelta(days=1))
    match = re.search(r"(\d+)\+?\s*days?", lower)
    if match:
        days = int(match.group(1)) + (1 if "+" in lower else 0)
        return to_iso(now - timedelta(days=days))
    return None


__all__ = [
    "ATS_STRATEGIES",
    "CRAWLER_UA",
    "CareerPage",
    "CrawlResult",
    "Embed",
    "ROBOTS_AGENT",
    "STRATEGIES",
    "STRATEGY_LABELS",
    "crawl",
    "detect_embeds",
    "extract_embedded_jobs",
    "job_links",
    "listing_links",
    "make_crawl_client",
    "registrable_domain",
    "relative_posted",
    "sitemap_job_urls",
]
