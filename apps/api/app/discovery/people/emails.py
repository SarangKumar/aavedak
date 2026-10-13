"""Company email formats, learned only from evidence (addresses that were published next to
a name, or a provider's reported pattern). Inferred addresses are stored as `inferred` with a
confidence — never `verified`. No SMTP probing: the only network check is an MX lookup over
DNS-over-HTTPS, which tells us the domain receives mail at all."""

from __future__ import annotations

import re
from collections import Counter

from app.discovery.people.classify import ascii_fold

PATTERNS: dict[str, str] = {
    "first.last": "{first}.{last}",
    "firstlast": "{first}{last}",
    "first_last": "{first}_{last}",
    "first-last": "{first}-{last}",
    "flast": "{f}{last}",
    "f.last": "{f}.{last}",
    "firstl": "{first}{l}",
    "first.l": "{first}.{l}",
    "last.first": "{last}.{first}",
    "lastfirst": "{last}{first}",
    "lastf": "{last}{f}",
    "first": "{first}",
    "last": "{last}",
}

# Hunter reports patterns like "{first}.{last}" / "{f}{last}".
_HUNTER = {template: key for key, template in PATTERNS.items()}

_EMAIL = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$")


def name_parts(name: str) -> tuple[str, str] | None:
    """('jane', 'doe') from 'Dr. Jane Q. Doe-Smith'; None without a first and last name."""
    tokens = [re.sub(r"[^a-z]", "", t) for t in ascii_fold(name).lower().replace("-", "").split()]
    tokens = [t for t in tokens if t and t not in {"dr", "mr", "mrs", "ms", "prof", "jr", "sr", "ii", "iii"}]
    if len(tokens) < 2:
        return None
    return tokens[0], tokens[-1]


def render(pattern: str, name: str, domain: str) -> str | None:
    parts = name_parts(name)
    template = PATTERNS.get(pattern)
    if not parts or not template:
        return None
    first, last = parts
    local = template.format(first=first, last=last, f=first[0], l=last[0])
    email = f"{local}@{domain.lower()}"
    return email if _EMAIL.match(email) else None


def matching_patterns(name: str, email: str) -> list[str]:
    local, _, domain = email.lower().partition("@")
    return [p for p in PATTERNS if render(p, name, domain) == f"{local}@{domain}"]


def from_hunter(pattern: str | None) -> str | None:
    return _HUNTER.get((pattern or "").strip())


def infer_pattern(evidence: list[tuple[str, str]], domain: str) -> tuple[str, int, int] | None:
    """Best `(pattern, evidence_count, confidence)` from published (name, email) pairs on
    `domain`, or None. One pair is enough only when it fits a single pattern; ties between
    patterns lower the confidence. Pure."""
    domain = domain.lower()
    votes: Counter[str] = Counter()
    unique_pairs = 0
    seen: set[str] = set()
    for name, email in evidence:
        email = email.lower()
        if not email.endswith("@" + domain) or email in seen:
            continue
        seen.add(email)
        fits = matching_patterns(name, email)
        if not fits:
            continue
        unique_pairs += 1
        for p in fits:
            votes[p] += 1
    if not votes:
        return None
    ranked = votes.most_common()
    best, count = ranked[0]
    tied = len(ranked) > 1 and ranked[1][1] == count
    if count == 1 and tied:
        return None  # e.g. "jane@" fits first only, but "jd@" fits flast/firstl...: too vague
    confidence = min(85, 40 + 15 * count) - (15 if tied else 0)
    return best, count, max(confidence, 20)


def inferred_confidence(pattern_confidence: int, mx_ok: bool | None) -> int:
    """Confidence of an address built from a pattern; capped well below published ones."""
    value = pattern_confidence * (1.0 if mx_ok else 0.5 if mx_ok is None else 0.2)
    return int(min(70, value))


def mx_lookup(fetcher, domain: str) -> bool | None:  # type: ignore[no-untyped-def]
    """True if the domain publishes MX records (DNS-over-HTTPS), False if none, None if
    unknown (lookup failed)."""
    data = fetcher.api("GET", "https://dns.google/resolve", params={"name": domain, "type": "MX"})
    if not isinstance(data, dict) or data.get("Status") not in (0, 3):
        return None
    return any(a.get("type") == 15 for a in data.get("Answer") or [])
