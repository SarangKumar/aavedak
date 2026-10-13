"""One person as reported by one source, before merging."""

from __future__ import annotations

from dataclasses import dataclass, field

# Base confidence per source (0–100); a field's confidence never exceeds its source's.
SOURCE_CONFIDENCE = {
    "company_site": 80,
    "github": 70,
    "hunter": 70,
    "apollo": 65,
    "search": 55,
    "careers_inbox": 60,
}

SOURCE_LABELS = {
    "company_site": "Company website",
    "github": "GitHub",
    "hunter": "Hunter",
    "apollo": "Apollo",
    "search": "Web search",
    "careers_inbox": "Careers page",
    "email_pattern": "Email pattern",
}


@dataclass
class Candidate:
    name: str
    source: str
    source_url: str | None = None
    title: str | None = None
    email: str | None = None
    # published (seen on a public page) | provider (third-party API) | inferred (pattern)
    email_status: str | None = None
    email_confidence: int | None = None
    phone: str | None = None  # only ever a number the person/company published
    linkedin: str | None = None
    github_login: str | None = None
    website: str | None = None
    twitter: str | None = None
    location: str | None = None
    confidence: int = 50
    is_inbox: bool = False
    extra_sources: list[str] = field(default_factory=list)

    def fields(self) -> dict[str, str | None]:
        return {
            "name": self.name,
            "role_title": self.title,
            "email": self.email,
            "phone": self.phone,
            "linkedin": self.linkedin,
            "github_login": self.github_login,
            "website_url": self.website,
            "twitter_url": self.twitter,
            "location": self.location,
        }
