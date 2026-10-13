"""Company website: team / about / leadership pages, read for schema.org `Person` JSON-LD
and for simple "name heading + title line" cards. Also collects the GitHub org the site links
to and any published personal addresses on the company's own domain (evidence for the email
pattern). robots.txt and the request budget are enforced by the Fetcher."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from html import unescape
from urllib.parse import urljoin, urlparse

from app.discovery.jobs.email_extractor import is_application_inbox
from app.discovery.people.candidate import SOURCE_CONFIDENCE, Candidate
from app.discovery.people.classify import clean_name, looks_like_title
from app.discovery.people.fetch import Fetcher
from app.discovery.people.domains import registrable_domain

_HREF = re.compile(r"""<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a>""", re.I | re.S)
_TAG = re.compile(r"<[^>]+>")
_LDJSON = re.compile(r"""<script[^>]+application/ld\+json[^>]*>(.*?)</script>""", re.I | re.S)
_HEADING = re.compile(r"<(h[2-6]|strong|b)\b[^>]*>(.*?)</\1>", re.I | re.S)
_STRIP_BLOCKS = re.compile(r"<(script|style|noscript|svg|template)\b.*?</\1>", re.I | re.S)
_MAILTO = re.compile(r"""mailto:([^"'?\s>]+)""", re.I)
_EMAIL_TEXT = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_TEAM_LINK = re.compile(r"\b(team|leadership|about|people|founders|management|who-we-are|our-story|company)\b", re.I)
_FALLBACK_PATHS = ("/about", "/team", "/about-us", "/leadership", "/company")
_GITHUB_ORG = re.compile(r"https?://(?:www\.)?github\.com/([A-Za-z0-9][A-Za-z0-9\-]{0,38})/?(?:[\"'#?]|$)", re.I)
_GITHUB_RESERVED = {"about", "features", "pricing", "login", "join", "orgs", "topics", "sponsors", "marketplace", "enterprise", "security", "site", "collections", "explore", "apps", "settings"}
_SOCIAL = {
    "linkedin": re.compile(r"https?://(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_%.]+/?", re.I),
    "twitter": re.compile(r"https?://(?:www\.)?(?:twitter|x)\.com/[A-Za-z0-9_]{1,15}/?(?=[\"'#?\s<]|$)", re.I),
    "github": re.compile(r"https?://(?:www\.)?github\.com/[A-Za-z0-9][A-Za-z0-9\-]{0,38}/?(?=[\"'#?\s<]|$)", re.I),
}


@dataclass
class SiteResult:
    candidates: list[Candidate] = field(default_factory=list)
    evidence: list[tuple[str, str]] = field(default_factory=list)  # (name, published email)
    inbox: tuple[str, str] | None = None  # (careers inbox, page)
    github_org: str | None = None
    pages: int = 0


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", unescape(_TAG.sub(" ", fragment))).strip()


def _people_from_ld(obj: object, out: list[dict]) -> None:
    if isinstance(obj, list):
        for item in obj:
            _people_from_ld(item, out)
        return
    if not isinstance(obj, dict):
        return
    kind = obj.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    if "Person" in kinds:
        out.append(obj)
    for key in ("@graph", "employee", "employees", "founder", "founders", "member", "members", "author", "itemListElement", "item"):
        if key in obj:
            _people_from_ld(obj[key], out)


def _same_as(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [v for v in value if isinstance(v, str)]
    return []


def _socials(urls: list[str], cand: Candidate) -> None:
    for url in urls:
        if not cand.linkedin and _SOCIAL["linkedin"].match(url):
            cand.linkedin = url
        elif not cand.twitter and _SOCIAL["twitter"].match(url):
            cand.twitter = url.rstrip("/")
        elif not cand.github_login and _SOCIAL["github"].match(url):
            login = url.rstrip("/").rsplit("/", 1)[-1]
            if login.lower() not in _GITHUB_RESERVED:
                cand.github_login = login


def parse_people(html: str, page_url: str, domain: str) -> tuple[list[Candidate], list[tuple[str, str]]]:
    """Candidates and (name, email) evidence from one company page. Pure."""
    found: dict[str, Candidate] = {}
    evidence: list[tuple[str, str]] = []
    base = SOURCE_CONFIDENCE["company_site"]

    def own(email: str | None) -> str | None:
        if not email or "@" not in email:
            return None
        email = email.strip().lower().removeprefix("mailto:")
        return email if registrable_domain(email.rsplit("@", 1)[1]) == domain and not is_application_inbox(email) else None

    for block in _LDJSON.findall(html):
        try:
            data = json.loads(unescape(block.strip()))
        except ValueError:
            continue
        people: list[dict] = []
        _people_from_ld(data, people)
        for p in people:
            name = clean_name(p.get("name") if isinstance(p.get("name"), str) else None)
            if not name:
                continue
            title = p.get("jobTitle") if isinstance(p.get("jobTitle"), str) else None
            cand = Candidate(name=name, source="company_site", source_url=page_url, title=title, confidence=base)
            email = own(p.get("email") if isinstance(p.get("email"), str) else None)
            if email:
                cand.email, cand.email_status, cand.email_confidence = email, "published", base
                evidence.append((name, email))
            tel = p.get("telephone")
            if isinstance(tel, str) and 7 <= len(re.sub(r"\D", "", tel)) <= 15:
                cand.phone = tel.strip()
            _socials(_same_as(p.get("sameAs")) + _same_as(p.get("url")), cand)
            found.setdefault(name.lower(), cand)

    body = _STRIP_BLOCKS.sub(" ", html)
    headings = list(_HEADING.finditer(body))
    for i, match in enumerate(headings):
        name = clean_name(_text(match.group(2)))
        if not name or name.lower() in found:
            continue
        end = headings[i + 1].start() if i + 1 < len(headings) else min(len(body), match.end() + 1500)
        segment = body[match.end(): min(end, match.end() + 1500)]
        lines = [t for t in (_text(x) for x in re.split(r"<br\s*/?>|</p>|</div>|</span>|</li>", segment, flags=re.I)) if t]
        title = next((t for t in lines[:3] if looks_like_title(t)), None)
        if not title:
            continue  # a bare name with no role nearby is too weak to keep
        cand = Candidate(name=name, source="company_site", source_url=page_url, title=title[:120], confidence=base - 10)
        hrefs = [unescape(h) for h, _ in _HREF.findall(segment)]
        _socials(hrefs, cand)
        for href in hrefs:
            email = own(href) if href.lower().startswith("mailto:") else None
            if email:
                cand.email, cand.email_status, cand.email_confidence = email, "published", base - 10
                evidence.append((name, email))
                break
        found[name.lower()] = cand

    return list(found.values()), evidence


def team_links(html: str, page_url: str) -> list[str]:
    domain = registrable_domain(urlparse(page_url).netloc)
    out: list[str] = []
    for href, label in _HREF.findall(html):
        url = urljoin(page_url, unescape(href.strip())).split("#")[0]
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or registrable_domain(parsed.netloc) != domain or parsed.query:
            continue
        if _TEAM_LINK.search(parsed.path.replace("/", " ").replace("-", " ")) or _TEAM_LINK.search(_text(label)):
            if url.rstrip("/") not in {u.rstrip("/") for u in out} and url.rstrip("/") != page_url.rstrip("/"):
                out.append(url)
    # Team / leadership pages beat a generic about page.
    out.sort(key=lambda u: 0 if re.search(r"team|leader|people|founder|management", u, re.I) else 1)
    return out


def github_org(html: str) -> str | None:
    for org in _GITHUB_ORG.findall(html):
        if org.lower() not in _GITHUB_RESERVED:
            return org
    return None


def published_emails(html: str, domain: str) -> list[str]:
    text = " ".join(_MAILTO.findall(html)) + " " + _text(_STRIP_BLOCKS.sub(" ", html))
    out = []
    for email in _EMAIL_TEXT.findall(text):
        email = unescape(email).lower()
        if registrable_domain(email.rsplit("@", 1)[1]) == domain and email not in out:
            out.append(email)
    return out


def discover(fetcher: Fetcher, domain: str, *, max_pages: int = 5) -> SiteResult:
    result = SiteResult()
    home = fetcher.page(f"https://{domain}/") or fetcher.page(f"https://www.{domain}/")
    if home is None:
        return result
    home_url, home_html = home
    result.pages = 1
    result.github_org = github_org(home_html)
    queue = team_links(home_html, home_url)[: max_pages - 1]
    if not queue:
        queue = [urljoin(home_url, p) for p in _FALLBACK_PATHS[:3]]
    pages = [(home_url, home_html)]
    for url in queue:
        if result.pages >= max_pages or fetcher.exhausted:
            break
        got = fetcher.page(url)
        if got:
            result.pages += 1
            pages.append(got)
    seen: set[str] = set()
    for url, html in pages:
        cands, evidence = parse_people(html, url, domain)
        for c in cands:
            if c.name.lower() not in seen:
                seen.add(c.name.lower())
                result.candidates.append(c)
        result.evidence.extend(evidence)
        result.github_org = result.github_org or github_org(html)
        if result.inbox is None:
            inbox = next((e for e in published_emails(html, domain) if is_application_inbox(e)), None)
            if inbox:
                result.inbox = (inbox, url)
    return result
