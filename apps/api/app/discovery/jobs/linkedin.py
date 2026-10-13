"""Read one LinkedIn job the user pasted into Add job (never used by scans).

The job id is taken from any LinkedIn job link (`/jobs/view/<slug>-<id>`, `?currentJobId=`,
`/comm/jobs/view/<id>`, mobile hosts, `lnkd.in` short links). The posting is read from the
public, signed-out guest endpoint `/jobs-guest/jobs/api/jobPosting/<id>`; if that fails,
the public `/jobs/view/<id>` page (its top card markup, then JobPosting JSON-LD). One user
action = at most a few requests, with a browser User-Agent and a short timeout.
"""

from __future__ import annotations

import html as htmllib
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, unquote, urlparse

import httpx

from app.ats.reference_signals import HARD_SKILL_ALIASES, count_phrase
from app.discovery.jobs.page_extract import Node, parse_tree
from app.discovery.jobs.text import clean_line

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
TIMEOUT = httpx.Timeout(15.0, connect=8.0)
GUEST_API = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}"
VIEW_URL = "https://www.linkedin.com/jobs/view/{id}/"

_ID_PATTERNS = (
    re.compile(r"[?&#](?:currentJobId|jobId)=(\d{6,})"),
    re.compile(r"/jobs/view/(?:[^/?#]*?-)?(\d{6,})(?:[/?#]|$)"),
    re.compile(r"/jobs-guest/jobs/api/jobPosting/(\d{6,})"),
    re.compile(r"urn:li:(?:fs_normalized_)?jobPosting:(\d{6,})"),
)


class LinkedInError(ValueError):
    pass


def is_linkedin_host(host: str) -> bool:
    host = host.lower().split(":")[0]
    return host in {"linkedin.com", "lnkd.in"} or host.endswith(".linkedin.com")


def job_id_from_url(url: str) -> str | None:
    """LinkedIn job id in a link, or None. Handles encoded redirect params too."""
    text = url.strip()
    for candidate in (text, unquote(text), unquote(unquote(text))):
        for pattern in _ID_PATTERNS:
            match = pattern.search(candidate)
            if match:
                return match.group(1)
    return None


def resolve_short_link(client: httpx.Client, url: str) -> str:
    """Follow an lnkd.in link to the LinkedIn URL it points at."""
    try:
        response = client.get(url, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise LinkedInError("Couldn't open that short link.") from exc
    final = str(response.url)
    if job_id_from_url(final):
        return final
    # lnkd.in sometimes shows an interstitial page that links to the target.
    match = re.search(r"https?://[\w.]*linkedin\.com/[^\s\"'<>]+", response.text or "")
    return htmllib.unescape(match.group(0)) if match else final


def _first(root: Node, *classes: str) -> Node | None:
    for cls in classes:
        node = root.find(lambda n, cls=cls: cls in n.classes())
        if node is not None:
            return node
    return None


def _relative_date(text: str, now: datetime) -> str | None:
    """'3 days ago' / '1 month ago' / 'Reposted 2 weeks ago' → ISO date (approximate)."""
    t = text.lower()
    if re.search(r"\b(just now|today|minute|hour)s?\b", t):
        return now.date().isoformat()
    match = re.search(r"(\d+)\s+(day|week|month|year)s?\s+ago", t)
    if not match:
        return None
    n, unit = int(match.group(1)), match.group(2)
    days = {"day": 1, "week": 7, "month": 30, "year": 365}[unit] * n
    return (now - timedelta(days=days)).date().isoformat()


_MODE_WORDS = {
    "remote": re.compile(r"\b(fully remote|remote[- ]first|100% remote|work from home|wfh)\b", re.I),
    "hybrid": re.compile(r"\bhybrid\b", re.I),
    "onsite": re.compile(r"\b(on[- ]?site|in[- ]office|work from office|wfo)\b", re.I),
}


def work_mode(location: str, title: str, description: str) -> str | None:
    """remote / hybrid / onsite from the top card label, else only when the description
    names exactly one mode. None when unclear."""
    for text in (location, title):
        low = text.lower()
        if "remote" in low:
            return "remote"
        if "hybrid" in low:
            return "hybrid"
        if "on-site" in low or "onsite" in low:
            return "onsite"
    found = [mode for mode, rx in _MODE_WORDS.items() if rx.search(description or "")]
    return found[0] if len(found) == 1 else None


def skills_in(text: str, limit: int = 20) -> list[str]:
    """Known hard skills mentioned in the description (same lexicon as the ATS engines)."""
    lower = (text or "").lower()
    hits: list[tuple[int, str]] = []
    for aliases in HARD_SKILL_ALIASES.values():
        n = sum(count_phrase(lower, a) for a in aliases)
        if n:
            hits.append((n, aliases[0]))
    hits.sort(key=lambda h: -h[0])
    return [label for _, label in hits[:limit]]


def parse_posting(html: str, job_id: str, *, now: datetime | None = None) -> dict | None:
    """Fields from a guest jobPosting fragment or a public /jobs/view page; None if empty."""
    now = now or datetime.now(timezone.utc)
    root = parse_tree(html)
    title_node = _first(root, "top-card-layout__title", "topcard__title")
    title = title_node.line() if title_node else ""
    company_node = _first(root, "topcard__org-name-link", "topcard__flavor")
    company = company_node.line() if company_node else ""
    location = ""
    for node in root.find_all(lambda n: "topcard__flavor--bullet" in n.classes()):
        if node.tag == "span":
            location = node.line()
            break
    desc_node = _first(root, "show-more-less-html__markup", "description__text")
    description = desc_node.text() if desc_node else ""
    if not title and not description:
        return None

    criteria: dict[str, str] = {}
    for item in root.find_all(lambda n: "description__job-criteria-item" in n.classes()):
        head = _first(item, "description__job-criteria-subheader")
        body = _first(item, "description__job-criteria-text")
        if head and body:
            criteria[head.line().lower()] = body.line()

    posted_node = _first(root, "posted-time-ago__text")
    posted_text = posted_node.line() if posted_node else ""
    time_node = root.find(lambda n: n.tag == "time" and bool(n.attr("datetime")))
    posted = (
        time_node.attr("datetime")[:10]
        if time_node and posted_node is None
        else _relative_date(posted_text, now)
    )

    salary_node = _first(root, "compensation__salary", "salary")
    salary = salary_node.line() if salary_node else ""

    apply = re.search(r'<code[^>]*id="applyUrl"[^>]*>\s*<!--"(.*?)"-->', html, re.S)
    apply_url = htmllib.unescape(apply.group(1)) if apply else ""
    # Offsite apply links are LinkedIn redirects carrying the real URL in `url=`.
    if apply_url and "linkedin.com" in apply_url:
        target = parse_qs(urlparse(apply_url).query).get("url")
        apply_url = target[0] if target else apply_url

    seniority = criteria.get("seniority level", "")
    return {
        "title": title,
        "company": company,
        "location": location,
        "description": description,
        "postedAt": posted,
        "postedText": posted_text,
        "employmentType": criteria.get("employment type") or None,
        "seniority": None if seniority.lower() in ("", "not applicable") else seniority,
        "industries": criteria.get("industries") or None,
        "jobFunction": criteria.get("job function") or None,
        "salary": clean_line(salary) or None,
        "applyUrl": apply_url or None,
        "workMode": work_mode(location, title, description),
        "skills": skills_in(description),
        "url": VIEW_URL.format(id=job_id),
    }


def _get(client: httpx.Client, url: str) -> httpx.Response | None:
    try:
        return client.get(url, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
    except httpx.HTTPError:
        return None


def fetch(client: httpx.Client, url: str) -> dict:
    """Parsed posting for a LinkedIn job link. Raises LinkedInError with a user message."""
    host = urlparse(url if "://" in url else f"https://{url}").netloc
    if host.lower().endswith("lnkd.in"):
        url = resolve_short_link(client, url)
    job_id = job_id_from_url(url)
    if not job_id:
        raise LinkedInError(
            "That LinkedIn link isn't a job posting. Open the job and copy its link "
            "(it looks like linkedin.com/jobs/view/…)."
        )
    statuses: list[int] = []
    guest = _get(client, GUEST_API.format(id=job_id))
    if guest is not None:
        statuses.append(guest.status_code)
        if guest.status_code == 200:
            parsed = parse_posting(guest.text, job_id)
            if parsed:
                return parsed | {"via": "guest_api"}
    view = _get(client, VIEW_URL.format(id=job_id))
    if view is not None:
        statuses.append(view.status_code)
        if view.status_code == 200:
            parsed = parse_posting(view.text, job_id)
            if parsed:
                return parsed | {"via": "view_page"}
            from app.discovery.jobs.models import SourceTarget
            from app.discovery.jobs.providers.jsonld import parse_html

            target = SourceTarget(id="", company_name="", provider="jsonld", token="",
                                  careers_url=VIEW_URL.format(id=job_id))
            postings = parse_html(view.text, target, VIEW_URL.format(id=job_id))
            if postings:
                p = postings[0]
                return {
                    "title": clean_line(p.title), "company": clean_line(p.company_name),
                    "location": " · ".join(p.locations[:3]), "description": p.description,
                    "postedAt": str(p.posted_at)[:10] if p.posted_at else None,
                    "postedText": "", "employmentType": None, "seniority": None,
                    "industries": None, "jobFunction": None, "salary": None, "applyUrl": None,
                    "workMode": None, "skills": skills_in(p.description or ""),
                    "url": VIEW_URL.format(id=job_id), "via": "view_jsonld",
                }
    if 404 in statuses or 410 in statuses:
        raise LinkedInError("That LinkedIn job wasn't found. It may be closed or removed.")
    if 429 in statuses:
        raise LinkedInError(
            "LinkedIn is limiting requests right now. Couldn't read that posting — fill manually, "
            "or try again in a minute."
        )
    raise LinkedInError("Couldn't read that posting — fill manually.")
