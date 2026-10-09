"""Official career pages that embed schema.org `JobPosting` JSON-LD.

Only the configured page is fetched (no crawling), and only when robots.txt allows it.
Pages that render jobs with client-side JavaScript and carry no JSON-LD yield no postings;
the scan records them as `unsupported` instead of guessing.
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterator
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from app.discovery.config import get_settings
from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, as_dict, as_list, get_text, text_or_none
from app.discovery.jobs.text import content_hash

_LD_RE = re.compile(
    r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.I | re.S
)


class UnsupportedPage(ProviderError):
    """Page has no JobPosting JSON-LD (likely rendered client-side)."""

    def __init__(self, message: str) -> None:
        super().__init__(message, retryable=False)


def _walk(node: Any) -> Iterator[dict[str, Any]]:
    if isinstance(node, list):
        for item in node:
            yield from _walk(item)
    elif isinstance(node, dict):
        types = node.get("@type")
        type_list = types if isinstance(types, list) else [types]
        if "JobPosting" in type_list:
            yield node
        for key in ("@graph", "itemListElement", "item", "mainEntity"):
            if key in node:
                yield from _walk(node[key])


def _address_parts(location: Any) -> tuple[list[str], str | None]:
    names: list[str] = []
    country: str | None = None
    for loc in location if isinstance(location, list) else [location]:
        addr = as_dict(as_dict(loc).get("address"))
        c = addr.get("addressCountry")
        c_name = text_or_none(as_dict(c).get("name")) if isinstance(c, dict) else text_or_none(c)
        parts = [text_or_none(addr.get("addressLocality")), text_or_none(addr.get("addressRegion")), c_name]
        joined = ", ".join(p for p in parts if p)
        if joined:
            names.append(joined)
        country = country or c_name
    return names, country


def parse_html(html: str, target: SourceTarget, page_url: str) -> list[RawPosting]:
    out: list[RawPosting] = []
    for block in _LD_RE.findall(html):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        for job in _walk(data):
            title = text_or_none(job.get("title"))
            if not title:
                continue
            locations, country = _address_parts(job.get("jobLocation"))
            for req in as_list(job.get("applicantLocationRequirements")) or [job.get("applicantLocationRequirements")]:
                name = text_or_none(as_dict(req).get("name"))
                if name:
                    locations.append(name)
            url = text_or_none(job.get("url"))
            url = urljoin(page_url, url) if url else None
            identifier = job.get("identifier")
            ident = text_or_none(as_dict(identifier).get("value")) if isinstance(identifier, dict) else text_or_none(identifier)
            # Stable id: source identifier, else URL, else a hash of the visible fields.
            external = ident or url or content_hash({"t": title, "l": locations})[:16]
            org = as_dict(job.get("hiringOrganization"))
            out.append(
                RawPosting(
                    external_id=f"{target.token}:{external}",
                    title=title,
                    company_name=text_or_none(org.get("name")) or target.company_name,
                    url=url or page_url,
                    locations=locations,
                    country_code=country,
                    description=job.get("description") or "",
                    posted_at=job.get("datePosted"),
                    employment_type=text_or_none(job.get("employmentType")),
                    remote=str(job.get("jobLocationType") or "").upper() == "TELECOMMUTE",
                )
            )
    return out


def robots_allows(client: httpx.Client, url: str) -> bool:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    try:
        response = client.get(robots_url)
    except httpx.HTTPError:
        return True  # unreachable robots.txt → standard practice is to allow
    if response.status_code >= 400:
        return True
    parser = RobotFileParser()
    parser.parse(response.text.splitlines())
    return parser.can_fetch(get_settings().discovery_user_agent, url)


class JsonLdProvider:
    key = "jsonld"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        url = target.careers_url
        if not robots_allows(client, url):
            raise ProviderError("robots.txt disallows this page.", retryable=False)
        html = get_text(client, url)
        postings = parse_html(html, target, url)
        if not postings:
            raise UnsupportedPage("No JobPosting JSON-LD on this page (likely rendered client-side).")
        return FetchResult(postings)
