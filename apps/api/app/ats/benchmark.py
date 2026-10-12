"""Native Aavedak "best-of" resume criteria (engine 3.0).

The union of the strongest documented checks across the engines we approximate (sources in
ENGINES.md → "Native engine"). Each criterion is 0–100 with a weight; `weight 0` = not applicable and
dropped before renormalising. Quality criteria apply to every resume; the native match dimensions
(skills, responsibilities, title, experience) are computed in `analyze.py` and combined there.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ats.reference_signals import (
    count_phrase,
    detect_degree_level,
    extract_quality_signals,
    extract_reference_signals,
)
from app.ats.seniority import level_band, seniority_fit

# Quality criteria weights (sum 1.0). Rationale per criterion in ENGINES.md.
QUALITY_WEIGHTS: dict[str, float] = {
    "parseability": 0.12,
    "sectionsContact": 0.08,
    "quantifiedImpact": 0.15,
    "actionVerbs": 0.10,
    "bulletQuality": 0.08,
    "writingHygiene": 0.08,
    "tenseConsistency": 0.04,
    "repetitionSpelling": 0.06,
    "datesGaps": 0.05,
    "lengthSeniority": 0.12,
    "skillsEvidence": 0.12,
}
# Share of the final score taken by resume quality when a role / JD is given (the rest is match).
QUALITY_SHARE_IN_MATCH = 0.35

WEAK_OPENERS = (
    "assisted", "helped", "worked", "responsible", "participated", "handled", "involved",
    "tasked", "supported", "duties",
)
HEDGES = ("exposure to", "familiar with", "some experience", "basic understanding", "assisted with")
COMMON_TYPOS = (
    "teh", "recieve", "seperate", "definately", "occured", "managment", "enviroment", "developement",
    "successfull", "acheive", "experiance", "untill", "becuase", "thier", "maintainance", "relevent",
    "responsibilties", "sucessful", "techincal", "knowlege", "neccessary", "oppurtunity",
)
_ACTION_RE = re.compile(
    r"^(?:built|developed|designed|implemented|led|owned|created|optimized|improved|reduced|increased|"
    r"launched|shipped|architected|migrated|automated|delivered|drove|scaled|cut|grew|mentored|"
    r"established|engineered|streamlined|resolved|negotiated|analyzed|deployed|refactored|introduced|"
    r"spearheaded|achieved|accelerated|saved|won|trained|coordinated|managed|published|authored)\b",
    re.I,
)
_METRIC_RE = re.compile(
    r"\d+(?:\.\d+)?\s*%|[$₹€£]\s?\d|\b\d+(?:\.\d+)?\s*(?:k|m|b|x|ms|s|hrs?|hours|days|weeks|users|"
    r"customers|requests|people|engineers|members|services)\b|\b\d{2,}\b",
    re.I,
)
_RANGE_RE = re.compile(
    r"(?:[A-Za-z]{3,9}\.?\s+)?((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(?:(?:[A-Za-z]{3,9}\.?\s+)?((?:19|20)\d{2})|"
    r"(present|current|now))",
    re.I,
)
_CERT_RE = re.compile(r"\b(?:certified|certification|certificate|licen[cs]e[d]?)\b", re.I)


@dataclass
class Criterion:
    key: str
    label: str
    score: int
    weight: float
    detail: str
    sources: str


def _c(n: float) -> int:
    return max(0, min(100, int(round(n))))


def _ratio_score(share: float, target: float) -> int:
    return _c(100 * min(1.0, share / target)) if target > 0 else 100


def _gap_years(text: str) -> int:
    spans: list[tuple[int, int]] = []
    for m in _RANGE_RE.finditer(text or ""):
        start = int(m.group(1))
        end = 2100 if m.group(3) else int(m.group(2) or start)
        spans.append((start, end))
    spans.sort()
    gaps = 0
    for (_, prev_end), (nxt_start, _) in zip(spans, spans[1:]):
        if nxt_start - prev_end >= 2:  # more than a full calendar year uncovered
            gaps += 1
    return gaps


def quality_criteria(
    resume_text: str,
    *,
    parse_score: int,
    skills_in_experience: int,
    skills_total: int,
    years_experience: float | None = None,
    resume_years: list[float] | None = None,
) -> list[Criterion]:
    text = resume_text or ""
    s = extract_reference_signals(text)
    q = extract_quality_signals(text)
    bullets = q.bullets
    n_b = max(1, len(bullets))
    lower = text.lower()
    out: list[Criterion] = []

    def add(key: str, label: str, score: float, detail: str, sources: str) -> None:
        out.append(Criterion(key, label, _c(score), QUALITY_WEIGHTS[key], detail, sources))

    add("parseability", "ATS parseability", parse_score,
        "Readable text, standard headings, no table/column/icon artefacts.",
        "Jobscan formatting, Enhancv parse rate, Open ATS formatting")

    core = [x for x in ("experience", "education", "skills") if x in s.sections]
    contact = int(s.has_email) + int(s.has_phone)
    add("sectionsContact", "Sections & contact",
        len(core) / 3 * 70 + contact / 2 * 30,
        f"{len(core)}/3 core sections · email {'✓' if s.has_email else '✗'} · phone {'✓' if s.has_phone else '✗'}.",
        "Jobscan sections, Rezi/RW contact, ATS Resume Checker structure")

    metric = sum(1 for b in bullets if _METRIC_RE.search(b))
    time_based = sum(1 for b in bullets if re.search(r"\b(?:in|within|over)\s+\d+\s*(?:days?|weeks?|months?|quarters?|years?)\b", b, re.I))
    quant = 0.85 * _ratio_score(metric / n_b, 1 / 3) + 15 * min(1, time_based)
    add("quantifiedImpact", "Quantified impact", quant,
        f"{metric}/{len(bullets)} bullets carry a number (target ≥ ⅓); {time_based} time-bound.",
        "Resume Worded impact, Rezi achievements, Enhancv quantifying impact, Teal metrics")

    action = sum(1 for b in bullets if _ACTION_RE.match(b))
    weak = sum(1 for b in bullets if b.split() and b.split()[0].lower().strip(",.") in WEAK_OPENERS)
    add("actionVerbs", "Action verbs",
        _ratio_score(action / n_b, 0.6) - min(30, weak * 10),
        f"{action} bullets lead with a strong verb; {weak} weak openers (Assisted, Helped…).",
        "Resume Worded weak verbs, Open ATS action %, ATS Resume Checker achievements")

    per_role_ok = 3 <= q.bullets_per_role <= 6 if q.roles else len(bullets) >= 3
    length_ok = 8 <= q.avg_bullet_words <= 28
    long_b = sum(1 for b in bullets if len(b.split()) > 35)
    add("bulletQuality", "Bullet length & count",
        (50 if length_ok else 20) + (40 if per_role_ok else 15) + (10 if long_b == 0 else 0),
        f"avg {q.avg_bullet_words:.0f} words (8–28), {q.bullets_per_role:.1f} per role (3–6), {long_b} over 35 words.",
        "Resume Worded brevity, Rezi 3–6 bullets, Teal bullets per position")

    hedges = sum(count_phrase(lower, h) for h in HEDGES)
    hygiene = 100 - min(30, q.buzz_hits * 8) - min(20, q.pronoun_lines * 5) - min(20, max(0, q.passive_hits - 1) * 5) - min(20, hedges * 7)
    add("writingHygiene", "Buzzwords, pronouns, passive voice",
        hygiene,
        f"{q.buzz_hits} buzzwords/clichés, {q.pronoun_lines} pronoun lines, {q.passive_hits} passive, {hedges} hedges.",
        "Rezi best practices, Resume Worded style, Open ATS content, Jobscan buzzwords")

    starts = [b.split()[0].lower() for b in bullets if b.split()]
    past = sum(1 for w in starts if w.endswith("ed"))
    present = sum(1 for w in starts if (w.endswith("s") and not w.endswith("ss")) or w.endswith("ing"))
    mixed = min(past, present) / max(1, past + present)
    current_roles = len(re.findall(r"\b(?:present|current)\b", lower))
    # One current role legitimately uses present tense; tolerate up to ~25% minority tense.
    tol = 0.35 if current_roles else 0.2
    add("tenseConsistency", "Verb tense consistency",
        100 if mixed <= tol else 100 - (mixed - tol) * 200,
        f"{past} past-tense vs {present} present-tense bullet openers.",
        "Resume Worded verb tenses")

    repeat_starts = sum(c - 2 for c in _counts(starts).values() if c >= 3)
    typos = sum(1 for t in COMMON_TYPOS if re.search(rf"\b{t}\b", lower))
    doubled = len(re.findall(r"\b([a-z]{3,})\s+\1\b", lower))
    add("repetitionSpelling", "Repetition & spelling",
        100 - min(45, repeat_starts * 10) - min(45, (typos + doubled) * 15),
        f"{repeat_starts} repeated bullet openers, {typos} common typos, {doubled} doubled words.",
        "Enhancv repetition + spelling, Resume Worded repetition/spelling")

    gaps = _gap_years(text)
    mixed_dates = bool(q.full_month_dates and q.other_dates)
    add("datesGaps", "Dates & gaps",
        (100 if q.roles else 60) - (25 if mixed_dates else 0) - min(40, gaps * 20),
        f"{q.roles} date ranges, {'mixed' if mixed_dates else 'consistent'} format, {gaps} gap(s) > 1 year.",
        "Rezi date format, Resume Worded dates, Enhancv employment gaps, Jobscan date formatting")

    if years_experience is not None:
        fit = seniority_fit(
            years_experience,
            word_count=q.word_count,
            bullets=len(bullets),
            metric_bullets=metric,
            leadership_bullets=q.leadership_bullets,
            resume_years=resume_years,
        )
        add("lengthSeniority", "Length & seniority fit", fit.score,
            f"Calibrated for {years_experience:g} yrs ({fit.band.label}): {sum(fit.checks.values())}/{len(fit.checks)} checks.",
            "Resume Worded career level, Rezi experience level, Enhancv seniority fit, Jobscan job level")
    else:
        wc = q.word_count
        add("lengthSeniority", "Length", 100 if 400 <= wc <= 1000 else 70 if 300 <= wc <= 1600 else 35,
            f"{wc} words (400–1,000 ideal; set years of experience to calibrate).",
            "Rezi 400–1,600 words, Open ATS 400–800, Jobscan word count")

    add("skillsEvidence", "Skills shown in experience",
        _ratio_score(skills_in_experience / max(1, skills_total), 0.6) if skills_total else 30,
        f"{skills_in_experience}/{skills_total} recognised skills appear in experience/projects, not only a list.",
        "Enhancv skills evidence, Teal skills in bullets, Aavedak evidence model")
    return out


def _counts(items: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for i in items:
        out[i] = out.get(i, 0) + 1
    return out


def education_cert_match(resume_text: str, jd_text: str) -> int | None:
    """Degree level + certifications the JD names; None when the JD asks for neither."""
    jd_deg = detect_degree_level(jd_text)
    jd_cert = bool(_CERT_RE.search(jd_text or ""))
    if not jd_deg and not jd_cert:
        return None
    parts: list[float] = []
    if jd_deg:
        r = detect_degree_level(resume_text)
        parts.append(100 if r >= jd_deg else 50 if r else 0)
    if jd_cert:
        parts.append(100 if _CERT_RE.search(resume_text or "") else 0)
    return _c(sum(parts) / len(parts))


def weighted(criteria: list[Criterion]) -> int:
    total = sum(c.weight for c in criteria if c.weight > 0)
    return _c(sum(c.score * c.weight for c in criteria) / total) if total else 0


__all__ = [
    "Criterion",
    "QUALITY_SHARE_IN_MATCH",
    "QUALITY_WEIGHTS",
    "education_cert_match",
    "level_band",
    "quality_criteria",
    "weighted",
]
