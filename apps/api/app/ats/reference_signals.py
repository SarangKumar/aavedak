"""Signals for reference ATS profiles (deterministic heuristics)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ats.skill_taxonomy import SKILL_ALIASES

SOFT_TERMS = (
    "communication",
    "collaboration",
    "leadership",
    "mentoring",
    "ownership",
    "teamwork",
    "stakeholder",
    "problem solving",
    "agile",
    "scrum",
)

STOP = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "your",
        "have",
        "will",
        "are",
        "was",
        "were",
        "our",
        "you",
        "all",
        "any",
        "can",
        "may",
        "not",
        "but",
        "into",
        "about",
        "over",
        "such",
        "than",
        "then",
        "them",
        "they",
        "their",
        "been",
        "being",
        "also",
        "using",
        "use",
        "used",
        "work",
        "team",
        "role",
        "job",
        "years",
        "year",
        "experience",
        "required",
        "requirements",
        "preferred",
        "including",
        "ability",
        "strong",
    }
)

HARD_SKILL_ALIASES: dict[str, list[str]] = {
    canonical: list(aliases) for canonical, (_display, aliases) in SKILL_ALIASES.items()
}


def _escape_re(s: str) -> str:
    return re.escape(s)


def count_phrase(haystack: str, phrase: str) -> int:
    p = (phrase or "").strip().lower()
    if not p:
        return 0
    pat = rf"(?<![a-z0-9]){_escape_re(p)}(?![a-z0-9])"
    return len(re.findall(pat, haystack, flags=re.I))


def _find_hard(text: str) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    for canonical, aliases in HARD_SKILL_ALIASES.items():
        if any(count_phrase(lower, a) > 0 for a in aliases):
            found.append(canonical)
    return found


def _soft_hits(text: str) -> list[str]:
    lower = text.lower()
    return [t for t in SOFT_TERMS if count_phrase(lower, t) > 0]


def _tokens(text: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for t in re.findall(r"[a-z][a-z0-9+.#-]{2,}", text.lower()):
        if t in STOP or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def detect_degree_level(text: str) -> int:
    t = text.lower()
    if re.search(r"\b(ph\.?d|doctorate|doctoral)\b", t):
        return 3
    if re.search(r"\b(master'?s?|m\.?s\.?|m\.?eng|mba)\b", t):
        return 2
    if re.search(r"\b(bachelor'?s?|b\.?s\.?|b\.?a\.?|b\.?eng|undergraduate)\b", t):
        return 1
    if re.search(r"\bdegree\b", t):
        return 1
    return 0


@dataclass
class ReferenceSignals:
    text_len: int
    has_email: bool
    has_phone: bool
    sections: list[str]
    hard_skills_resume: list[str]
    hard_skills_jd: list[str]
    soft_skills_resume: list[str]
    soft_skills_jd: list[str]
    action_bullets: int
    metric_bullets: int
    title_hit: float
    title_exact: bool
    degree_resume: int
    degree_jd: int
    jd_tokens: list[str]
    resume_tokens: list[str]
    stuffing: int
    resume_lower: str
    jd_lower: str


def extract_reference_signals(resume_text: str, jd_text: str = "", role: str = "") -> ReferenceSignals:
    text = resume_text or ""
    lower = text.lower()
    jd_lower = f"{role}\n{jd_text}".lower()
    lines = [l.strip() for l in text.split("\n") if len(l.strip()) >= 24]
    action_re = re.compile(
        r"^(built|developed|designed|implemented|led|owned|created|optimized|improved|"
        r"reduced|increased|launched|shipped|architected|migrated|automated|delivered)\b",
        re.I,
    )
    action_bullets = sum(1 for l in lines if action_re.match(l))
    metric_bullets = sum(
        1 for l in lines if re.search(r"\d+(?:\.\d+)?%|\d+[kKmMbB]\+?|\bp\d{2}\b", l)
    )
    sections = [
        s
        for s in ("experience", "education", "skills", "projects", "summary")
        if re.search(rf"(?:^|\n)\s*{s}\b", text, re.I)
    ]
    hard_resume = _find_hard(text)
    hard_jd = _find_hard(f"{role}\n{jd_text}")
    soft_resume = _soft_hits(text)
    soft_jd = _soft_hits(f"{role}\n{jd_text}")
    role_norm = role.strip().lower()
    role_norm = re.sub(r"\s+", " ", role_norm)
    title_exact = len(role_norm) >= 3 and role_norm in lower
    title_tok = [t for t in re.split(r"[^a-z]+", role_norm) if len(t) > 2]
    title_hit = (
        sum(1 for t in title_tok if count_phrase(lower, t) > 0) / len(title_tok) if title_tok else 0.0
    )
    stuffing = 0
    for sid in hard_resume:
        if count_phrase(lower, sid) >= 6:
            stuffing += 1
    degree_resume = detect_degree_level(text)
    degree_jd = detect_degree_level(f"{role}\n{jd_text}")
    return ReferenceSignals(
        text_len=len(text.strip()),
        has_email=bool(re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.I)),
        has_phone=bool(re.search(r"\+?\d[\d\s().-]{7,}\d", text)),
        sections=sections,
        hard_skills_resume=hard_resume,
        hard_skills_jd=hard_jd,
        soft_skills_resume=soft_resume,
        soft_skills_jd=soft_jd,
        action_bullets=action_bullets,
        metric_bullets=metric_bullets,
        title_hit=title_hit,
        title_exact=title_exact,
        degree_resume=degree_resume,
        degree_jd=degree_jd,
        jd_tokens=_tokens(jd_text),
        resume_tokens=_tokens(text),
        stuffing=stuffing,
        resume_lower=lower,
        jd_lower=jd_lower,
    )


def clamp(n: float) -> int:
    return max(0, min(100, int(round(n))))


def coverage(a: list[str], b: list[str]) -> float:
    if not b:
        return 0.0
    aset = set(a)
    return sum(1 for x in b if x in aset) / len(b)


def token_coverage(resume: list[str], jd: list[str]) -> float:
    if not jd:
        return 0.0
    rset = set(resume)
    return sum(1 for t in jd if t in rset) / len(jd)


def frequency_category_points(
    terms: list[str],
    resume_lower: str,
    jd_lower: str,
    max_points: float,
    aliases: dict[str, list[str]] | None = None,
) -> tuple[float, list[str], list[str]]:
    unique = list(dict.fromkeys(t.lower() for t in terms))
    if not unique:
        return float(max_points), [], []
    share = max_points / len(unique)
    points = 0.0
    matched: list[str] = []
    missing: list[str] = []
    for term in unique:
        phrases = (aliases or {}).get(term, [term])
        jd_count = max(1, sum(count_phrase(jd_lower, p) for p in phrases))
        resume_count = sum(count_phrase(resume_lower, p) for p in phrases)
        if resume_count <= 0:
            missing.append(term)
            continue
        matched.append(term)
        points += min(1.0, resume_count / jd_count) * share
    return points, matched, missing


def skillsyncer_degree_points(resume: int, jd: int) -> int:
    if jd == 0:
        return 10
    if resume == 0:
        return 0
    if resume >= jd:
        return 10
    return 5
