"""GitHub REST API (public data only): the company's org, its *public* members, and each
member's public profile. Works without a token (60 requests/hour per IP); `GITHUB_TOKEN`
raises that to 5,000. An org is accepted only when its profile links the company's domain."""

from __future__ import annotations

import re

from app.discovery.people.candidate import SOURCE_CONFIDENCE, Candidate
from app.discovery.people.classify import clean_name, looks_like_title
from app.discovery.people.domains import registrable_domain
from app.discovery.people.fetch import Fetcher
from app.discovery.people.quota import GitHubGuard

API = "https://api.github.com"
# Keep this many requests of the per-company budget for search + MX after commit lookups.
COMMIT_LOOKUP_HEADROOM = 10


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


def find_org(
    fetcher: Fetcher, *, token: str | None, domain: str | None, hint: str | None, company: str,
    guard: GitHubGuard | None = None,
) -> tuple[str, str | None] | None:
    """(org login, org website domain). Tries the org the company site links to, then the
    company name as a login. Accepted only if the org's website is the company's domain (or,
    with no known domain, the org's display name matches the company)."""
    guesses = [g for g in (hint, re.sub(r"[^a-z0-9\-]", "", company.lower().replace(" ", "-")), re.sub(r"[^a-z0-9]", "", company.lower())) if g]
    seen: set[str] = set()
    for login in guesses:
        if login.lower() in seen:
            continue
        seen.add(login.lower())
        if guard and not guard.available():
            return None
        org = fetcher.api("GET", f"{API}/orgs/{login}", headers=_headers(token))
        if guard:
            guard.observe(fetcher.last_status, fetcher.last_headers)
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


def members(
    fetcher: Fetcher, *, token: str | None, org: str, company: str, limit: int = 12,
    guard: GitHubGuard | None = None, domain: str | None = None, stats: dict | None = None,
) -> list[Candidate]:
    if guard and not guard.available():
        return []
    listing = fetcher.api("GET", f"{API}/orgs/{org}/public_members", headers=_headers(token), params={"per_page": 50})
    if guard:
        guard.observe(fetcher.last_status, fetcher.last_headers)
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
        if guard and not guard.available():
            break
        user = fetcher.api("GET", f"{API}/users/{login}", headers=_headers(token))
        if guard:
            guard.observe(fetcher.last_status, fetcher.last_headers)
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
        elif fetcher.budget - fetcher.used > COMMIT_LOOKUP_HEADROOM and (not guard or guard.available()):
            commit_email = commit_author_email(fetcher, token=token, login=login, name=name, domain=domain, guard=guard)
            if commit_email:
                cand.email, cand.email_status, cand.email_confidence = commit_email, "published", base - 10
                if stats is not None:
                    stats["githubCommitEmails"] = stats.get("githubCommitEmails", 0) + 1
        out.append(cand)
    return out


def _usable_commit_email(email: str) -> bool:
    email = email.strip().lower()
    return bool(email) and "@" in email and "noreply" not in email and not email.endswith(
        ("@localhost", ".local", "@example.com", "@users.github.com")
    )


def pick_commit_email(authors: list[tuple[str, str]], *, name: str, domain: str | None) -> str | None:
    """From (author name, author email) pairs, prefer an address on the company domain,
    then one whose author name matches the profile name. Noreply addresses are skipped. Pure."""
    name_key = re.sub(r"[^a-z]", "", name.lower())
    by_name: str | None = None
    for author_name, email in authors:
        email = (email or "").strip().lower()
        if not _usable_commit_email(email):
            continue
        if domain and email.endswith("@" + domain.lower()):
            return email
        if by_name is None and name_key and re.sub(r"[^a-z]", "", (author_name or "").lower()) == name_key:
            by_name = email
    return by_name


def commit_author_email(
    fetcher: Fetcher, *, token: str | None, login: str, name: str, domain: str | None,
    guard: GitHubGuard | None = None,
) -> str | None:
    """Author email from the member's recent public pushes (at most 2 requests). Uses the
    commit list in PushEvent payloads, or one commit lookup when the payload omits it."""
    events = fetcher.api("GET", f"{API}/users/{login}/events/public", headers=_headers(token), params={"per_page": 30})
    if guard:
        guard.observe(fetcher.last_status, fetcher.last_headers)
    if not isinstance(events, list):
        return None
    authors: list[tuple[str, str]] = []
    head_lookup: tuple[str, str] | None = None
    for ev in events:
        if not isinstance(ev, dict) or ev.get("type") != "PushEvent":
            continue
        payload = ev.get("payload") or {}
        for commit in payload.get("commits") or []:
            author = (commit or {}).get("author") or {}
            authors.append((author.get("name") or "", author.get("email") or ""))
        repo = (ev.get("repo") or {}).get("name")
        if head_lookup is None and repo and payload.get("head"):
            head_lookup = (repo, payload["head"])
    found = pick_commit_email(authors, name=name, domain=domain)
    if found or head_lookup is None or fetcher.exhausted or (guard and not guard.available()):
        return found
    commit = fetcher.api("GET", f"{API}/repos/{head_lookup[0]}/commits/{head_lookup[1]}", headers=_headers(token))
    if guard:
        guard.observe(fetcher.last_status, fetcher.last_headers)
    if not isinstance(commit, dict):
        return None
    author = ((commit.get("commit") or {}).get("author")) or {}
    return pick_commit_email([(author.get("name") or "", author.get("email") or "")], name=name, domain=domain)
