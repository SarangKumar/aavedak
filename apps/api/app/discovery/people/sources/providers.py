"""Contact-data providers, each used only with its own key and within its terms: Hunter
(domain search: published addresses with their public source URLs, and the domain's email
pattern) and Apollo (people search by company domain). Provider addresses are kept as
`unverified` with the provider's confidence — even when the provider calls them verified.
Snov.io and Proxycurl are documented in DISCOVERY.md but not wired (no keys configured)."""

from __future__ import annotations

from app.discovery.people.candidate import SOURCE_CONFIDENCE, Candidate
from app.discovery.people.classify import clean_name
from app.discovery.people.emails import from_hunter
from app.discovery.people.fetch import Fetcher


def hunter(fetcher: Fetcher, key: str, domain: str, *, limit: int = 10) -> tuple[str | None, list[Candidate]]:
    """(email pattern, candidates)."""
    data = fetcher.api("GET", "https://api.hunter.io/v2/domain-search", params={"domain": domain, "limit": limit, "type": "personal", "api_key": key})
    body = data.get("data") if isinstance(data, dict) else None
    if not isinstance(body, dict):
        return None, []
    out: list[Candidate] = []
    for row in body.get("emails") or []:
        name = clean_name(" ".join(x for x in (row.get("first_name"), row.get("last_name")) if x))
        email = (row.get("value") or "").lower()
        if not name or not email or row.get("type") == "generic":
            continue
        sources = [s.get("uri") for s in row.get("sources") or [] if s.get("uri")]
        conf = min(int(row.get("confidence") or 50), SOURCE_CONFIDENCE["hunter"])
        out.append(Candidate(
            name=name, source="hunter", source_url=sources[0] if sources else None,
            title=row.get("position"), email=email, email_status="provider", email_confidence=conf,
            phone=row.get("phone_number") or None, linkedin=row.get("linkedin") or None,
            twitter=f"https://x.com/{row['twitter']}" if row.get("twitter") else None,
            confidence=conf,
        ))
    return from_hunter(body.get("pattern")), out


def apollo(fetcher: Fetcher, key: str, domain: str, *, limit: int = 10) -> list[Candidate]:
    data = fetcher.api(
        "POST", "https://api.apollo.io/api/v1/mixed_people/search",
        headers={"X-Api-Key": key, "Content-Type": "application/json", "Cache-Control": "no-cache"},
        json={"q_organization_domains_list": [domain], "page": 1, "per_page": limit},
    )
    rows = data.get("people") if isinstance(data, dict) else None
    out: list[Candidate] = []
    for row in rows or []:
        name = clean_name(row.get("name"))
        if not name:
            continue
        email = (row.get("email") or "").lower()
        if "email_not_unlocked" in email or not email.endswith("@" + domain):
            email = ""
        location = ", ".join(x for x in (row.get("city"), row.get("country")) if x) or None
        out.append(Candidate(
            name=name, source="apollo", source_url=row.get("linkedin_url"), title=row.get("title"),
            email=email or None, email_status="provider" if email else None,
            email_confidence=SOURCE_CONFIDENCE["apollo"] if email else None,
            linkedin=row.get("linkedin_url"), github_login=(row.get("github_url") or "").rstrip("/").rsplit("/", 1)[-1] or None,
            twitter=row.get("twitter_url"), location=location, confidence=SOURCE_CONFIDENCE["apollo"],
        ))
    return out
