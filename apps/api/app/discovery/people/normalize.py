"""Pure helpers for people import: CSV parsing, contact normalization, dedupe keys, and
person ↔ job relevance. No DB access."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import asdict, dataclass, field
from urllib.parse import urlparse

from app.discovery.jobs.text import name_key, slug_key

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
_LINKEDIN_RE = re.compile(r"^/in/([A-Za-z0-9\-_%.]+)/?")

HEADER_ALIASES = {
    "name": ("name", "full_name", "full name", "person"),
    "company": ("company", "company_name", "organization", "organisation", "employer"),
    "role_title": ("role", "title", "role_title", "job_title", "designation", "position"),
    "email": ("email", "email_address", "work_email"),
    "linkedin": ("linkedin", "linkedin_url", "linkedin profile", "profile_url"),
    "source_url": ("source_url", "source", "provenance", "provenance_url", "url"),
    "phone": ("phone", "phone_number", "mobile"),
}


@dataclass
class PersonRow:
    name: str
    company: str | None = None
    role_title: str | None = None
    email: str | None = None
    linkedin: str | None = None
    source_url: str | None = None

    def to_payload(self) -> dict[str, str | None]:
        return asdict(self)


@dataclass
class ParsedImport:
    rows: list[PersonRow] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)
    phones_ignored: int = 0
    header_error: str | None = None


def normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    email = value.strip().lower()
    return email if _EMAIL_RE.match(email) else None


def normalize_linkedin(value: str | None) -> str | None:
    """`https://in.linkedin.com/in/Jane-Doe/?x=1` → `linkedin.com/in/jane-doe`."""
    if not value:
        return None
    raw = value.strip()
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    host = parsed.netloc.lower()
    if not (host == "linkedin.com" or host.endswith(".linkedin.com")):
        return None
    match = _LINKEDIN_RE.match(parsed.path)
    if not match:
        return None
    return f"linkedin.com/in/{match.group(1).lower()}"


def person_dedupe_key(name: str, company: str | None) -> str:
    return f"{slug_key(name)}|{name_key(company or '')}"


def _clean(value: object, limit: int = 300) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text[:limit] or None


def parse_people_csv(text: str) -> ParsedImport:
    """Parse a CSV with a header row. Recognised columns: name, company, role/title, email,
    linkedin, source_url. Phone columns are ignored on purpose (system-imported contacts
    never store phone numbers). Rows without a name are reported as invalid."""
    result = ParsedImport()
    reader = csv.reader(io.StringIO(text.strip()))
    try:
        header = next(reader)
    except StopIteration:
        result.header_error = "Empty input."
        return result
    columns: dict[str, int] = {}
    for index, raw in enumerate(header):
        key = raw.strip().lower()
        for field_name, aliases in HEADER_ALIASES.items():
            if key in aliases and field_name not in columns:
                columns[field_name] = index
    if "name" not in columns:
        result.header_error = "Header row must include a `name` column."
        return result

    def cell(row: list[str], field_name: str) -> str | None:
        index = columns.get(field_name)
        return _clean(row[index]) if index is not None and index < len(row) else None

    for row in reader:
        if not any(c.strip() for c in row):
            continue
        name = cell(row, "name")
        if not name:
            result.invalid.append(",".join(row)[:200])
            continue
        if cell(row, "phone"):
            result.phones_ignored += 1
        result.rows.append(
            PersonRow(
                name=name[:200],
                company=cell(row, "company"),
                role_title=cell(row, "role_title"),
                email=cell(row, "email"),
                linkedin=cell(row, "linkedin"),
                source_url=cell(row, "source_url"),
            )
        )
    return result


_RECRUITER_RE = re.compile(r"\b(?:recruit\w*|talent|hr|human resources|people partner|hiring)\b", re.I)
_ENG_LEAD_RE = re.compile(
    r"\b(?:engineering manager|head of engineering|vp engineering|cto|tech(?:nical)? lead|"
    r"director,? engineering|team lead)\b",
    re.I,
)
_ENG_RE = re.compile(r"\b(?:engineer|developer|sde|swe|architect|scientist)\b", re.I)


def job_relevance(role_title: str | None, job_title: str) -> tuple[int, str]:
    """How useful this person likely is for a referral to this job (0–100) and why.
    A signal for ordering only; it says nothing about willingness to refer."""
    role = role_title or ""
    if _RECRUITER_RE.search(role):
        return 70, "Recruiting / talent at this company"
    if _ENG_LEAD_RE.search(role):
        return 65, "Engineering leadership at this company"
    if _ENG_RE.search(role):
        overlap = set(slug_key(role).split()) & set(slug_key(job_title).split()) - {"engineer", "senior", "sr"}
        if overlap:
            return 55, "Works in a similar engineering area"
        return 45, "Engineer at this company"
    return 25, "Works at this company"
