"""Parse job description / role title into structured requirements."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.ats.skill_taxonomy import (
    ALIAS_TO_CANONICAL,
    display_name,
    role_skill_buckets,
)

SOFT_SKILLS = (
    "communication",
    "collaboration",
    "teamwork",
    "leadership",
    "problem solving",
    "problem-solving",
    "ownership",
    "mentoring",
    "stakeholder",
    "agile",
    "scrum",
)

RESPONSIBILITY_CUES = (
    "build",
    "design",
    "develop",
    "implement",
    "maintain",
    "own",
    "lead",
    "write",
    "debug",
    "optimize",
    "collaborate",
    "ship",
    "deploy",
    "monitor",
    "test",
    "automate",
)

YEARS_REQ_RE = re.compile(
    r"(\d+)\s*(?:\+|plus)?\s*(?:[-–]\s*(\d+)\s*)?(?:years?|yrs?)",
    re.I,
)


@dataclass
class Requirement:
    text: str
    kind: str  # required | preferred | responsibility | soft | other
    canonical: str | None = None


@dataclass
class JdProfile:
    title: str
    inferred_title: str
    raw: str
    required: list[Requirement] = field(default_factory=list)
    preferred: list[Requirement] = field(default_factory=list)
    responsibilities: list[Requirement] = field(default_factory=list)
    soft_skills: list[Requirement] = field(default_factory=list)
    other_keywords: list[Requirement] = field(default_factory=list)
    years_min: float | None = None
    years_max: float | None = None
    education_required: bool = False
    too_short: bool = False


def _slice_section(text: str, markers: tuple[str, ...]) -> str:
    lower = text.lower()
    best = -1
    for marker in markers:
        idx = lower.find(marker)
        if idx >= 0 and (best < 0 or idx < best):
            best = idx
    if best < 0:
        return ""
    return text[best : best + 2800]


def _skills_in_text(text: str) -> list[tuple[str, str]]:
    """Return (canonical, original_alias) found in text."""
    lower = text.lower()
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    for alias in sorted(ALIAS_TO_CANONICAL.keys(), key=len, reverse=True):
        if len(alias) < 2:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", lower):
            can = ALIAS_TO_CANONICAL[alias]
            if can not in seen:
                seen.add(can)
                found.append((can, alias))
    return found


def _infer_title_from_jd(jd: str) -> str:
    lines = [ln.strip() for ln in (jd or "").splitlines() if ln.strip()]
    for line in lines[:8]:
        if 3 <= len(line) <= 80 and not line.lower().startswith(
            ("about", "we are", "company", "job description", "responsibilities", "requirements")
        ):
            # Prefer lines that look like titles
            if re.search(
                r"engineer|developer|designer|manager|scientist|architect|sde|analyst",
                line,
                re.I,
            ):
                return line
    if lines:
        return lines[0][:80]
    return ""


def parse_jd(jd_text: str, role_title: str = "") -> JdProfile:
    raw = (jd_text or "").strip()
    title = (role_title or "").strip()
    inferred = title or _infer_title_from_jd(raw)
    profile = JdProfile(
        title=title,
        inferred_title=inferred,
        raw=raw,
        too_short=bool(raw) and len(raw.split()) < 40,
    )

    if not raw:
        # Role-only: synthesize from role profile taxonomy
        buckets = role_skill_buckets(inferred or title)
        for can in buckets.get("core", []):
            profile.required.append(
                Requirement(text=display_name(can), kind="required", canonical=can)
            )
        for can in buckets.get("common", []):
            profile.preferred.append(
                Requirement(text=display_name(can), kind="preferred", canonical=can)
            )
        for can in buckets.get("optional", []) + buckets.get("specialized", []):
            profile.other_keywords.append(
                Requirement(text=display_name(can), kind="other", canonical=can)
            )
        return profile

    req_block = _slice_section(
        raw,
        (
            "requirements",
            "qualifications",
            "what you'll need",
            "must have",
            "minimum qualifications",
            "you will need",
        ),
    ) or raw
    pref_block = _slice_section(
        raw,
        ("nice to have", "preferred", "bonus", "good to have", "plus"),
    )
    resp_block = _slice_section(
        raw,
        (
            "responsibilities",
            "what you'll do",
            "what you will do",
            "you will",
            "day to day",
            "about the role",
        ),
    )

    for can, alias in _skills_in_text(req_block):
        profile.required.append(
            Requirement(text=display_name(can), kind="required", canonical=can)
        )
    for can, alias in _skills_in_text(pref_block):
        if can not in {r.canonical for r in profile.required}:
            profile.preferred.append(
                Requirement(text=display_name(can), kind="preferred", canonical=can)
            )

    # Responsibilities: lines with action cues
    resp_src = resp_block or raw
    for line in resp_src.splitlines():
        cleaned = re.sub(r"^[\s•\-*●]+", "", line).strip()
        if len(cleaned) < 18:
            continue
        low = cleaned.lower()
        if any(cue in low for cue in RESPONSIBILITY_CUES):
            profile.responsibilities.append(
                Requirement(text=cleaned[:140], kind="responsibility")
            )
        if len(profile.responsibilities) >= 10:
            break

    lower = raw.lower()
    for soft in SOFT_SKILLS:
        if soft in lower:
            profile.soft_skills.append(Requirement(text=soft.title(), kind="soft"))

    # Other tech mentions not already required/preferred
    known = {r.canonical for r in profile.required + profile.preferred if r.canonical}
    for can, _alias in _skills_in_text(raw):
        if can not in known:
            profile.other_keywords.append(
                Requirement(text=display_name(can), kind="other", canonical=can)
            )

    m = YEARS_REQ_RE.search(raw)
    if m:
        profile.years_min = float(m.group(1))
        if m.group(2):
            profile.years_max = float(m.group(2))

    profile.education_required = bool(
        re.search(r"\b(bachelor|master|b\.?s\.?|m\.?s\.?|degree|phd)\b", lower)
    )

    # If JD had no explicit skill requirements, fall back lightly to role buckets
    if not profile.required and (inferred or title):
        buckets = role_skill_buckets(inferred or title)
        for can in buckets.get("core", []):
            profile.required.append(
                Requirement(text=display_name(can), kind="required", canonical=can)
            )

    return profile
