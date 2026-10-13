"""Company website / domain helpers for people discovery. The company's domain is never
guessed from its name: it comes from where its postings live, links on its job board or in
its job descriptions, the user's application link, or a GitHub org / provider that names it."""

from __future__ import annotations

import re
from collections import Counter
from html import unescape
from urllib.parse import urljoin, urlparse

import psycopg

from app.discovery.jobs.email_extractor import best_application_email, is_application_inbox
from app.discovery.jobs.text import html_to_text

# Hosts that are never the company's own site: hiring platforms, social networks, and the
# trackers / CDNs / consent tools that show up as links on board pages.
_NOT_COMPANY_HOST = re.compile(
    r"(^|\.)(greenhouse\.io|greenhouse\.com|ashbyhq\.com|lever\.co|smartrecruiters\.com|"
    r"workable\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|"
    r"youtube\.com|tiktok\.com|medium\.com|github\.com|glassdoor\.[a-z.]+|indeed\.[a-z.]+|"
    r"google\.[a-z.]+|googleapis\.com|gstatic\.com|cloudfront\.net|amazonaws\.com|"
    r"cloudflare\.com|jsdelivr\.net|unpkg\.com|w3\.org|schema\.org|apple\.com|"
    r"microsoft\.com|onetrust\.com|cookielaw\.org|hotjar\.com|sentry\.io|segment\.com|"
    r"eeoc\.gov|dol\.gov|bit\.ly|wikipedia\.org|crunchbase\.com|myworkdayjobs\.com|workday\.com|"
    r"naukri\.com|instahyre\.com|wellfound\.com|angel\.co|keka\.com|darwinbox\.in|zohorecruit\.[a-z.]+|"
    r"freshteam\.com|recruitee\.com|breezy\.hr|jobvite\.com|icims\.com|taleo\.net|oraclecloud\.com|"
    r"successfactors\.[a-z.]+|bamboohr\.com|personio\.[a-z.]+|teamtailor\.com|cutshort\.io|foundit\.in|"
    r"hirist\.[a-z.]+|iimjobs\.com|monster\.com|shine\.com|ycombinator\.com|workatastartup\.com)$",
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



def site_domain(url: str | None) -> str | None:
    """Registrable domain of a company-site URL, or None for hiring platforms / socials."""
    host = _company_host(url or "")
    return registrable_domain(host) if host else None


def resolve_domain(conn: psycopg.Connection, company_id: str) -> tuple[str | None, str | None]:
    """(domain, how) from stored evidence only: the official careers page registered for the
    company, its shared postings, then links in users' applications for it."""
    row = conn.execute(
        """SELECT official_careers_url, careers_url FROM company_sources
           WHERE company_id = %s AND official_careers_url IS NOT NULL LIMIT 1""",
        (company_id,),
    ).fetchone()
    if row and site_domain(row["official_careers_url"]):
        return site_domain(row["official_careers_url"]), "official_careers_url"
    jobs = conn.execute(
        """SELECT url, description FROM jobs WHERE company_id = %s
           ORDER BY created_at DESC LIMIT 40""",
        (company_id,),
    ).fetchall()
    hint = company_site_hint(
        board_html=None,
        job_urls=[r["url"] for r in jobs if r["url"]],
        descriptions=[r["description"] for r in jobs if r["description"]],
    )
    if hint:
        return site_domain(hint), "job_postings"
    apps = conn.execute(
        """SELECT a.job_link FROM applications a JOIN companies c
             ON c.name_key = lower(regexp_replace(btrim(a.company_name), '\\s+', ' ', 'g'))
           WHERE c.id = %s AND a.job_link IS NOT NULL LIMIT 20""",
        (company_id,),
    ).fetchall()
    found = Counter(d for d in (site_domain(r["job_link"]) for r in apps) if d)
    if found:
        return found.most_common(1)[0][0], "application_link"
    return None, None
