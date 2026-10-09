"""Provider registry and career-URL → (provider, token) detection."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

from app.discovery.jobs.providers.ashby import AshbyProvider
from app.discovery.jobs.providers.base import Provider, ProviderError
from app.discovery.jobs.providers.greenhouse import GreenhouseProvider
from app.discovery.jobs.providers.json_feed import JsonFeedProvider
from app.discovery.jobs.providers.jsonld import JsonLdProvider, UnsupportedPage
from app.discovery.jobs.providers.lever import LeverProvider
from app.discovery.jobs.providers.smartrecruiters import SmartRecruitersProvider
from app.discovery.jobs.providers.workable import WorkableProvider

PROVIDERS: dict[str, Provider] = {
    p.key: p
    for p in (
        GreenhouseProvider(),
        LeverProvider(),
        AshbyProvider(),
        WorkableProvider(),
        SmartRecruitersProvider(),
        JsonLdProvider(),
        JsonFeedProvider(),
    )
}

BOARD_URLS = {
    "greenhouse": "https://job-boards.greenhouse.io/{}",
    "lever": "https://jobs.lever.co/{}",
    "ashby": "https://jobs.ashbyhq.com/{}",
    "workable": "https://apply.workable.com/{}",
    "smartrecruiters": "https://careers.smartrecruiters.com/{}",
}

_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")


@dataclass(frozen=True)
class DetectedSource:
    provider: str
    token: str
    careers_url: str


def get_provider(key: str) -> Provider:
    provider = PROVIDERS.get(key)
    if provider is None:
        raise ProviderError(f"Unknown provider: {key}")
    return provider


def detect_source(url: str) -> DetectedSource:
    """Map a career-page URL to the provider that can read it.

    Hosted ATS boards use their public JSON API; anything else falls back to JSON-LD on
    the page itself. Raises ValueError for non-http(s) URLs.
    """
    raw = url.strip()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"Not a valid http(s) URL: {url}")
    host = parsed.netloc.lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    segments = [s for s in parsed.path.split("/") if s]
    first = segments[0] if segments else ""

    def board(provider: str, token: str) -> DetectedSource:
        if not _SEGMENT.match(token):
            raise ValueError(f"Could not read a {provider} board name from {url}")
        # SmartRecruiters company identifiers keep their case; others are lowercase.
        token = token if provider == "smartrecruiters" else token.lower()
        return DetectedSource(provider, token, BOARD_URLS[provider].format(token))

    if host in ("boards.greenhouse.io", "job-boards.greenhouse.io", "boards.eu.greenhouse.io"):
        return board("greenhouse", first)
    if host == "boards-api.greenhouse.io" and len(segments) >= 3:
        return board("greenhouse", segments[2])
    if host in ("jobs.lever.co", "jobs.eu.lever.co"):
        return board("lever", first)
    if host == "jobs.ashbyhq.com":
        return board("ashby", first)
    if host == "apply.workable.com" and first not in ("", "j", "api"):
        return board("workable", first)
    if host.endswith(".workable.com") and host.count(".") == 2 and not host.startswith("apply."):
        return board("workable", host.split(".")[0])
    if host in ("careers.smartrecruiters.com", "jobs.smartrecruiters.com"):
        return board("smartrecruiters", first)
    clean = parsed._replace(fragment="").geturl()
    return DetectedSource("jsonld", clean, clean)


__all__ = [
    "PROVIDERS",
    "BOARD_URLS",
    "DetectedSource",
    "ProviderError",
    "UnsupportedPage",
    "detect_source",
    "get_provider",
]
