"""Parse resume text into a structured profile for scoring."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.ats.skill_taxonomy import ALIAS_TO_CANONICAL

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)
YEARS_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b",
    re.I,
)
DATE_RANGE_RE = re.compile(
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}"
    r"\s*[-–—to]+\s*"
    r"(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|present|current|now)",
    re.I,
)

SECTION_ALIASES = {
    "experience": ("experience", "work experience", "employment", "professional experience"),
    "education": ("education", "academic", "academics"),
    "skills": ("skills", "technical skills", "technologies", "tech stack"),
    "projects": ("projects", "personal projects", "selected projects"),
    "summary": ("summary", "profile", "about", "objective"),
}

ACTION_VERBS = (
    "built",
    "developed",
    "designed",
    "implemented",
    "led",
    "owned",
    "created",
    "optimized",
    "improved",
    "reduced",
    "increased",
    "launched",
    "shipped",
    "architected",
    "migrated",
    "automated",
    "debugged",
    "scaled",
    "delivered",
)

METRICS_RE = re.compile(
    r"\b\d+(?:\.\d+)?\s*%|\b\d+[kKmMbB]\+?|\b\d{2,}\+?\b|\bp\d{2}\b",
)


@dataclass
class SkillMention:
    canonical: str
    original: str
    section: str
    context: str
    count: int = 1


@dataclass
class ResumeProfile:
    raw: str
    lower: str
    email: bool = False
    phone: bool = False
    linkedin: bool = False
    github: bool = False
    sections: list[str] = field(default_factory=list)
    skill_mentions: dict[str, SkillMention] = field(default_factory=dict)
    bullets: list[str] = field(default_factory=list)
    titles: list[str] = field(default_factory=list)
    years_mentioned: list[float] = field(default_factory=list)
    date_ranges: int = 0
    stuffing_score: float = 0.0  # 0 healthy → 1 severe


def _detect_sections(lower: str) -> list[str]:
    found: list[str] = []
    for name, aliases in SECTION_ALIASES.items():
        if any(re.search(rf"(?:^|\n)\s*{re.escape(a)}\b", lower) or f" {a} " in f" {lower} " for a in aliases):
            found.append(name)
    return found


def _section_for_offset(text: str, offset: int) -> str:
    head = text[:offset].lower()
    last = "body"
    last_pos = -1
    for name, aliases in SECTION_ALIASES.items():
        for alias in aliases:
            pos = head.rfind(alias)
            if pos > last_pos:
                last_pos = pos
                last = name
    return last


def _extract_bullets(text: str) -> list[str]:
    lines = []
    for line in text.splitlines():
        cleaned = re.sub(r"^[\s•\-*●◦▪]+", "", line).strip()
        if len(cleaned) >= 28:
            lines.append(cleaned)
    return lines[:80]


def _extract_titles(text: str) -> list[str]:
    titles: list[str] = []
    patterns = (
        r"(?:software|frontend|backend|full[\s-]?stack|cloud|data|devops|sre|product|mobile)\s+"
        r"(?:engineer|developer|designer|architect|scientist|manager)",
        r"\bsde(?:-\d)?\b",
        r"\bswe\b",
    )
    lower = text.lower()
    for pat in patterns:
        for m in re.finditer(pat, lower, re.I):
            titles.append(m.group(0).strip())
    # unique preserve order
    seen: set[str] = set()
    out: list[str] = []
    for t in titles:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out[:12]


def _find_skills(text: str) -> dict[str, SkillMention]:
    lower = text.lower()
    mentions: dict[str, SkillMention] = {}

    # Longest alias first to prefer "react.js" over "react"
    aliases = sorted(ALIAS_TO_CANONICAL.keys(), key=len, reverse=True)
    occupied: list[tuple[int, int]] = []

    for alias in aliases:
        if len(alias) < 2:
            continue
        # word-ish boundary
        pattern = re.compile(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", re.I)
        for m in pattern.finditer(lower):
            start, end = m.start(), m.end()
            if any(start < o_end and end > o_start for o_start, o_end in occupied):
                continue
            canonical = ALIAS_TO_CANONICAL[alias]
            occupied.append((start, end))
            ctx_start = max(0, start - 60)
            ctx_end = min(len(text), end + 80)
            context = text[ctx_start:ctx_end].replace("\n", " ").strip()
            section = _section_for_offset(text, start)
            if canonical in mentions:
                mentions[canonical].count += 1
                if section == "experience" and mentions[canonical].section != "experience":
                    mentions[canonical].section = "experience"
                    mentions[canonical].context = context
            else:
                mentions[canonical] = SkillMention(
                    canonical=canonical,
                    original=text[start:end],
                    section=section,
                    context=context,
                    count=1,
                )
    return mentions


def _stuffing(mentions: dict[str, SkillMention], text_len: int) -> float:
    if not mentions:
        return 0.0
    severe = 0
    for m in mentions.values():
        if m.count >= 6 and m.section == "skills":
            severe += 1
        elif m.count >= 8:
            severe += 1
    density = sum(m.count for m in mentions.values()) / max(1, text_len / 400)
    score = min(1.0, severe * 0.25 + max(0, density - 8) * 0.05)
    return score


def parse_resume(text: str) -> ResumeProfile:
    raw = text or ""
    lower = raw.lower()
    mentions = _find_skills(raw)
    profile = ResumeProfile(
        raw=raw,
        lower=lower,
        email=bool(EMAIL_RE.search(raw)),
        phone=bool(PHONE_RE.search(raw)),
        linkedin="linkedin" in lower,
        github="github" in lower,
        sections=_detect_sections(lower),
        skill_mentions=mentions,
        bullets=_extract_bullets(raw),
        titles=_extract_titles(raw),
        years_mentioned=[float(m.group(1)) for m in YEARS_RE.finditer(raw)],
        date_ranges=len(DATE_RANGE_RE.findall(raw)),
        stuffing_score=_stuffing(mentions, len(raw)),
    )
    return profile


def bullet_has_action(bullet: str) -> bool:
    b = bullet.lower()
    return any(b.startswith(v) or f" {v} " in f" {b}" for v in ACTION_VERBS)


def bullet_has_metric(bullet: str) -> bool:
    return bool(METRICS_RE.search(bullet))
