"""Read one job posting from its link, for the web "Add job from a link" form.

Reuses the scan providers: hosted ATS boards are read through their public APIs (the single
posting endpoint where one exists, otherwise the board, then the matching posting), and any
other page through its schema.org JobPosting JSON-LD (robots.txt respected). Nothing is
filtered or stored: the user reviews the fields and saves the job themselves. Fields the
source does not give stay empty; nothing is guessed.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from app.discovery.jobs.models import RawPosting, SourceTarget
from app.discovery.jobs.providers import ProviderError, detect_source
from app.discovery.jobs.providers import ashby, greenhouse, lever, smartrecruiters, workable
from app.discovery.jobs.providers.base import as_dict, get_json, get_text
from app.discovery.jobs.providers.jsonld import parse_html, robots_allows
from app.discovery.jobs.text import clean_line, html_to_text
from app.discovery.timeutil import parse_datetime, to_iso

# Job sites without permitted automated access (see DISCOVERY.md): never fetched.
BLOCKED_HOSTS = {
    "linkedin.com": "linkedin",
    "naukri.com": "other",
    "indeed.com": "indeed",
    "indeed.co.in": "indeed",
    "glassdoor.com": "other",
    "glassdoor.co.in": "other",
    "wellfound.com": "other",
    "angel.co": "other",
    "foundit.in": "other",
    "instahyre.com": "other",
    "cutshort.io": "other",
}


class JobLinkError(ValueError):
    """The link can't be read; `message` is shown to the user as-is."""

    def __init__(self, message: str, *, source: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        # Web job source to preselect when the user falls back to manual entry.
        self.source = source


@dataclass(frozen=True)
class ParsedJob:
    title: str
    company: str
    location: str
    url: str
    description: str
    postedAt: str | None
    source: str  # web JobSource: "careers" for company boards/pages
    provider: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def blocked_source(url: str) -> str | None:
    """Web source key when the link is on a job site we must not read, else None."""
    host = urlparse(url if "://" in url else f"https://{url}").netloc.lower().split(":")[0]
    for domain, source in BLOCKED_HOSTS.items():
        if host == domain or host.endswith(f".{domain}"):
            return source
    return None


def posting_id(provider: str, url: str) -> str | None:
    """The posting's id inside a board URL, or None for a board/listing link."""
    parsed = urlparse(url if "://" in url else f"https://{url}")
    segments = [s for s in parsed.path.split("/") if s]
    query = parse_qs(parsed.query)
    if provider == "greenhouse":
        if query.get("gh_jid"):
            return query["gh_jid"][0]
        if "jobs" in segments and segments.index("jobs") + 1 < len(segments):
            return segments[segments.index("jobs") + 1]
        return None
    if provider in ("lever", "ashby"):
        # /{token}/{id}[/apply]
        return segments[1] if len(segments) >= 2 else None
    if provider == "workable":
        if "j" in segments and segments.index("j") + 1 < len(segments):
            return segments[segments.index("j") + 1]
        return None
    if provider == "smartrecruiters":
        # /{Company}/{id}-{slug}
        if len(segments) >= 2:
            match = re.match(r"^(\d+)", segments[1])
            return match.group(1) if match else None
        return None
    return None


def _join_locations(locations: list[str]) -> str:
    seen: list[str] = []
    for loc in locations:
        loc = ", ".join(p for p in (clean_line(part) for part in str(loc).split(",")) if p)
        if loc and loc.lower() not in (s.lower() for s in seen):
            seen.append(loc)
    return " · ".join(seen[:3])


def _to_parsed(posting: RawPosting, *, fallback_url: str, provider: str) -> ParsedJob:
    posted = parse_datetime(posting.posted_at) if posting.posted_at is not None else None
    return ParsedJob(
        title=clean_line(posting.title),
        company=clean_line(posting.company_name),
        location=_join_locations(posting.locations),
        url=posting.url or fallback_url,
        description=html_to_text(posting.description),
        postedAt=to_iso(posted) if posted else None,
        source="careers",
        provider=provider,
    )


def _match(postings: list[RawPosting], job_id: str) -> RawPosting | None:
    for posting in postings:
        if posting.external_id.endswith(f":{job_id}") or (posting.url and job_id in posting.url):
            return posting
    return None


def _company_from_token(token: str) -> str:
    return token.replace("-", " ").replace("_", " ").strip().title()


def fetch_job_from_url(client: httpx.Client, url: str) -> ParsedJob:
    url = url.strip()
    if not url:
        raise JobLinkError("Paste a job link.")
    blocked = blocked_source(url)
    if blocked:
        raise JobLinkError(
            "This job site doesn't allow automated reading, so Aavedak can't fetch it. "
            "Fill in the details below; the link is kept on the job.",
            source=blocked,
        )
    host = urlparse(url if "://" in url else f"https://{url}").netloc
    if not host or "." not in host or any(ch.isspace() for ch in url):
        raise JobLinkError("That doesn't look like a valid job link.")
    try:
        detected = detect_source(url)
    except ValueError as exc:
        raise JobLinkError("That doesn't look like a valid job link.") from exc

    provider = detected.provider
    target = SourceTarget(
        id="",
        company_name=_company_from_token(detected.token) if provider != "jsonld" else "",
        provider=provider,
        token=detected.token,
        careers_url=detected.careers_url,
    )
    try:
        if provider == "jsonld":
            if not robots_allows(client, url):
                raise JobLinkError("This site's robots.txt doesn't allow reading the page.")
            postings = parse_html(get_text(client, url), target, url)
            if not postings:
                raise JobLinkError(
                    "No job details found on this page (the site may load them with "
                    "JavaScript). Fill in the details below."
                )
            posting = postings[0] if len(postings) == 1 else (_match(postings, url) or postings[0])
            return _to_parsed(posting, fallback_url=url, provider=provider)

        job_id = posting_id(provider, url)
        if not job_id:
            raise JobLinkError(
                "This is a careers board, not a single job. Open the job and paste its own link."
            )
        if provider == "greenhouse":
            payload = get_json(client, f"{greenhouse.API.format(token=target.token)}/{job_id}")
            postings = greenhouse.parse({"jobs": [payload]}, target)
        elif provider == "lever":
            payload = get_json(client, f"{lever.API.format(token=target.token)}/{job_id}")
            postings = lever.parse([payload], target)
        elif provider == "smartrecruiters":
            payload = as_dict(
                get_json(client, smartrecruiters.DETAIL_API.format(token=target.token, id=job_id))
            )
            postings = smartrecruiters.parse_list({"content": [payload]}, target)
            for posting in postings:
                posting.description = smartrecruiters.parse_detail(payload)
        elif provider == "ashby":
            postings = ashby.AshbyProvider().fetch(client, target).postings
        else:  # workable
            postings = workable.WorkableProvider().fetch(client, target).postings
        posting = _match(postings, job_id)
        if posting is None:
            raise JobLinkError("This job wasn't found on the company's board. It may be closed.")
        return _to_parsed(posting, fallback_url=url, provider=provider)
    except ProviderError as exc:
        message = str(exc)
        if "404" in message:
            message = "The job or board wasn't found. It may be closed or the link is wrong."
        raise JobLinkError(f"Couldn't read this job: {message}") from exc

