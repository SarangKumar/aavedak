"""Find a company's hiring board by trying likely tokens on the public ATS posting APIs.

Shared by `scripts/verify_career_sources.py` (offline seed building) and
`jobs/company_discovery.py` (in-pipeline discovery). Only documented, keyless posting APIs
are called, one request per (platform, token) attempt, and every caller passes a request
budget: a company is never probed across the whole matrix.

A probe answers "is this a live board, and what does it list?" — nothing is stored here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

import httpx

from app.discovery.jobs import filters
from app.discovery.jobs.models import RawPosting, SourceTarget
from app.discovery.jobs.providers import ashby, breezy, greenhouse, lever, rippling, smartrecruiters, workable

# Many boards use the company name plus a suffix (e.g. Headout → "headoutcareers").
TOKEN_SUFFIXES = ("careers", "jobs", "hq", "inc", "india", "tech")


def token_variants(name: str) -> list[str]:
    """Likely board tokens, most likely first: "acmecorp", "acme-corp", "acme", then the joined
    name with common suffixes ("acmecorpcareers", …)."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", name) if w]
    if not words:
        return []
    joined = "".join(words).lower()
    candidates = [joined, "-".join(words).lower(), words[0].lower() if len(words) > 1 else ""]
    candidates += [f"{joined}{suffix}" for suffix in TOKEN_SUFFIXES]
    out: list[str] = []
    for token in candidates:
        if token and token not in out:
            out.append(token)
    return out


@dataclass(frozen=True)
class ProbeSpec:
    url: str  # `{t}` is the token
    params: dict[str, Any]
    parse: Callable[[Any, SourceTarget], list[RawPosting]]
    json: bool = True


# Platforms whose board can be found from a token alone. Personio (XML feed) and Teamtailor
# (its token is the company's own careers host) cannot, so they are reached through a
# careers page's embed instead of by probing.
PROBE_SPECS: dict[str, ProbeSpec] = {
    "greenhouse": ProbeSpec("https://boards-api.greenhouse.io/v1/boards/{t}/jobs", {}, greenhouse.parse),
    "lever": ProbeSpec("https://api.lever.co/v0/postings/{t}", {"mode": "json"}, lever.parse),
    "ashby": ProbeSpec("https://api.ashbyhq.com/posting-api/job-board/{t}", {}, ashby.parse),
    "workable": ProbeSpec("https://apply.workable.com/api/v1/widget/accounts/{t}", {}, workable.parse),
    "smartrecruiters": ProbeSpec(
        "https://api.smartrecruiters.com/v1/companies/{t}/postings",
        {"limit": 100, "country": "in"},
        smartrecruiters.parse_list,
    ),
    "rippling": ProbeSpec("https://ats.rippling.com/api/v2/board/{t}/jobs", {"page": 1}, rippling.parse_list),
    "breezy": ProbeSpec("https://{t}.breezy.hr/json", {}, breezy.parse),
}
# Probing order: the platforms most companies in the registry actually use come first, so a
# small request budget still finds most boards.
PROBE_ORDER = ("greenhouse", "ashby", "lever", "smartrecruiters", "workable", "rippling", "breezy")


@dataclass(frozen=True)
class BoardProbe:
    provider: str
    token: str
    total: int
    india: int
    engineering: int


def probe_board(
    client: httpx.Client, provider: str, token: str, company_name: str
) -> BoardProbe | None:
    """One request. None when the token is not a live board on that platform."""
    spec = PROBE_SPECS.get(provider)
    if spec is None:
        return None
    try:
        response = client.get(spec.url.format(t=token), params=spec.params)
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    try:
        payload = response.json()
    except ValueError:
        return None
    target = SourceTarget(id="", company_name=company_name, provider=provider, token=token, careers_url="")
    try:
        postings = spec.parse(payload, target)
    except Exception:  # noqa: BLE001 — an unexpected payload shape just means "not a board"
        return None
    if not postings:
        return None
    india = [p for p in postings if filters.is_india_eligible(p.locations, p.country_code)]
    engineering = [
        p for p in india
        if filters.is_engineering_title(p.title) and not filters.is_executive_title(p.title)
    ]
    return BoardProbe(provider, token, len(postings), len(india), len(engineering))


def find_board(
    client: httpx.Client,
    company_name: str,
    *,
    max_requests: int,
    tokens: list[str] | None = None,
    providers: tuple[str, ...] = PROBE_ORDER,
) -> tuple[BoardProbe | None, int]:
    """First live board for this company within `max_requests`, plus the requests used.

    Tokens are tried outermost so the most likely spelling is checked on every platform
    before a less likely one is tried anywhere.
    """
    candidates = tokens if tokens is not None else token_variants(company_name)
    used = 0
    for token in candidates:
        for provider in providers:
            if used >= max_requests:
                return None, used
            used += 1
            found = probe_board(client, provider, token, company_name)
            if found:
                return found, used
    return None, used
