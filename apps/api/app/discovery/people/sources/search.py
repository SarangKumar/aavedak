"""Search APIs (Brave, SerpAPI, Google Programmable Search), each used only when its key is
set. We read result titles/snippets only: LinkedIn profile URLs and the "Name - Title -
Company | LinkedIn" headline. LinkedIn itself is never fetched, logged in to, or scraped."""

from __future__ import annotations

import re
from collections.abc import Callable

from app.discovery.people.candidate import SOURCE_CONFIDENCE, Candidate
from app.discovery.people.classify import clean_name
from app.discovery.people.fetch import Fetcher
from app.discovery.people.normalize import normalize_linkedin

# The CSE engine is site-restricted to linkedin.com/in/* (add that under "Sites to search"
# with "Search the entire web" off); the site: operator keeps other providers on the same set.
ROLE_QUERY = '("recruiter" OR "talent acquisition" OR "hiring manager" OR "engineering manager" OR "head of engineering")'


def query_for(company: str) -> str:
    return f'site:linkedin.com/in "{company}" {ROLE_QUERY}'


def _results(
    fetcher: Fetcher, keys: dict[str, str | None], query: str, cse_allowed: Callable[[], bool] | None = None
) -> tuple[str | None, list[tuple[str, str, str]]]:
    """(provider, [(title, url, snippet)]) from the first configured provider that answers."""
    if keys.get("brave"):
        data = fetcher.api(
            "GET", "https://api.search.brave.com/res/v1/web/search",
            headers={"X-Subscription-Token": keys["brave"] or ""}, params={"q": query, "count": 20},
        )
        if isinstance(data, dict):
            rows = ((data.get("web") or {}).get("results")) or []
            return "brave", [(r.get("title", ""), r.get("url", ""), r.get("description", "")) for r in rows]
    if keys.get("serpapi"):
        data = fetcher.api("GET", "https://serpapi.com/search.json", params={"engine": "google", "q": query, "num": 20, "api_key": keys["serpapi"]})
        if isinstance(data, dict):
            rows = data.get("organic_results") or []
            return "serpapi", [(r.get("title", ""), r.get("link", ""), r.get("snippet", "")) for r in rows]
    # Google CSE is metered (100 free/day): every query must first reserve quota.
    if keys.get("google_key") and keys.get("google_cx") and (cse_allowed is None or cse_allowed()):
        data = fetcher.api("GET", "https://www.googleapis.com/customsearch/v1", params={"key": keys["google_key"], "cx": keys["google_cx"], "q": query, "num": 10})
        if isinstance(data, dict):
            rows = data.get("items") or []
            return "google_cse", [(r.get("title", ""), r.get("link", ""), r.get("snippet", "")) for r in rows]
    return None, []


_TAIL = re.compile(r"\s*[|·]\s*LinkedIn.*$", re.I)
_LOCATION_LABEL = re.compile(r"\blocation:\s*([^·|\n]{2,80})", re.I)


def snippet_location(snippet: str) -> str | None:
    """A member's location from a LinkedIn search snippet ("Location: Pune" or a leading
    "Bengaluru, Karnataka, India · 500+ connections"), only when it resolves to a known
    canonical city or a single country. Pure."""
    from app.discovery.jobs.locations import canonical_location, country_code_of

    text = snippet or ""
    candidates = [m.group(1).strip() for m in _LOCATION_LABEL.finditer(text)]
    head = re.split(r"\s*[·|]\s*", text, maxsplit=1)[0].strip()
    if head and len(head) <= 80:
        candidates.append(head)
    for raw in candidates:
        if canonical_location(raw) not in (None, "Remote") or country_code_of(raw):
            return raw[:120]
    return None


def parse_result(title: str, url: str, snippet: str, company: str) -> Candidate | None:
    """A candidate from one search hit, only if it is a LinkedIn member profile that names
    the company. Pure."""
    linkedin = normalize_linkedin(url)
    if not linkedin:
        return None
    head = _TAIL.sub("", title or "").strip()
    parts = [p.strip() for p in re.split(r"\s+[-–—]\s+", head) if p.strip()]
    if not parts:
        return None
    name = clean_name(parts[0])
    if not name:
        return None
    text = f"{head} {snippet}".lower()
    if company.lower() not in text:
        return None
    role = None
    if len(parts) >= 3:
        role = parts[1]
    elif len(parts) == 2 and company.lower() not in parts[1].lower():
        role = parts[1]
    elif len(parts) == 2:
        m = re.match(r"(.+?)\s+(?:at|@)\s+", parts[1], re.I)
        role = m.group(1) if m else None
    return Candidate(
        name=name,
        source="search",
        source_url=f"https://www.{linkedin}",
        title=(role or None) and role[:120],
        linkedin=f"https://www.{linkedin}",
        location=snippet_location(snippet),
        confidence=SOURCE_CONFIDENCE["search"],
    )


def discover(
    fetcher: Fetcher, keys: dict[str, str | None], company: str, *, limit: int = 15,
    cse_allowed: Callable[[], bool] | None = None,
) -> tuple[str | None, list[Candidate]]:
    provider, rows = _results(fetcher, keys, query_for(company), cse_allowed)
    out: list[Candidate] = []
    seen: set[str] = set()
    for title, url, snippet in rows:
        cand = parse_result(title, url, snippet, company)
        if cand and cand.linkedin not in seen:
            seen.add(cand.linkedin or "")
            out.append(cand)
        if len(out) >= limit:
            break
    return provider, out
