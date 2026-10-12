"""Years-of-experience calibration shared by the native engine and the Resume Worded-style profile.

Resume Worded, Rezi and Enhancv calibrate their checks to the candidate's career level. We take the
user's stated years of experience (from their profile, editable on the ATS page) and compare it with
level-appropriate expectations for length, bullet count, quantified impact and leadership signals.
Without a stated YoE nothing here runs, so scores stay unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class LevelBand:
    key: str
    label: str
    min_words: int
    max_words: int
    min_bullets: int
    min_metric_share: float
    needs_leadership: bool


def level_band(years: float) -> LevelBand:
    if years < 1:
        return LevelBand("entry", "Entry level (<1 yr)", 250, 650, 4, 0.15, False)
    if years < 3:
        return LevelBand("junior", "Junior (1–3 yrs)", 300, 750, 6, 0.25, False)
    if years < 6:
        return LevelBand("mid", "Mid level (3–6 yrs)", 400, 900, 8, 0.33, True)
    if years < 10:
        return LevelBand("senior", "Senior (6–10 yrs)", 450, 1100, 10, 0.4, True)
    return LevelBand("staff", "Staff / leadership (10+ yrs)", 500, 1300, 10, 0.4, True)


@dataclass
class SeniorityFit:
    score: int
    band: LevelBand
    checks: dict[str, bool] = field(default_factory=dict)
    improvements: list[dict] = field(default_factory=list)


def seniority_fit(
    years: float,
    *,
    word_count: int,
    bullets: int,
    metric_bullets: int,
    leadership_bullets: int,
    resume_years: list[float] | None = None,
) -> SeniorityFit:
    band = level_band(years)
    share = metric_bullets / max(1, bullets)
    checks = {
        f"Length suits {band.label} ({band.min_words}–{band.max_words} words)": band.min_words
        <= word_count
        <= band.max_words,
        f"At least {band.min_bullets} experience bullets for {band.label}": bullets >= band.min_bullets,
        f"Quantified results in ≥{round(band.min_metric_share * 100)}% of bullets": share
        >= band.min_metric_share,
    }
    if band.needs_leadership:
        checks["Ownership / leadership signals (led, mentored, owned…)"] = leadership_bullets >= 1
    if resume_years:
        # A resume claiming far more years than the user states (or vice versa) reads as inconsistent.
        checks["Years claimed on resume are consistent with stated experience"] = (
            max(resume_years) <= years + 2
        )
    passed = sum(1 for ok in checks.values() if ok)
    score = round(100 * passed / max(1, len(checks)))
    improvements = [
        {
            "priority": "medium",
            "text": f"Experience-level check failed: {label}.",
            "reason": f"Calibrated for {years:g} years of experience ({band.label}).",
        }
        for label, ok in checks.items()
        if not ok
    ]
    return SeniorityFit(score=score, band=band, checks=checks, improvements=improvements)
