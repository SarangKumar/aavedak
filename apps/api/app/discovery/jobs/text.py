"""Text normalization: HTML → readable text, keys, and content hashes."""

from __future__ import annotations

import hashlib
import html
import json
import re

_BLOCK_TAGS = re.compile(r"</?(?:p|div|br|h[1-6]|ul|ol|tr|section|article)\b[^>]*>", re.I)
_LI_OPEN = re.compile(r"<li\b[^>]*>", re.I)
_TAG = re.compile(r"<[^>]+>")
_SCRIPT_STYLE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.I | re.S)
_MULTI_BLANK = re.compile(r"\n\s*\n\s*\n+")
_SPACES = re.compile(r"[ \t ]+")

MAX_DESCRIPTION_CHARS = 20_000


def html_to_text(value: str | None) -> str:
    """Strip tags while keeping paragraph and bullet structure. Handles double-escaped
    HTML (Greenhouse returns `&lt;p&gt;`)."""
    if not value:
        return ""
    text = value
    if "&lt;" in text and "<" not in text:
        text = html.unescape(text)
    text = _SCRIPT_STYLE.sub(" ", text)
    text = _LI_OPEN.sub("\n• ", text)
    text = _BLOCK_TAGS.sub("\n", text)
    text = _TAG.sub(" ", text)
    text = html.unescape(text)
    lines = [_SPACES.sub(" ", line).strip() for line in text.splitlines()]
    text = "\n".join(lines)
    text = _MULTI_BLANK.sub("\n\n", text).strip()
    return text[:MAX_DESCRIPTION_CHARS]


def clean_line(value: object) -> str:
    if value is None:
        return ""
    return _SPACES.sub(" ", str(value)).strip()


def name_key(value: str) -> str:
    """Same as web `companyNameKey`: trimmed, lowercased, single spaces."""
    return re.sub(r"\s+", " ", value.strip().lower())


def slug_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def dedupe_key(company: str, title: str, location: str) -> str:
    """Cautious cross-source match key: company + title + first location token."""
    first_location = re.split(r"[,;/|·()]", location or "")[0]
    return "|".join((slug_key(company), slug_key(title), slug_key(first_location)))


def content_hash(fields: dict[str, object]) -> str:
    payload = json.dumps(fields, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()
