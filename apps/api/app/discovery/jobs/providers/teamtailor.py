"""Teamtailor public job feed: {careers domain}/jobs.rss

Teamtailor customers nearly always serve their careers site from their own domain, so the
token is the careers host itself (e.g. `career.example.com`), not a board slug. The feed is
keyless RSS with Teamtailor's `tt:` location/department extensions.
"""

from __future__ import annotations

import re
from xml.etree import ElementTree

import httpx

from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, get_text, text_or_none

NS = {"tt": "https://teamtailor.com/locations"}
FEED = "https://{host}/jobs.rss"
_HOST = re.compile(r"^[a-z0-9]([a-z0-9.-]{1,120})\.[a-z]{2,}$")


def feed_host(token: str) -> str:
    """The careers host from a token that may have been stored as a full URL."""
    host = token.strip().lower()
    host = re.sub(r"^https?://", "", host).split("/")[0].split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    if not _HOST.match(host):
        raise ProviderError(f"Not a Teamtailor careers host: {token}", retryable=False)
    return host


def _text(node, path: str) -> str | None:
    found = node.find(path, NS)
    return text_or_none(found.text) if found is not None else None


def parse(xml: str, target: SourceTarget) -> list[RawPosting]:
    try:
        root = ElementTree.fromstring(xml.strip())
    except ElementTree.ParseError as exc:
        raise ProviderError(f"Teamtailor feed was not valid XML: {exc.__class__.__name__}") from exc
    out: list[RawPosting] = []
    for item in root.findall("./channel/item"):
        title = _text(item, "title")
        link = _text(item, "link")
        job_id = _text(item, "guid") or link
        if not title or not job_id:
            continue
        locations: list[str] = []
        for location in item.findall("tt:locations/tt:location", NS):
            city = _text(location, "tt:city") or _text(location, "tt:name")
            country = _text(location, "tt:country")
            name = ", ".join(p for p in (city, country) if p)
            if name:
                locations.append(name)
        remote_status = (_text(item, "remoteStatus") or "").lower()
        if remote_status in ("fully", "remote") and not locations:
            locations.append("Remote")
        out.append(
            RawPosting(
                external_id=f"{target.token}:{job_id}",
                title=title,
                company_name=target.company_name,
                url=link,
                locations=locations,
                description=_text(item, "description") or "",
                posted_at=_text(item, "pubDate"),
                remote=remote_status in ("fully", "remote", "hybrid"),
            )
        )
    return out


class TeamtailorProvider:
    key = "teamtailor"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        xml = get_text(client, FEED.format(host=feed_host(target.token)))
        if "<rss" not in xml[:400]:
            raise ProviderError("Not a Teamtailor RSS feed.", retryable=False)
        return FetchResult(parse(xml, target))
