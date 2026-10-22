"""Staged job → candidate matching: the one engine behind job recommendations.

Four stages, all pure (no database, no network), so every rule can be tuned and tested on
plain data. `ranking.py` is the only caller; it does the SQL around them.

  A. `eligibility()`   hard constraints. A job is rejected only for something that makes it
                       unsuitable whatever else matches: not active, expired, closed, above
                       the user's experience window, or explicitly excluded by the user. An
                       incomplete description or an unmentioned skill is never a rejection.
  B. `evaluate()`      deterministic 0–100 relevance from eight weighted signals
                       (`MatchWeights`). Every signal reports whether it had evidence at all;
                       the score mixes the weighted evidence with a neutral prior for the
                       weights that had none, so missing information neither inflates nor
                       sinks a job (see "Scoring" below).
  C. (optional)        `apply_second_stage()` is the hook for an LLM re-score of the few
                       best candidates. Nothing ships with one — this repository has no AI
                       provider — see DISCOVERY.md "Optional AI evaluation".
  D. `MatchResult`     the explanation: per-signal points that sum to the score, the skills
                       that matched, the required skills with no evidence, and the
                       uncertainty caused by missing data.
  E. `rank_jobs()`     ordering: match score plus a bounded region and recency bonus, a
                       stable tie-break, near-duplicate removal and a per-company cap.

Scoring
-------
With `w_i` the weight of each signal that had evidence and `f_i` its 0–1 fit:

    score = 100 · ( Σ w_i·f_i  +  (1 − Σ w_i)·unknown_fit )

All weights sum to 1, so `Σ w_i` is the share of the score backed by evidence (reported as
`confidence`) and the rest is credited at `unknown_fit` (0.45, a deliberate "unknown", not a
pass or a fail). Each signal's `points` is `100·w_i·f_i` and the leftover is reported as its
own `unrated` component, so the breakdown always adds up to the overall score.

What the signals are *not*: a keyword found in a description is evidence that the job asks
for it, and a skill found in a resume is evidence the candidate claims it — neither proves
proficiency. Every skill counts once, however often it is repeated, and a skill that is
simply not mentioned is reported as "no evidence", never as a negative.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Sequence

from app.ats.jd_profile import parse_jd
from app.ats.resume_profile import parse_resume
from app.ats.seniority import level_band
from app.ats.skill_taxonomy import display_name, infer_role_key, normalize_skill
from app.ats.text_similarity import tfidf_cosine
from app.discovery.jobs import filters

# Bump when a formula or weight changes: it is part of `inputs_key`, so every stored score is
# recomputed on the next run instead of silently mixing engine versions.
MATCH_ENGINE_VERSION = "match@1.0"

# A description shorter than this cannot be read as requirements, so the skill signals report
# no evidence instead of inventing some from the title.
MIN_JD_WORDS = 40
# Below this a resume is treated as absent for the similarity signal.
MIN_RESUME_CHARS = 200


# --- configuration -------------------------------------------------------------------


@dataclass(frozen=True)
class MatchWeights:
    """Stage B weights. They sum to 1.0; `_check()` enforces it so a local edit can't drift."""

    role_title: float = 0.22
    required_skills: float = 0.24
    preferred_skills: float = 0.08
    experience: float = 0.14
    seniority: float = 0.06
    location: float = 0.12
    employment_type: float = 0.04
    resume_similarity: float = 0.10
    # Credited for the weight of every signal that had no evidence either way.
    unknown_fit: float = 0.45

    def weight(self, key: str) -> float:
        return float(getattr(self, key))

    def _check(self) -> None:
        total = sum(self.weight(k) for k in SIGNAL_KEYS)
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"match weights must sum to 1.0, got {total}")


SIGNAL_KEYS: tuple[str, ...] = (
    "role_title",
    "required_skills",
    "preferred_skills",
    "experience",
    "seniority",
    "location",
    "employment_type",
    "resume_similarity",
)

SIGNAL_LABELS: dict[str, str] = {
    "role_title": "Role and title",
    "required_skills": "Required skills",
    "preferred_skills": "Preferred skills",
    "experience": "Experience level",
    "seniority": "Seniority",
    "location": "Location and work mode",
    "employment_type": "Employment type",
    "resume_similarity": "Resume and description overlap",
    "unrated": "Not rated (information missing)",
}

DEFAULT_WEIGHTS = MatchWeights()
DEFAULT_WEIGHTS._check()


@dataclass(frozen=True)
class RankWeights:
    """Stage E: bounded nudges on top of the match score, so neither region nor recency can
    overtake relevance (both together are worth less than 20 of the 100 match points)."""

    # filters.REGION_PRIORITY order: India first, then remote open to India.
    region_bonus: dict[str, int] = field(
        default_factory=lambda: {"india": 12, "india_remote": 9, "remote": 4, "global": 0}
    )
    # (max age in days, bonus) — the first match wins; a fresh posting is worth a few points.
    recency_bonus: tuple[tuple[int, int], ...] = ((3, 6), (7, 4), (14, 2))
    # Most jobs from one company in the front of a batch; the rest keep their order behind it.
    max_per_company: int = 3


DEFAULT_RANK_WEIGHTS = RankWeights()


# --- candidate -----------------------------------------------------------------------


def skill_key(text: str) -> str:
    """Canonical taxonomy name when known, else a normalized literal so skills outside the
    taxonomy ("sap abap") still match the description text."""
    canonical = normalize_skill(text)
    if canonical:
        return canonical
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def skill_label(key: str) -> str:
    name = display_name(key)
    return name if name != key else key


@dataclass
class Candidate:
    """Everything the engine knows about the person, derived once per run."""

    years: float = 0.0
    skills: tuple[str, ...] = ()
    preferred_roles: tuple[str, ...] = ()
    preferred_locations: tuple[str, ...] = ()
    remote_preference: str | None = None
    industry_preference: str | None = None
    experience_level: str | None = None
    # No UI collects these yet; the engine honours them as soon as it is given some.
    employment_types: tuple[str, ...] = ()
    excluded_companies: tuple[str, ...] = ()
    excluded_keywords: tuple[str, ...] = ()
    resume_text: str = ""
    experience_window: float = 2.0

    # derived
    skill_keys: frozenset[str] = field(default_factory=frozenset, init=False)
    resume_skill_keys: frozenset[str] = field(default_factory=frozenset, init=False)
    role_keys: frozenset[str] = field(default_factory=frozenset, init=False)

    def __post_init__(self) -> None:
        self.skills = tuple(s for s in self.skills if (s or "").strip())
        self.preferred_roles = tuple(r for r in self.preferred_roles if (r or "").strip())
        self.skill_keys = frozenset(skill_key(s) for s in self.skills if skill_key(s))
        text = self.resume_text or ""
        self.resume_skill_keys = (
            frozenset(parse_resume(text).skill_mentions) if text.strip() else frozenset()
        )
        self.role_keys = frozenset(
            k for k in (infer_role_key(r) for r in self.preferred_roles) if k
        )

    @property
    def known_skill_keys(self) -> frozenset[str]:
        """Skills with evidence from either side of the profile."""
        return self.skill_keys | self.resume_skill_keys

    @property
    def has_signals(self) -> bool:
        """Whether the profile says enough for a match score to mean anything."""
        return bool(self.skill_keys or self.preferred_roles or self.resume_skill_keys)

    @property
    def max_min_years(self) -> float:
        """Highest minimum-required years this candidate is offered."""
        return self.years + self.experience_window

    def fingerprint(self) -> str:
        """Identity of the inputs this candidate contributes to a score. Part of
        `inputs_key`, so a profile or resume edit invalidates exactly this user's scores."""
        payload = json.dumps(
            [
                round(self.years, 3),
                sorted(self.skill_keys),
                sorted(r.lower() for r in self.preferred_roles),
                sorted(loc.lower() for loc in self.preferred_locations),
                self.remote_preference or "",
                self.experience_level or "",
                self.industry_preference or "",
                sorted(self.employment_types),
                sorted(c.lower() for c in self.excluded_companies),
                sorted(k.lower() for k in self.excluded_keywords),
                round(self.experience_window, 3),
                hashlib.sha1((self.resume_text or "").encode("utf-8")).hexdigest(),
            ],
            separators=(",", ":"),
        )
        return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


# --- job -----------------------------------------------------------------------------


def _json_list(raw: Any) -> tuple[str, ...]:
    if isinstance(raw, list):
        values = raw
    else:
        try:
            values = json.loads(raw or "[]")
        except (TypeError, ValueError):
            return ()
    if not isinstance(values, list):
        return ()
    return tuple(str(v).strip() for v in values if isinstance(v, str) and v.strip())


@dataclass(frozen=True)
class JobFacts:
    """A job as the engine sees it: only fields the `jobs` table actually holds."""

    id: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    description: str = ""
    region: str = "india"
    min_years: int | None = None
    max_years: int | None = None
    work_mode: str | None = None
    employment_type: str | None = None
    seniority: str | None = None
    skills: tuple[str, ...] = ()
    posted: str = ""
    status: str = "active"
    expired_at: str | None = None
    closed_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> JobFacts:
        def years(key: str) -> int | None:
            value = row.get(key)
            return None if value is None else int(value)

        return cls(
            id=str(row.get("id") or ""),
            title=row.get("title") or "",
            company=row.get("company") or "",
            location=row.get("location") or "",
            description=row.get("description") or "",
            region=row.get("region") or "india",
            min_years=years("min_years"),
            max_years=years("max_years"),
            work_mode=row.get("work_mode"),
            employment_type=row.get("employment_type"),
            seniority=row.get("seniority"),
            skills=_json_list(row.get("skills_json")),
            posted=row.get("posted") or "",
            status=row.get("status") or "active",
            expired_at=row.get("expired_at"),
            closed_at=row.get("closed_at"),
        )

    def fingerprint(self) -> str:
        """Identity of the job data that feeds a score, so an edited posting is re-scored
        and an untouched one is not."""
        payload = json.dumps(
            [
                self.title,
                self.company,
                self.location,
                self.region,
                self.min_years,
                self.max_years,
                self.work_mode or "",
                self.employment_type or "",
                self.seniority or "",
                sorted(self.skills),
                hashlib.sha1(self.description.encode("utf-8")).hexdigest(),
            ],
            separators=(",", ":"),
        )
        return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def inputs_key(job: JobFacts, candidate: Candidate, weights: MatchWeights = DEFAULT_WEIGHTS) -> str:
    """Cache key for one stored score: engine version + job data + candidate data. Equal keys
    mean the deterministic engine would produce exactly the same result, so the work (and any
    second-stage evaluation) can be skipped."""
    parts = [
        MATCH_ENGINE_VERSION,
        job.fingerprint(),
        candidate.fingerprint(),
        hashlib.sha1(
            json.dumps(
                [weights.weight(k) for k in SIGNAL_KEYS] + [weights.unknown_fit],
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()[:8],
    ]
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:24]


# --- parsed job description (cached across users) ------------------------------------


@dataclass(frozen=True)
class JdFacts:
    """Requirements read from one description. Cached by description, so a pool of jobs is
    parsed once per run however many users it is ranked for."""

    words: int = 0
    thin: bool = True
    required: tuple[tuple[str, float], ...] = ()
    preferred: tuple[tuple[str, float], ...] = ()
    seniority: str | None = None
    skill_keys: frozenset[str] = frozenset()


_JD_CACHE: dict[tuple[str, str], JdFacts] = {}
_JD_CACHE_MAX = 4096


def _dedupe_requirements(items: Sequence[Any]) -> tuple[tuple[str, float], ...]:
    """One entry per skill, keeping its strongest stated importance. Repetition in a posting
    is already capped by `jd_profile` (≤ 1.6); counting a skill twice would let a wordy
    description outweigh a precise one."""
    best: dict[str, float] = {}
    for req in items:
        canonical = getattr(req, "canonical", None)
        if not canonical:
            continue
        importance = min(1.6, max(0.1, float(getattr(req, "importance", 1.0))))
        best[canonical] = max(best.get(canonical, 0.0), importance)
    return tuple(sorted(best.items()))


def _build_jd_facts(title: str, description: str) -> JdFacts:
    words = len((description or "").split())
    if words < MIN_JD_WORDS:
        return JdFacts(words=words, thin=True)
    profile = parse_jd(description, title)
    required = _dedupe_requirements(profile.required)
    preferred = _dedupe_requirements(profile.preferred)
    return JdFacts(
        words=words,
        thin=False,
        required=required,
        preferred=preferred,
        seniority=profile.seniority,
        skill_keys=frozenset(k for k, _ in required + preferred),
    )


def jd_facts(job: JobFacts) -> JdFacts:
    key = (
        hashlib.sha1((job.description or "").encode("utf-8")).hexdigest(),
        (job.title or "").strip().lower(),
    )
    cached = _JD_CACHE.get(key)
    if cached is not None:
        return cached
    facts = _build_jd_facts(job.title, job.description)
    if len(_JD_CACHE) >= _JD_CACHE_MAX:
        _JD_CACHE.clear()
    _JD_CACHE[key] = facts
    return facts


# --- stage A: eligibility ------------------------------------------------------------


@dataclass(frozen=True)
class Eligibility:
    eligible: bool
    reason: str = "eligible"
    detail: str = ""


def eligibility(job: JobFacts, candidate: Candidate) -> Eligibility:
    """Hard constraints only. Soft preferences (location, employment type, a skill the
    posting never mentions) are scored in stage B, never rejected here."""
    if not job.title.strip():
        return Eligibility(False, "invalid", "The posting has no title.")
    if job.status != "active":
        return Eligibility(False, "inactive", "The posting is archived.")
    if job.expired_at:
        return Eligibility(False, "expired", "The posting has expired.")
    if job.closed_at:
        return Eligibility(False, "closed", "The posting was filled or removed.")
    company = job.company.strip().lower()
    for excluded in candidate.excluded_companies:
        if company and company == (excluded or "").strip().lower():
            return Eligibility(False, "excluded_company", f"You excluded {job.company}.")
    haystack = f"{job.title} {job.company}".lower()
    for word in candidate.excluded_keywords:
        word = (word or "").strip().lower()
        if word and word in haystack:
            return Eligibility(False, "excluded_keyword", f"The title matches “{word}”, which you excluded.")
    if job.min_years is not None and job.min_years > candidate.max_min_years:
        return Eligibility(
            False,
            "experience",
            f"Asks for {job.min_years}+ years; you are matched up to {candidate.max_min_years:g}.",
        )
    return Eligibility(True)


# --- stage B: signals ----------------------------------------------------------------


@dataclass
class Component:
    key: str
    label: str
    available: bool
    fit: float
    detail: str
    weight: float = 0.0
    points: float = 0.0


_TITLE_NOISE_RE = re.compile(r"[^a-z0-9+#.\s]+")
_TITLE_STOP = frozenset(
    "the a an and or of for to in at with new i ii 1 2 remote onsite hybrid india".split()
)


# Titles that name no specialism, so they suit any engineering preference.
_GENERIC_TITLE_RE = re.compile(
    r"\b(?:software (?:development )?engineer|software developer|sde|swe|full[- ]?stack|"
    r"application developer|graduate engineer trainee|member of technical staff)\b",
    re.I,
)

# Words that name the job family rather than the role, so they cannot carry a title match
# on their own.
_GENERIC_TITLE_WORDS = frozenset(
    "engineer engineers engineering developer developers analyst specialist associate consultant "
    "manager intern trainee technologist scientist designer programmer software technical".split()
)


def _title_tokens(title: str) -> set[str]:
    cleaned = _TITLE_NOISE_RE.sub(" ", (title or "").lower())
    return {t for t in cleaned.split() if len(t) > 1 and t not in _TITLE_STOP}


def _role_component(job: JobFacts, candidate: Candidate) -> Component:
    """Tiered title match: the preferred role as a phrase, then the same role family from the
    taxonomy, then word overlap, then "some tech role". Mirrors how a person reads a title."""
    label = SIGNAL_LABELS["role_title"]
    if not candidate.preferred_roles:
        return Component("role_title", label, False, 0.0, "You have not set any preferred roles.")
    title = (job.title or "").lower()
    hits = [role for role in candidate.preferred_roles if role.strip().lower() in title]
    if hits:
        return Component("role_title", label, True, 1.0, f"The title matches your preferred role {hits[0]}.")
    job_role = infer_role_key(job.title)
    if job_role and job_role in candidate.role_keys:
        matching = next(
            (r for r in candidate.preferred_roles if infer_role_key(r) == job_role), job_role
        )
        return Component(
            "role_title", label, True, 0.85, f"Same role family as your preferred role {matching}."
        )
    # A plain "Software Engineer" / "Full Stack" listing is a reasonable fit for any
    # engineering preference, which is most of discovery's junior audience.
    if _GENERIC_TITLE_RE.search(job.title or "") and candidate.role_keys:
        return Component(
            "role_title", label, True, 0.55, "A general software role, close to your preferred roles."
        )
    job_tokens = _title_tokens(job.title)
    best = 0.0
    for role in candidate.preferred_roles:
        tokens = _title_tokens(role)
        shared = tokens & job_tokens
        # "Engineer" alone is not a partial match: a QA Automation Engineer and a Backend
        # Engineer share only the job-family noun. At least one specific word must match.
        if tokens and shared - _GENERIC_TITLE_WORDS:
            best = max(best, len(shared) / len(tokens))
    if best >= 0.5:
        return Component("role_title", label, True, 0.6, "The title partly matches your preferred roles.")
    if filters.is_engineering_title(job.title):
        return Component(
            "role_title", label, True, 0.3, "A tech role, but not one of your preferred roles."
        )
    return Component("role_title", label, True, 0.1, "The title is outside your preferred roles.")


def _skills_component(
    key: str, requirements: tuple[tuple[str, float], ...], candidate: Candidate, jd: JdFacts
) -> tuple[Component, list[str], list[str]]:
    """Importance-weighted share of the posting's stated skills with evidence in the resume or
    the profile. Returns (component, matched keys, missing keys)."""
    label = SIGNAL_LABELS[key]
    known = candidate.known_skill_keys
    if not requirements:
        detail = (
            f"The description is too short ({jd.words} words) to read requirements from."
            if jd.thin
            else "The description states no skills in this group."
        )
        return Component(key, label, False, 0.0, detail), [], []
    if not known:
        return (
            Component(key, label, False, 0.0, "No resume text or profile skills to compare."),
            [],
            [k for k, _ in requirements],
        )
    matched = [k for k, _ in requirements if k in known]
    missing = [k for k, _ in requirements if k not in known]
    total = sum(i for _, i in requirements)
    hit = sum(i for k, i in requirements if k in known)
    fit = hit / total if total else 0.0
    detail = f"{len(matched)} of {len(requirements)} skills in this group found in your resume or profile."
    return Component(key, label, True, fit, detail), matched, missing


def _experience_component(job: JobFacts, candidate: Candidate) -> Component:
    """Fit against the stated years. Nothing stated is no evidence, not a penalty; being over
    the stated range costs little, since discovery's audience is junior."""
    label = SIGNAL_LABELS["experience"]
    if job.min_years is None:
        return Component(
            "experience", label, False, 0.0, "The posting does not state required experience."
        )
    low = float(job.min_years)
    high = float(job.max_years) if job.max_years is not None else low
    years = candidate.years
    if low <= years <= high:
        return Component(
            "experience", label, True, 1.0, f"Asks for {job.min_years}+ years; you have {years:g}."
        )
    if years < low:
        gap = low - years
        window = max(1.0, candidate.experience_window)
        fit = max(0.0, 1.0 - gap / (window + 1.0))
        return Component(
            "experience",
            label,
            True,
            fit,
            f"Asks for {job.min_years}+ years; you have {years:g} ({gap:g} short).",
        )
    over = years - high
    fit = max(0.4, 1.0 - over / 8.0)
    return Component(
        "experience", label, True, fit, f"Asks for {job.min_years}+ years; you have {years:g}."
    )


# Years a seniority signal implies. Provider labels (filters.normalize_seniority) first, then
# the levels jd_profile reads out of the text.
_SENIORITY_YEARS = {
    "internship": 0.0,
    "entry": 0.0,
    "associate": 1.0,
    "mid_senior": 3.0,
    "director": 8.0,
    "executive": 10.0,
    "junior": 1.0,
    "mid": 3.0,
    "senior": 6.0,
    "staff": 10.0,
}


def _seniority_component(job: JobFacts, jd: JdFacts, candidate: Candidate) -> Component:
    """The level the posting is written for, against the candidate's band. Separate from the
    stated years: a posting often says "Senior" without stating a number."""
    label = SIGNAL_LABELS["seniority"]
    signal = (job.seniority or "").strip().lower() or None
    expected = _SENIORITY_YEARS.get(signal or "")
    source = f"the posting's {signal} level" if expected is not None else ""
    if expected is None and jd.seniority:
        expected = _SENIORITY_YEARS.get(jd.seniority)
        source = f"a {jd.seniority}-level description"
    if expected is None:
        implied = filters.title_min_years(job.title)
        if implied is not None:
            expected = float(implied)
            source = "the title's seniority"
    if expected is None:
        return Component("seniority", label, False, 0.0, "The posting states no seniority level.")
    band = level_band(candidate.years)
    fit = max(0.2, 1.0 - abs(expected - candidate.years) / 5.0)
    return Component(
        "seniority", label, True, min(1.0, fit), f"You are {band.label}; {source} expects about {expected:g} years."
    )


_REMOTE_IN_TEXT_RE = re.compile(r"\b(remote|work from home|wfh|anywhere)\b", re.I)


def _location_component(job: JobFacts, candidate: Candidate) -> tuple[Component, list[str]]:
    """Preferred city first, then the work arrangement, then the region. Returns the matched
    location preferences for the explanation."""
    label = SIGNAL_LABELS["location"]
    location = job.location or ""
    lower = location.lower()
    remote = bool(_REMOTE_IN_TEXT_RE.search(location)) or (job.work_mode or "") == "remote" or (
        job.region in {"india_remote", "remote"}
    )
    hits: list[str] = []
    for pref in candidate.preferred_locations:
        city = (pref.split(",")[0] or "").strip().lower()
        if city and city in lower:
            hits.append(pref)
        elif pref.strip().lower() == "remote" and remote:
            hits.append(pref)
    if hits:
        return (
            Component("location", label, True, 1.0, f"{location or 'Remote'} matches {hits[0]}."),
            hits,
        )
    wants_remote = (candidate.remote_preference or "").lower() in {"remote", "hybrid"}
    if remote and wants_remote:
        fit, detail = 0.9, "A remote role, which is what you prefer."
    elif job.region == "india":
        fit, detail = 0.75, f"In India{f' ({location})' if location else ''}."
    elif job.region == "india_remote":
        fit, detail = 0.7, "Remote and open to India."
    elif job.region == "remote":
        fit, detail = 0.5, "Remote, but the posting does not say it is open to India."
    else:
        fit, detail = 0.2, f"Outside India{f' ({location})' if location else ''}."
    if candidate.preferred_locations:
        detail += " None of your preferred locations are named."
    return Component("location", label, True, fit, detail), hits


def _employment_component(job: JobFacts, candidate: Candidate) -> Component:
    label = SIGNAL_LABELS["employment_type"]
    stated = (job.employment_type or "").strip().lower()
    if not stated or not candidate.employment_types:
        return Component(
            "employment_type",
            label,
            False,
            0.0,
            "No employment-type preference to compare." if stated else "The posting states no employment type.",
        )
    wanted = {t.strip().lower() for t in candidate.employment_types}
    fit = 1.0 if stated in wanted else 0.2
    return Component("employment_type", label, True, fit, f"The posting is {stated}.")


def _similarity_component(job: JobFacts, jd: JdFacts, candidate: Candidate) -> Component:
    """Lexical TF-IDF cosine between the resume and the description — the repository's own
    similarity (`ats.text_similarity`, the one the ATS engines use). Lexical overlap, not
    semantic understanding, so it is weighted modestly and calibrated the same way the
    Resume Skills Extractor engine calibrates its cosine."""
    label = SIGNAL_LABELS["resume_similarity"]
    text = candidate.resume_text or ""
    if len(text.strip()) < MIN_RESUME_CHARS:
        return Component("resume_similarity", label, False, 0.0, "No resume text on file to compare.")
    if jd.thin:
        return Component(
            "resume_similarity",
            label,
            False,
            0.0,
            f"The description is too short ({jd.words} words) to compare against.",
        )
    cosine = tfidf_cosine(text, job.description, stop_words=True, sublinear_tf=True)
    fit = min(1.0, cosine * 1.8)
    return Component(
        "resume_similarity",
        label,
        True,
        fit,
        f"Your resume and this description share {round(cosine * 100)}% of their wording.",
    )


# --- stage D: result -----------------------------------------------------------------


@dataclass
class MatchResult:
    score: int
    confidence: int
    components: list[Component]
    skills_matched: list[str] = field(default_factory=list)
    skills_missing: list[str] = field(default_factory=list)
    role_hits: list[str] = field(default_factory=list)
    location_hits: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    uncertainty: list[str] = field(default_factory=list)
    experience_fit: int = 5

    def component(self, key: str) -> Component | None:
        return next((c for c in self.components if c.key == key), None)

    def breakdown(self) -> list[dict[str, Any]]:
        return [
            {
                "key": c.key,
                "label": c.label,
                "score": round(c.fit * 100) if c.available else None,
                "weight": round(c.weight, 4),
                "points": round(c.points, 1),
                "available": c.available,
                "detail": c.detail,
            }
            for c in self.components
        ]

    def explanation(self, job: JobFacts) -> dict[str, Any]:
        """What `user_job_state.reasons_json` stores. The first block is the shape the web app
        has always read (`skills`, `roles`, `locations`, `minYears`, `maxYears`, `region`,
        `experienceFit`, `match`); the rest is additive."""
        return {
            "skills": self.skills_matched[:8],
            "roles": self.role_hits[:4],
            "locations": self.location_hits[:4],
            "minYears": job.min_years,
            "maxYears": job.max_years,
            "region": job.region,
            "experienceFit": self.experience_fit,
            "match": self.score,
            # Added by the staged engine.
            "engine": MATCH_ENGINE_VERSION,
            "confidence": self.confidence,
            "skillsMatched": self.skills_matched[:12],
            "skillsMissing": self.skills_missing[:12],
            "reasons": self.reasons[:4],
            "uncertainty": self.uncertainty[:3],
            "breakdown": self.breakdown(),
        }


def evaluate(
    job: JobFacts,
    candidate: Candidate,
    weights: MatchWeights = DEFAULT_WEIGHTS,
    jd: JdFacts | None = None,
) -> MatchResult:
    """Stage B + D: score one job for one candidate and explain the score."""
    jd = jd if jd is not None else jd_facts(job)
    role = _role_component(job, candidate)
    required, matched_req, missing_req = _skills_component(
        "required_skills", jd.required, candidate, jd
    )
    preferred, matched_pref, _ = _skills_component(
        "preferred_skills", jd.preferred, candidate, jd
    )
    experience = _experience_component(job, candidate)
    seniority = _seniority_component(job, jd, candidate)
    location, location_hits = _location_component(job, candidate)
    employment = _employment_component(job, candidate)
    similarity = _similarity_component(job, jd, candidate)

    components = [role, required, preferred, experience, seniority, location, employment, similarity]
    evidence = 0.0
    for component in components:
        component.weight = weights.weight(component.key)
        if component.available:
            component.points = 100.0 * component.weight * component.fit
            evidence += component.weight
        else:
            component.points = 0.0
    unrated = max(0.0, 1.0 - evidence)
    if unrated > 1e-9:
        components.append(
            Component(
                "unrated",
                SIGNAL_LABELS["unrated"],
                False,
                weights.unknown_fit,
                "Signals without evidence are credited neutrally, neither as a pass nor a fail.",
                weight=unrated,
                points=100.0 * unrated * weights.unknown_fit,
            )
        )
    score = max(0, min(100, round(sum(c.points for c in components))))

    uncertainty: list[str] = []
    if jd.thin:
        uncertainty.append(
            f"The posting's description is short ({jd.words} words), so its requirements could not be read."
        )
    if not candidate.resume_skill_keys:
        uncertainty.append(
            "No resume text is on file, so skills were compared against your profile only."
        )
    if job.min_years is None:
        uncertainty.append("The posting does not state how much experience it requires.")

    ranked = sorted(
        (c for c in components if c.available and c.fit >= 0.6 and c.points >= 4.0),
        key=lambda c: c.points,
        reverse=True,
    )
    matched_keys = list(dict.fromkeys(matched_req + matched_pref))
    reasons = [c.detail for c in ranked[:3]]
    experience_fit = (
        round(experience.fit * 10) if experience.available else 5
    )
    return MatchResult(
        score=score,
        confidence=round(evidence * 100),
        components=components,
        skills_matched=[skill_label(k) for k in matched_keys],
        skills_missing=[skill_label(k) for k in missing_req],
        role_hits=[r for r in candidate.preferred_roles if r.strip().lower() in (job.title or "").lower()],
        location_hits=location_hits,
        reasons=reasons,
        uncertainty=uncertainty,
        experience_fit=experience_fit,
    )


# --- stage E: ranking ----------------------------------------------------------------


@dataclass
class RankedJob:
    job: JobFacts
    result: MatchResult
    rank: int
    cache_key: str = ""
    duplicate_of: str | None = None


def _days_old(posted: str, now: str) -> float | None:
    """Age in days from two ISO-8601 UTC strings, without parsing a full timestamp: the
    pipeline stores them in a sortable form and only the day part matters here."""
    if not posted or not now:
        return None
    try:
        start = datetime.fromisoformat(posted.replace("Z", "+00:00"))
        end = datetime.fromisoformat(now.replace("Z", "+00:00"))
    except ValueError:
        return None
    return max(0.0, (end - start).total_seconds() / 86400.0)


def recency_bonus(posted: str, now: str, options: RankWeights = DEFAULT_RANK_WEIGHTS) -> int:
    age = _days_old(posted, now)
    if age is None:
        return 0
    for days, bonus in options.recency_bonus:
        if age <= days:
            return bonus
    return 0


def rank_value(
    result: MatchResult, job: JobFacts, now: str, options: RankWeights = DEFAULT_RANK_WEIGHTS
) -> int:
    """Stored in `user_job_state.score`, which orders Discover. Relevance dominates: the two
    bonuses together are capped at 18 points against a 100-point match score."""
    return (
        result.score
        + options.region_bonus.get(job.region or "india", 0)
        + recency_bonus(job.posted, now, options)
    )


_COMPANY_NOISE_RE = re.compile(r"\b(inc|llc|ltd|limited|pvt|private|technologies|labs|india)\b")
_TITLE_ID_RE = re.compile(r"\b(?:job|req|requisition|id)[-_ ]?\d+\b|#\d+|\(\d+\)")


def _company_key(name: str) -> str:
    cleaned = _COMPANY_NOISE_RE.sub(" ", re.sub(r"[^a-z0-9\s]+", " ", (name or "").lower()))
    return re.sub(r"\s+", " ", cleaned).strip()


# Only function words are ignored when comparing titles: level markers ("I", "II", "3") stay,
# because they carry a different experience requirement.
_DUP_STOP = frozenset("the a an and or of for to in at with".split())


def duplicate_key(job: JobFacts) -> tuple[str, str]:
    """Near-identical roles at one company: the same title once requisition ids, punctuation
    and word order are set aside. Ingest already merges exact duplicates by dedupe key; this
    catches the same role listed per city or per requisition, which that key keeps apart."""
    title = _TITLE_ID_RE.sub(" ", (job.title or "").lower())
    title = _TITLE_NOISE_RE.sub(" ", title)
    tokens = sorted(t for t in title.split() if t not in _DUP_STOP)
    return _company_key(job.company), " ".join(tokens)


@dataclass
class Ranking:
    items: list[RankedJob] = field(default_factory=list)
    duplicates: list[RankedJob] = field(default_factory=list)


def rank_jobs(
    entries: Sequence[RankedJob], *, options: RankWeights = DEFAULT_RANK_WEIGHTS
) -> Ranking:
    """Order by relevance, drop near-duplicates and spread companies out.

    Ordering is stable and fully determined by the data: rank descending, then the newer
    posting, then the job id — so the same inputs always produce the same list. The
    per-company cap only moves a company's extra roles behind the first pass; nothing is
    thrown away, so pagination still sees every eligible job.
    """
    ordered = sorted(entries, key=lambda e: (-e.rank, _negated(e.job.posted), e.job.id))
    kept: list[RankedJob] = []
    duplicates: list[RankedJob] = []
    seen: dict[tuple[str, str], RankedJob] = {}
    for entry in ordered:
        key = duplicate_key(entry.job)
        first = seen.get(key)
        if first is not None:
            entry.duplicate_of = first.job.id
            duplicates.append(entry)
            continue
        seen[key] = entry
        kept.append(entry)
    front: list[RankedJob] = []
    overflow: list[RankedJob] = []
    per_company: dict[str, int] = {}
    for entry in kept:
        company = _company_key(entry.job.company)
        count = per_company.get(company, 0)
        if count >= options.max_per_company:
            overflow.append(entry)
            continue
        per_company[company] = count + 1
        front.append(entry)
    return Ranking(items=front + overflow, duplicates=duplicates)


class _Negated(str):
    """Sort a string descending inside an otherwise ascending key."""

    def __lt__(self, other: object) -> bool:  # type: ignore[override]
        return str(self) > str(other)

    def __gt__(self, other: object) -> bool:  # type: ignore[override]
        return str(self) < str(other)


def _negated(value: str) -> _Negated:
    return _Negated(value or "")


# --- stage C (optional): second-stage evaluation --------------------------------------

# An evaluator receives the best candidates and returns {job_id: {"score": 0-100,
# "reasons": [str, ...]}}. `cache_key` on each item is `inputs_key`, so an implementation can
# store its answer and never pay for the same job + candidate twice. Nothing in this
# repository implements one; see DISCOVERY.md "Optional AI evaluation".
SecondStage = Callable[[Sequence[RankedJob]], dict[str, dict[str, Any]]]

SECOND_STAGE_TOP_N = 20
SECOND_STAGE_WEIGHT = 0.4


def apply_second_stage(
    items: Sequence[RankedJob],
    evaluator: SecondStage | None,
    *,
    now: str,
    top_n: int = SECOND_STAGE_TOP_N,
    options: RankWeights = DEFAULT_RANK_WEIGHTS,
) -> list[RankedJob]:
    """Blend an optional evaluator's fit score into the deterministic one for the top `top_n`
    items only, then re-order. Any failure, timeout or malformed answer leaves the
    deterministic result untouched — the pipeline must work with no evaluator at all."""
    results = list(items)
    if evaluator is None or not results:
        return results
    head = results[:top_n]
    try:
        verdicts = evaluator(head) or {}
    except Exception:  # noqa: BLE001 - an evaluator must never break ranking
        for entry in head:
            entry.result.uncertainty.append("The optional AI evaluation was unavailable for this job.")
        return results
    for entry in head:
        verdict = verdicts.get(entry.job.id)
        if not isinstance(verdict, dict):
            continue
        score = verdict.get("score")
        if not isinstance(score, (int, float)) or isinstance(score, bool):
            continue
        ai = max(0, min(100, round(float(score))))
        blended = round(
            (1 - SECOND_STAGE_WEIGHT) * entry.result.score + SECOND_STAGE_WEIGHT * ai
        )
        entry.result.score = max(0, min(100, blended))
        reasons = verdict.get("reasons")
        if isinstance(reasons, list):
            entry.result.reasons.extend(str(r) for r in reasons[:2] if isinstance(r, str))
        entry.rank = rank_value(entry.result, entry.job, now, options)
    return sorted(results, key=lambda e: (-e.rank, _negated(e.job.posted), e.job.id))
