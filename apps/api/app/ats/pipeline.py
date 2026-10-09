"""Shared ATS pipeline stages: stage reporting, input validation, and immutable parsed inputs.

Engines receive the same parsed resume / JD objects but apply their own weighting. Parsed
objects are frozen dataclasses holding tuples, so one engine cannot mutate what another sees.
Parsing is cached per exact text (bounded LRU) so several engines scoring the same resume in a
warm process don't repeat the work.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from typing import Callable

from app.ats.reference_signals import SOFT_TERMS, _find_hard, count_phrase
from app.ats.resume_profile import EMAIL_RE, PHONE_RE, _extract_bullets

# Stage identifiers — mirrored in apps/web/lib/ats-engines/stages.ts.
QUEUED = "queued"
VALIDATING_INPUT = "validating_input"
PARSING_RESUME = "parsing_resume"
PARSING_JOB_DESCRIPTION = "parsing_job_description"
EXTRACTING_SKILLS = "extracting_skills"
ANALYZING_CONTENT = "analyzing_content"
MATCHING_KEYWORDS = "matching_keywords"
CALCULATING_SCORE = "calculating_score"
GENERATING_REPORT = "generating_report"
COMPLETED = "completed"
COMPLETED_WITH_WARNINGS = "completed_with_warnings"
FAILED = "failed"
CANCELLED = "cancelled"

# Failure kinds — never collapse these into a generic "N/A".
UNSUPPORTED_MODE = "unsupported_mode"
MISSING_INPUT = "missing_input"
PARSING_FAILURE = "parsing_failure"
ANALYSIS_FAILURE = "analysis_failure"

Emit = Callable[[str, str | None], None]


def no_emit(_stage: str, _message: str | None = None) -> None:
    """Default emitter for the synchronous (non-streaming) endpoint."""


class EngineFailure(Exception):
    """An engine could not legitimately evaluate the inputs. `kind` is a failure kind above."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


@dataclass(frozen=True)
class EngineContract:
    """Input contract for an engine (mirrors the web registry capability)."""

    modes: tuple[str, ...]
    jd: str  # required | optional | unsupported
    title: str  # required | optional | unsupported
    min_jd_chars: int = 0


def resolve_mode(contract: EngineContract, *, engine_name: str, role: str, jd_text: str, mode: str | None) -> str:
    has_jd = bool(jd_text.strip())
    has_role = bool(role.strip())
    if contract.jd == "required" and not has_jd:
        raise EngineFailure(MISSING_INPUT, f"{engine_name} requires a job description.")
    if contract.title == "required" and not has_role:
        raise EngineFailure(MISSING_INPUT, f"{engine_name} requires a job title.")
    if mode is None:
        mode = "job_match" if has_jd else "role_match" if has_role else "resume_only"
    if mode not in contract.modes:
        raise EngineFailure(UNSUPPORTED_MODE, f"{engine_name} does not support {mode.replace('_', ' ')} mode.")
    if mode == "job_match" and not has_jd:
        raise EngineFailure(MISSING_INPUT, f"{engine_name} job match needs a job description.")
    if mode == "job_match" and len(jd_text.strip()) < contract.min_jd_chars:
        raise EngineFailure(
            MISSING_INPUT,
            f"{engine_name} needs at least {contract.min_jd_chars} characters of job description.",
        )
    if mode == "role_match" and not has_role:
        raise EngineFailure(MISSING_INPUT, f"{engine_name} role match needs a job title.")
    return mode


# ── Parsed resume ───────────────────────────────────────────────────────────

_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DATE_TOKEN = rf"(?:{_MONTH}\s+(?:19|20)\d{{2}}|(?:19|20)\d{{2}}-\d{{1,2}}|(?:19|20)\d{{2}})"
DATE_RANGE_RE = re.compile(
    rf"({_DATE_TOKEN})\s*(?:-|–|—|to)\s*({_DATE_TOKEN}|present|current|now)",
    re.I,
)
LINKEDIN_RE = re.compile(r"linkedin\.com/in/[\w\-_/]+", re.I)
GITHUB_RE = re.compile(r"github\.com/[\w\-_/]+", re.I)
SKILLS_HEADER_RE = re.compile(
    r"^\s*(?:technical\s+)?(?:skills?|expertise|technologies|tools|proficiencies|competencies)\s*:?\s*$",
    re.I | re.M,
)


@dataclass(frozen=True)
class DateRange:
    start_raw: str
    end_raw: str
    start_year: int
    end_year: int


@dataclass(frozen=True)
class ParsedResume:
    raw: str
    lower: str
    lines: tuple[str, ...]
    word_count: int
    bullets: tuple[str, ...]
    email: str | None
    phone: str | None
    linkedin: bool
    github: bool
    name: str | None
    hard_skills: tuple[str, ...]
    skills_section_skills: tuple[str, ...]
    soft_skills: tuple[str, ...]
    date_ranges: tuple[DateRange, ...]


def _extract_name(lines: tuple[str, ...]) -> str | None:
    """First short line of 2–4 capitalized words without digits/@ (common resume header shape)."""
    for line in lines[:8]:
        if re.search(r"[@\d]", line) or not (3 <= len(line) <= 45):
            continue
        parts = line.split()
        if 2 <= len(parts) <= 4 and all(re.match(r"^[A-Z][a-zA-Z.'-]*$", p) for p in parts):
            return line
    return None


def _date_ranges(text: str) -> tuple[DateRange, ...]:
    out: list[DateRange] = []
    this_year = date.today().year
    for m in DATE_RANGE_RE.finditer(text):
        start_raw, end_raw = m.group(1).strip(), m.group(2).strip()
        sy = re.search(r"(19|20)\d{2}", start_raw)
        if not sy:
            continue
        ey = re.search(r"(19|20)\d{2}", end_raw)
        end_year = this_year if not ey else int(ey.group(0))
        start_year = int(sy.group(0))
        if end_year >= start_year:
            out.append(DateRange(start_raw, end_raw, start_year, end_year))
    return tuple(out)


@lru_cache(maxsize=64)
def parse_resume_shared(text: str) -> ParsedResume:
    raw = text or ""
    lines = tuple(l.strip() for l in raw.splitlines() if l.strip())
    header = SKILLS_HEADER_RE.search(raw)
    skills_block = raw[header.end() : header.end() + 600] if header else ""
    email = EMAIL_RE.search(raw)
    phone = PHONE_RE.search(raw)
    return ParsedResume(
        raw=raw,
        lower=raw.lower(),
        lines=lines,
        word_count=len(raw.split()),
        bullets=tuple(_extract_bullets(raw)),
        email=email.group(0) if email else None,
        phone=phone.group(0).strip() if phone else None,
        linkedin=bool(LINKEDIN_RE.search(raw)) or "linkedin" in raw.lower(),
        github=bool(GITHUB_RE.search(raw)) or "github" in raw.lower(),
        name=_extract_name(lines),
        hard_skills=tuple(_find_hard(raw)),
        skills_section_skills=tuple(_find_hard(skills_block)) if skills_block else (),
        soft_skills=tuple(t for t in SOFT_TERMS if count_phrase(raw.lower(), t) > 0),
        date_ranges=_date_ranges(raw),
    )


# ── Parsed job description ──────────────────────────────────────────────────


@dataclass(frozen=True)
class ParsedJd:
    raw: str
    lower: str
    role: str
    hard_skills: tuple[str, ...]
    soft_skills: tuple[str, ...]


@lru_cache(maxsize=64)
def parse_jd_shared(jd_text: str, role: str = "") -> ParsedJd:
    raw = jd_text or ""
    return ParsedJd(
        raw=raw,
        lower=raw.lower(),
        role=(role or "").strip(),
        hard_skills=tuple(_find_hard(raw)),
        soft_skills=tuple(t for t in SOFT_TERMS if count_phrase(raw.lower(), t) > 0),
    )


def require_parsable(resume: ParsedResume) -> None:
    if len(resume.raw.strip()) < 40 or resume.word_count < 5:
        raise EngineFailure(
            PARSING_FAILURE,
            "Too little readable text was extracted from this resume to analyze it.",
        )


def role_expected_skills(role: str, *, engine_name: str) -> tuple[str, ...]:
    """Core + common taxonomy skills for a recognized title (Aavedak role profiles).

    Used as the comparison target when an engine runs in role_match without a JD.
    Raises MISSING_INPUT when the title maps to no skill profile, rather than scoring against nothing.
    """
    from app.ats.skill_taxonomy import role_skill_buckets

    buckets = role_skill_buckets(role)
    skills = tuple(dict.fromkeys([*buckets.get("core", []), *buckets.get("common", [])]))
    if not skills:
        raise EngineFailure(
            MISSING_INPUT,
            f"{engine_name} has no skill profile for “{role.strip()}”. Paste a job description instead.",
        )
    return skills
