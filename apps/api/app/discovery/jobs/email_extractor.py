"""Extract email addresses from job posting descriptions.

Parses job description text to find contact email addresses, with filtering
for common noreply addresses and invalid/test domains.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal


# Email regex: basic RFC 5322 pattern, strict enough to avoid false positives
_EMAIL_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    re.MULTILINE,
)

# Domains that are clearly test/noreply addresses
_INVALID_DOMAINS = {
    "example.com",
    "example.org",
    "test.com",
    "test.org",
    "localhost",
    "noreply.com",
    "no-reply.com",
    "donotreply.com",
    "do-not-reply.com",
}

# Common noreply patterns in the local part
_NOREPLY_PATTERNS = {
    "noreply",
    "no-reply",
    "do-not-reply",
    "donotreply",
    "bounces",
    "reply-not",
    "notification",
}


# Local-part keywords that mark an address as an application / recruiting contact.
_APPLICATION_LOCALS = (
    "job",
    "jobs",
    "career",
    "careers",
    "hr",
    "recruit",
    "recruiting",
    "recruitment",
    "recruiter",
    "hiring",
    "talent",
    "apply",
    "application",
    "people",
    "work",
    "join",
)


@dataclass(frozen=True)
class ExtractedEmail:
    """An email address extracted from job description."""

    email: str
    confidence: Literal["high", "medium"] = "medium"


def extract_emails(text: str | None) -> list[ExtractedEmail]:
    """Extract unique email addresses from text with filtering.

    Args:
        text: Job posting description or other text to search

    Returns:
        List of extracted emails with confidence levels. High confidence if
        only one unique email found; medium if multiple. Filtered for noreply
        and test domains. Normalized to lowercase.
    """
    if not text:
        return []

    # Find all email matches
    matches = _EMAIL_PATTERN.findall(text)
    if not matches:
        return []

    # Normalize and deduplicate
    normalized = set()
    for email in matches:
        email_lower = email.lower().strip()

        # Skip if domain is obviously invalid/test
        if "@" in email_lower:
            local, domain = email_lower.rsplit("@", 1)
            if domain in _INVALID_DOMAINS:
                continue

            # Skip if local part is a noreply variant
            if any(p in local.replace("-", "").replace("_", "") for p in _NOREPLY_PATTERNS):
                continue

            normalized.add(email_lower)

    if not normalized:
        return []

    # Determine confidence based on count
    confidence: Literal["high", "medium"] = "high" if len(normalized) == 1 else "medium"

    return [ExtractedEmail(email=e, confidence=confidence) for e in sorted(normalized)]


def is_application_inbox(email: str) -> bool:
    """True when the local part marks the address as an application / recruiting inbox
    (e.g. `careers@`, `jobs@`, `hr@`, `talent.india@`) rather than a personal mailbox."""
    local = email.rsplit("@", 1)[0].lower()
    tokens = re.split(r"[._\-+]", local)
    return any(tok in _APPLICATION_LOCALS for tok in tokens)


def best_application_email(text: str | None) -> str | None:
    """The single email most likely to be an application contact for a posting, or None.

    Only returns an address that is genuinely published in the posting text — never a
    guess. When several emails appear, it keeps one only if its local part clearly marks
    it as an application / recruiting inbox (e.g. `careers@`, `jobs@`, `hr@`); otherwise
    it returns None rather than pick an arbitrary (possibly personal) address.
    """
    found = extract_emails(text)
    if not found:
        return None
    if len(found) == 1:
        return found[0].email
    for item in found:
        if is_application_inbox(item.email):
            return item.email
    return None
