"""Personio public job feed: {subdomain}.jobs.personio.de/xml?language=en

Keyless XML (`<workzag-jobs><position>…`). Some tenants are on `.jobs.personio.com`, so
the `.de` host is tried first and the `.com` host is the fallback. Descriptions are the
CDATA sections of `<jobDescriptions>`, joined under their headings.
"""

from __future__ import annotations

from xml.etree import ElementTree

import httpx

from app.discovery.jobs.filters import normalize_seniority
from app.discovery.jobs.models import FetchResult, RawPosting, SourceTarget
from app.discovery.jobs.providers.base import ProviderError, get_text, text_or_none

HOSTS = ("https://{token}.jobs.personio.de", "https://{token}.jobs.personio.com")
FEED = "{base}/xml?language=en"
JOB_URL = "{base}/job/{job_id}"


def _text(node, path: str) -> str | None:
    found = node.find(path)
    return text_or_none(found.text) if found is not None else None


def parse(xml: str, target: SourceTarget, *, base: str) -> list[RawPosting]:
    try:
        root = ElementTree.fromstring(xml.strip())
    except ElementTree.ParseError as exc:
        raise ProviderError(f"Personio feed was not valid XML: {exc.__class__.__name__}") from exc
    out: list[RawPosting] = []
    for position in root.findall("position"):
        job_id = _text(position, "id")
        title = _text(position, "name")
        if not job_id or not title:
            continue
        locations = [loc for loc in (_text(position, "office"),) if loc]
        locations += [
            text_or_none(office.text)
            for office in position.findall("additionalOffices/office")
            if text_or_none(office.text)
        ]
        sections: list[str] = []
        for section in position.findall("jobDescriptions/jobDescription"):
            heading = _text(section, "name")
            body = _text(section, "value")
            if heading:
                sections.append(heading)
            if body:
                sections.append(body)
        out.append(
            RawPosting(
                external_id=f"{target.token}:{job_id}",
                title=title,
                company_name=_text(position, "subcompany") or target.company_name,
                url=JOB_URL.format(base=base, job_id=job_id),
                locations=[l for l in locations if l],
                description="\n\n".join(sections),
                posted_at=_text(position, "createdAt"),
                employment_type=_text(position, "schedule") or _text(position, "employmentType"),
                seniority_hint=normalize_seniority(_text(position, "seniority")),
            )
        )
    return out


class PersonioProvider:
    key = "personio"

    def fetch(self, client: httpx.Client, target: SourceTarget) -> FetchResult:
        last: ProviderError | None = None
        for host in HOSTS:
            base = host.format(token=target.token)
            try:
                xml = get_text(client, FEED.format(base=base))
            except ProviderError as exc:
                last = exc
                continue
            if "<workzag-jobs" not in xml and "<position" not in xml:
                last = ProviderError("Not a Personio job feed.", retryable=False)
                continue
            return FetchResult(parse(xml, target, base=base))
        raise last or ProviderError("Personio feed not found.", retryable=False)
