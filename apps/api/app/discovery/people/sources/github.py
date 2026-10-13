"""GitHub REST API (public data only): the company's org, its *public* members, and each
member's public profile. Works without a token (60 requests/hour per IP); `GITHUB_TOKEN`
raises that to 5,000. An org is accepted only when its profile links the company's domain."""

from __future__ import annotations

import re

from app.discovery.people.candidate import SOURCE_CONFIDENCE, Candidate
from app.discovery.people.classify import clean_name, looks_like_title
from app.discovery.people.domains import registrable_domain
from app.discovery.people.fetch import Fetcher

API = "https://api.github.com"


def _headers(token: str | None) -> dict[str, str]:
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _location(value: object) -> str | None:
    text = value.strip() if isinstance(value, str) else ""
    return None if text.lower() in ("", "null", "none", "n/a", "earth", "remote", "internet") else text


def _blog_domain(blog: str | None) -> str | None:
    if not blog:
        return None
    host = re.sub(r"^https?://", "", blog.strip().lower()).split("/")[0]
    return registrable_domain(host) if "." in host else None


def find_org(fetcher: Fetcher, *, token: str | None, domain: str | None, hint: str | None, company: str) -> tuple[str, str | None] | None:
    """(org login, org website domain). Tries the org the company site links to, then the
    company name as a login. Accepted only if the org's website is the company's domain (or,
    with no known domain, the org's display name matches the company)."""
    guesses = [g for g in (hint, re.sub(r"[^a-z0-9\-]", "", company.lower().replace(" ", "-")), re.sub(r"[^a-z0-9]", "", company.lower())) if g]
    seen: set[str] = set()
    for login in guesses:
        if login.lower() in seen:
            continue
        seen.add(login.lower())
        org = fetcher.api("GET", f"{API}/orgs/{login}", headers=_headers(token))
        if not isinstance(org, dict) or not org.get("login"):
            continue
        org_domain = _blog_domain(org.get("blog"))
        if domain and org_domain == domain:
            return org["login"], org_domain
        same_name = (org.get("name") or "").strip().lower() == company.strip().lower()
        if same_name and (org_domain or org.get("login", "").lower() == login.lower()):
            # Display name is exactly the company's (e.g. Stripe → github.com/stripe, whose
            # site is stripe.dev): accept, but keep the domain we already trust.
            return org["login"], domain or org_domain
        if login == hint and not domain:
            return org["login"], org_domain
    return None


def members(fetcher: Fetcher, *, token: str | None, org: str, company: str, limit: int = 12) -> list[Candidate]:
    listing = fetcher.api("GET", f"{API}/orgs/{org}/public_members", headers=_headers(token), params={"per_page": 50})
    if not isinstance(listing, list):
        return []
    out: list[Candidate] = []
    base = SOURCE_CONFIDENCE["github"]
    for member in listing:
        if len(out) >= limit or fetcher.exhausted:
            break
        login = member.get("login") if isinstance(member, dict) else None
        if not login or member.get("type") != "User":
            continue
        user = fetcher.api("GET", f"{API}/users/{login}", headers=_headers(token))
        if not isinstance(user, dict):
            continue
        name = clean_name(user.get("name"))
        if not name:
            continue  # no real name on the profile: not useful as a contact
        bio = (user.get("bio") or "").strip()
        title = bio if looks_like_title(bio) and len(bio) <= 60 and "\n" not in bio and not bio.endswith(".") else None
        cand = Candidate(
            name=name,
            source="github",
            source_url=user.get("html_url") or f"https://github.com/{login}",
            title=title,
            github_login=login,
            location=_location(user.get("location")),
            website=(user.get("blog") or "").strip() or None,
            twitter=f"https://x.com/{user['twitter_username']}" if user.get("twitter_username") else None,
            confidence=base,
        )
        company_field = (user.get("company") or "").lower().lstrip("@")
        if company_field and (company.lower() in company_field or org.lower() in company_field):
            cand.confidence = base + 5  # profile also says they work there
        email = (user.get("email") or "").strip().lower()
        if email:  # the user chose to make this public on their profile
            cand.email, cand.email_status, cand.email_confidence = email, "published", base
        out.append(cand)
    return out
