"""Reference ATS scoring profiles (FastAPI primary implementations)."""

from __future__ import annotations

from typing import Any

from app.ats.analyze import _fingerprint, _label
from app.ats.reference_signals import (
    HARD_SKILL_ALIASES,
    ReferenceSignals,
    clamp,
    coverage,
    extract_quality_signals,
    extract_reference_signals,
    frequency_category_points,
    hard_skill_frequencies,
    pass_rate,
    skillsyncer_degree_points,
    token_coverage,
)
from app.ats.reference_weights import (
    JOBSCAN_WEIGHTS,
    RESUME_WORDED_WEIGHTS,
    REZI_WEIGHTS,
    SKILLSYNCER_POINTS,
    TEAL_JOB_MATCH_WEIGHTS,
)

PROFILE_VERSION = "1.2"


def _skill_hits(resume: list[str], jd: list[str]) -> tuple[list[dict], list[dict]]:
    rset = set(resume)
    matched = [
        {"skill": s, "status": "matched", "strength": 0.85, "evidence": "Found on resume"}
        for s in jd
        if s in rset
    ]
    missing = [{"skill": s, "status": "missing", "strength": 0} for s in jd if s not in rset]
    return matched, missing


def _pack(
    *,
    resume_id: str,
    mode: str,
    score_name: str,
    overall: int,
    engine_id: str,
    scoring_profile_id: str,
    scores: dict[str, Any],
    strengths: list[str],
    improvements: list[dict[str, str]],
    ats_issues: list[dict[str, str]],
    matched_skills: list[dict] | None = None,
    missing_skills: list[dict] | None = None,
    notes: list[str] | None = None,
    resume_text: str,
    blurb: str,
) -> dict[str, Any]:
    return {
        "resumeId": resume_id,
        "mode": mode,
        "scoreName": score_name,
        "overallScore": overall,
        "scoreLabel": _label(overall, mode),
        "scores": scores,
        "matchedSkills": matched_skills or [],
        "partialSkills": [],
        "missingSkills": missing_skills or [],
        "matchedResponsibilities": [],
        "partialResponsibilities": [],
        "missingResponsibilities": [],
        "strengths": strengths[:8],
        "improvements": improvements[:10],
        "atsIssues": ats_issues[:8],
        "confidence": "high" if len(resume_text) > 900 else "medium" if len(resume_text) > 400 else "low",
        "notes": [
            *(notes or []),
            f"profile {scoring_profile_id}@{PROFILE_VERSION} · reference approximation (FastAPI)",
        ],
        "engine": "fastapi",
        "engineVersion": f"{scoring_profile_id}@{PROFILE_VERSION}",
        "atsScore": overall,
        "textChars": len(resume_text.strip()),
        "textFingerprint": _fingerprint(resume_text),
        "blurb": blurb,
    }


def _failed_improvements(
    failed: list[str], reason: str, advice: dict[str, str] | None = None, limit: int = 5
) -> list[dict[str, str]]:
    return [
        {"priority": "medium", "text": (advice or {}).get(label, f"Address: {label}."), "reason": reason}
        for label in failed[:limit]
    ]


def run_jobscan_style(resume_id: str, resume_text: str, role: str, jd_text: str) -> dict[str, Any]:
    """Jobscan's tutorial: match rate = hard skills ≫ education (only for advanced degrees) > job title
    > soft skills > other keywords; frequent hard skills weigh more; word count, measurable results and
    formatting are not part of it. Exact weights are not public (see JOBSCAN_WEIGHTS)."""
    s = extract_reference_signals(resume_text, jd_text, role)
    w = JOBSCAN_WEIGHTS
    jd_freq = hard_skill_frequencies(f"{role}\n{jd_text}")
    rset = set(s.hard_skills_resume)
    # category -> (0..1 ratio, weight). Categories the job description doesn't ask for are left out
    # and the rest renormalised, like Jobscan recalculating over the remaining skills.
    parts: dict[str, tuple[float, float]] = {}
    if jd_freq:
        total = sum(jd_freq.values())
        parts["hard"] = (sum(n for k, n in jd_freq.items() if k in rset) / total, w["hard"])
    if s.degree_jd >= 2:
        parts["education"] = (1.0 if s.degree_resume >= s.degree_jd else 0.0, w["education"])
    if role.strip():
        parts["title"] = (1.0 if s.title_exact else s.title_hit, w["title"])
    if s.soft_skills_jd:
        parts["soft"] = (coverage(s.soft_skills_resume, s.soft_skills_jd), w["soft"])
    if s.jd_tokens:
        parts["other"] = (token_coverage(s.resume_tokens, s.jd_tokens), w["other"])
    total_w = sum(wt for _, wt in parts.values())
    match = clamp(100 * sum(r * wt for r, wt in parts.values()) / total_w) if total_w else 0

    def pct(key: str) -> int | None:
        return clamp(parts[key][0] * 100) if key in parts else None

    readability = clamp(
        (20 if s.has_email else 0)
        + (15 if s.has_phone else 0)
        + len(s.sections) * 10
        + min(25, s.text_len / 80)
        - s.stuffing * 8
    )
    matched, missing = _skill_hits(s.hard_skills_resume, list(jd_freq))
    missing.sort(key=lambda m: -jd_freq.get(m["skill"], 0))  # most frequent gaps first
    hard = parts["hard"][0] if "hard" in parts else 0.0
    title = parts["title"][0] if "title" in parts else 0.0
    used = " + ".join(f"{k}×{wt:g}" for k, (_, wt) in parts.items())
    return _pack(
        resume_id=resume_id,
        mode="job_match",
        score_name="Job Match Score",
        overall=match,
        engine_id="jobscan_style",
        scoring_profile_id="jobscan-reference",
        scores={
            "requiredSkills": pct("hard"),
            "preferredSkills": pct("soft"),
            "keywordCoverage": pct("other"),
            "jobTitleMatch": pct("title"),
            "atsCompatibility": readability,
            "structureFormatting": readability,
        },
        strengths=[
            *([f"Hard-skill coverage {int(hard * 100)}%"] if hard > 0.5 else []),
            *(["Job title appears on the resume"] if title >= 1 else []),
            *(["Solid plain-text parseability (advisory)"] if readability >= 70 else []),
        ],
        improvements=[
            {
                "priority": "high",
                "text": f"{m['skill']} appears in the JD ({jd_freq.get(m['skill'], 1)}×) but not clearly on the resume. Add only if you have genuine experience.",
                "reason": "Hard-skill gap vs JD — Jobscan weighs frequent hard skills most.",
            }
            for m in missing[:5]
        ],
        ats_issues=(
            [
                {
                    "code": "readability",
                    "title": "ATS readability signals are weak",
                    "detail": "Contact fields or section headings may be hard for parsers to extract. Advisory — not in match total.",
                }
            ]
            if readability < 60
            else []
        ),
        matched_skills=matched,
        missing_skills=missing,
        notes=[
            f"Match = ({used}) renormalised over the categories the JD asks for.",
            "Priority per Jobscan's tutorial: hard skills > education (advanced degree only) > title > soft skills > other keywords; hard skills are frequency-weighted.",
            "Word count, measurable results and formatting are not in the match rate (readability is advisory).",
            "Exact Jobscan weights are not public; the numbers are an Aavedak approximation.",
        ],
        resume_text=resume_text,
        blurb="Jobscan-style reference: documented priority order, frequency-weighted hard skills (not Jobscan’s proprietary engine).",
    )


def run_resume_worded_style(
    resume_id: str, resume_text: str, role: str, jd_text: str, mode: str | None = None
) -> dict[str, Any]:
    """Resume Worded: 20+ checks grouped as Impact, Brevity and Style, weighted by importance (weights
    not public); 85+ is 'good', 90+ passes every check. Checks below are the ones its pages describe."""
    s = extract_reference_signals(resume_text, jd_text, role)
    q = extract_quality_signals(resume_text)
    if mode in ("job_match", "resume_only", "role_match"):
        resolved = "resume_only" if mode == "role_match" else mode
    else:
        resolved = "job_match" if jd_text.strip() else "resume_only"
    w = RESUME_WORDED_WEIGHTS
    n_b = max(1, len(q.bullets))
    impact_checks = {
        "Quantified results in at least a third of bullets": s.metric_bullets / n_b >= 1 / 3,
        "Most bullets lead with a strong action verb": s.action_bullets / n_b >= 0.5,
        "Growth or leadership signals (led, mentored, grew…)": q.leadership_bullets >= 1,
        "At least three measurable bullets": s.metric_bullets >= 3,
    }
    brevity_checks = {
        "Bullets are 8–28 words": 8 <= q.avg_bullet_words <= 28,
        "Resume is focused (≤ 800 words)": q.word_count <= 800,
        "No more than 6 bullets per role": q.bullets_per_role <= 6,
        "No filler or vague phrases": q.buzz_hits == 0,
    }
    style_checks = {
        "Contact details parse (email and phone)": s.has_email and s.has_phone,
        "Standard sections present": len(s.sections) >= 3,
        "Consistent date format": not (q.full_month_dates and q.other_dates),
        "Active voice": q.passive_hits <= 2,
        "No keyword stuffing": s.stuffing == 0,
    }
    impact, brevity, style = (pass_rate(list(c.values())) for c in (impact_checks, brevity_checks, style_checks))
    quality = clamp(impact * w["impact"] + brevity * w["brevity"] + style * w["style"])
    target = (
        coverage(s.hard_skills_resume, s.hard_skills_jd)
        if resolved == "job_match" and s.hard_skills_jd
        else None
    )
    overall = clamp(quality * 0.7 + target * 100 * 0.3) if target is not None else quality
    failed = [label for c in (impact_checks, brevity_checks, style_checks) for label, ok in c.items() if not ok]
    return _pack(
        resume_id=resume_id,
        mode="job_match" if resolved == "job_match" else "resume_only",
        score_name="Targeted Resume Score" if resolved == "job_match" else "Resume Quality Score",
        overall=overall,
        engine_id="resume_worded_style",
        scoring_profile_id="resume-worded-reference",
        scores={
            "resumeQuality": quality,
            "evidenceQuality": clamp(impact),
            "experienceQuality": clamp(brevity),
            "structureFormatting": clamp(style),
            "requiredSkills": clamp(target * 100) if target is not None else None,
        },
        strengths=[
            *([f"{s.metric_bullets} measurable impact bullets"] if s.metric_bullets >= 2 else []),
            *([f"{s.action_bullets} action-led bullets"] if s.action_bullets >= 3 else []),
            *(["Passes every Impact check"] if impact >= 100 else []),
        ],
        improvements=_failed_improvements(
            failed,
            "Resume Worded-style check (Impact / Brevity / Style)",
            {"Quantified results in at least a third of bullets": "Add measurable results where truthful (latency, users, time saved)."},
        ),
        ats_issues=[],
        notes=[
            f"Quality = Impact×{w['impact']} + Brevity×{w['brevity']} + Style×{w['style']}; each is the share of its checks passed.",
            "Resume Worded does not publish its 20+ checks or weights; these are the checks its pages describe.",
        ],
        resume_text=resume_text,
        blurb="Resume Worded-style reference: Impact, Brevity and Style checks (85+ is good).",
    )


def run_teal_style(
    resume_id: str, resume_text: str, role: str, jd_text: str, mode: str | None = None
) -> dict[str, Any]:
    s = extract_reference_signals(resume_text, jd_text, role)
    want_job = mode == "job_match" or (not mode and bool(jd_text.strip()))
    if want_job and jd_text.strip():
        w = TEAL_JOB_MATCH_WEIGHTS
        hard = coverage(s.hard_skills_resume, s.hard_skills_jd) if s.hard_skills_jd else 1.0
        toks = token_coverage(s.resume_tokens, s.jd_tokens) if s.jd_tokens else 1.0
        title = 1.0 if s.title_exact else s.title_hit
        overall = clamp(hard * w["hard"] + toks * w["keywords"] + title * w["title"])
        matched, missing = _skill_hits(s.hard_skills_resume, s.hard_skills_jd)
        return _pack(
            resume_id=resume_id,
            mode="job_match",
            score_name="Job Match Score",
            overall=overall,
            engine_id="teal_style",
            scoring_profile_id="teal-reference",
            scores={
                "requiredSkills": clamp(hard * 100),
                "keywordCoverage": clamp(toks * 100),
                "jobTitleMatch": clamp(title * 100),
                "experienceMatch": clamp(40 + s.action_bullets * 6),
            },
            strengths=( ["Meaningful hard-skill overlap with JD"] if hard > 0.4 else [] ),
            improvements=[
                {
                    "priority": "medium",
                    "text": f"If you have {m['skill']} experience, evidence it in a bullet — do not invent it.",
                    "reason": "Teal Job Matcher gap (reference approximation).",
                }
                for m in missing[:4]
            ],
            ats_issues=[],
            matched_skills=matched,
            missing_skills=missing,
            notes=[f"Job Match = hard×{w['hard']} + keywords×{w['keywords']} + title×{w['title']}."],
            resume_text=resume_text,
            blurb="Teal-style Job Matcher path.",
        )
    overall = clamp(
        (12 if s.has_email else 0)
        + (8 if s.has_phone else 0)
        + len(s.sections) * 10
        + min(25, s.action_bullets * 5)
        + min(20, s.metric_bullets * 8)
        + min(15, len(s.hard_skills_resume) * 2)
        - s.stuffing * 8
    )
    return _pack(
        resume_id=resume_id,
        mode="resume_only",
        score_name="Resume Score",
        overall=overall,
        engine_id="teal_style",
        scoring_profile_id="teal-reference",
        scores={
            "resumeQuality": overall,
            "atsCompatibility": clamp((40 if s.has_email else 10) + len(s.sections) * 12),
            "experienceQuality": clamp(30 + s.action_bullets * 8 + s.metric_bullets * 10),
        },
        strengths=( ["Core sections detected"] if len(s.sections) >= 3 else [] ),
        improvements=(
            [
                {
                    "priority": "high",
                    "text": "Rewrite bullets to start with clear actions and outcomes.",
                    "reason": "Teal Resume Analyzer (reference approximation).",
                }
            ]
            if s.action_bullets < 3
            else []
        ),
        ats_issues=[],
        resume_text=resume_text,
        blurb="Teal-style Resume Analyzer path.",
    )


def run_rezi_style(
    resume_id: str, resume_text: str, role: str, jd_text: str, mode: str | None = None
) -> dict[str, Any]:
    """Rezi Score: 1–100 from five categories (Content, Format, Optimization, Best Practices,
    Application Ready) built from 23 audits. Rezi publishes the categories and several audit
    thresholds (below) but not the audit list or weights; Application Ready 'depends largely on the
    other four'."""
    s = extract_reference_signals(resume_text, jd_text, role)
    q = extract_quality_signals(resume_text)
    resolved = (
        "job_match"
        if mode == "job_match" or (not mode and jd_text.strip())
        else "resume_only"
    )
    w = REZI_WEIGHTS
    n_b = max(1, len(q.bullets))
    content_checks = {
        "3–6 bullets per experience entry": 3 <= q.bullets_per_role <= 6,
        "Measurable outcomes (numbers, %, scale)": s.metric_bullets / n_b >= 1 / 3,
        "Enough context per bullet (12+ words)": q.avg_bullet_words >= 12,
        "No personal pronouns (I, me, my)": q.pronoun_lines == 0,
    }
    format_checks = {
        "One to two pages (about 1,000 words or fewer)": q.word_count <= 1000,
        "At least 3 bullets per experience entry": q.bullets_per_role >= 3,
        "Contact details present (email and phone)": s.has_email and s.has_phone,
        "Standard sections present": len(s.sections) >= 3,
    }
    if resolved == "job_match" and s.hard_skills_jd:
        optimization_checks = {
            "Job-description hard skills covered (60%+)": coverage(s.hard_skills_resume, s.hard_skills_jd) >= 0.6,
            "Job-description keywords covered (40%+)": token_coverage(s.resume_tokens, s.jd_tokens) >= 0.4,
            "Target job title appears": bool(role.strip()) and s.title_hit >= 0.5,
            "No keyword stuffing": s.stuffing == 0,
        }
    else:
        # No JD to tailor to: Rezi's Optimization needs one, so judge only keyword hygiene.
        optimization_checks = {
            "Skills listed (5+ recognised)": len(s.hard_skills_resume) >= 5,
            "No keyword stuffing": s.stuffing == 0,
        }
    best_checks = {
        "400–1,600 words": 400 <= q.word_count <= 1600,
        "Dates as full month and year (January 2025)": q.full_month_dates > 0 and q.other_dates == 0,
        "No buzzwords or filler": q.buzz_hits == 0,
        "Active voice": q.passive_hits <= 2,
        "Skills grouped into categories": q.category_skill_lines >= 2,
    }
    cats = {
        "content": pass_rate(list(content_checks.values())),
        "format": pass_rate(list(format_checks.values())),
        "optimization": pass_rate(list(optimization_checks.values())),
        "best_practices": pass_rate(list(best_checks.values())),
    }
    details = pass_rate([s.has_email, s.has_phone, "experience" in s.sections, "education" in s.sections])
    # Application Ready: complete details, plus overall standing in the other four categories.
    cats["application_readiness"] = 0.5 * details + 0.5 * (sum(cats.values()) / 4)
    overall = clamp(sum(cats[k] * w[k] for k in w))
    failed = [
        label
        for checks in (content_checks, format_checks, optimization_checks, best_checks)
        for label, ok in checks.items()
        if not ok
    ]
    return _pack(
        resume_id=resume_id,
        mode=resolved,
        score_name="Application Readiness Score" if resolved == "job_match" else "Resume Optimization Score",
        overall=overall,
        engine_id="rezi_style",
        scoring_profile_id="rezi-reference",
        scores={
            "resumeQuality": clamp(cats["content"]),
            "structureFormatting": clamp(cats["format"]),
            "keywordCoverage": (
                clamp(coverage(s.hard_skills_resume, s.hard_skills_jd) * 100)
                if resolved == "job_match" and s.hard_skills_jd
                else None
            ),
            "atsCompatibility": clamp(cats["format"]),
            "evidenceQuality": clamp(cats["best_practices"]),
            "experienceQuality": clamp(cats["application_readiness"]),
        },
        strengths=[
            *(["Format/contact structure looks parser-friendly"] if cats["format"] >= 75 else []),
            *(["Content passes most audits"] if cats["content"] >= 75 else []),
            *(["Best-practice audits mostly passed"] if cats["best_practices"] >= 80 else []),
        ],
        improvements=_failed_improvements(
            failed,
            "Rezi-style audit",
            {"Job-description hard skills covered (60%+)": "Evidence the JD tools you actually used in experience bullets — do not paste keywords without evidence."},
        ),
        ats_issues=[],
        notes=[
            "Each category is the share of its audits passed: " + ", ".join(f"{k} {int(v)}" for k, v in cats.items()) + ".",
            "Rezi bands: 90+ ready to apply, 50–89 solid foundation, below 50 needs updates.",
            "Rezi publishes categories and some thresholds, not its 23 audits or weights.",
        ],
        resume_text=resume_text,
        blurb="Rezi-style readiness: pass/fail audits across Content, Format, Optimization, Best Practices, Application Ready.",
    )


def run_skillsyncer_style(resume_id: str, resume_text: str, role: str, jd_text: str) -> dict[str, Any]:
    s = extract_reference_signals(resume_text, jd_text, role)
    p = SKILLSYNCER_POINTS
    hard_pts, hard_m, hard_miss = frequency_category_points(
        s.hard_skills_jd, s.resume_lower, s.jd_lower, p["hard"], HARD_SKILL_ALIASES
    )
    soft_pts, _, _ = frequency_category_points(s.soft_skills_jd, s.resume_lower, s.jd_lower, p["soft"])
    other_pts, _, _ = frequency_category_points(
        s.jd_tokens[:40], s.resume_lower, s.jd_lower, p["other"]
    )
    title_pts = p["title"] if (s.title_exact or (role.strip() and s.title_hit >= 1)) else 0
    degree_pts = skillsyncer_degree_points(s.degree_resume, s.degree_jd)
    overall = clamp(hard_pts + soft_pts + other_pts + title_pts + degree_pts)
    matched = [
        {"skill": x, "status": "matched", "strength": 0.9, "evidence": "Frequency-aware hard-skill match"}
        for x in hard_m
    ]
    missing = [{"skill": x, "status": "missing", "strength": 0} for x in hard_miss]
    return _pack(
        resume_id=resume_id,
        mode="job_match",
        score_name="Weighted Job Match Score",
        overall=overall,
        engine_id="skillsyncer_style",
        scoring_profile_id="skillsyncer-reference",
        scores={
            "requiredSkills": clamp((hard_pts / p["hard"]) * 100),
            "preferredSkills": clamp((soft_pts / p["soft"]) * 100),
            "keywordCoverage": clamp((other_pts / p["other"]) * 100),
            "jobTitleMatch": 100 if title_pts == p["title"] else 0,
            "evidenceQuality": clamp(40 + s.action_bullets * 8),
        },
        strengths=[
            f"Hard skills {int(round(hard_pts))}/{p['hard']}",
            f"Soft skills {int(round(soft_pts))}/{p['soft']}",
            f"Other keywords {int(round(other_pts))}/{p['other']}",
            f"Title {title_pts}/{p['title']}",
            f"Degree {degree_pts}/{p['degree']}",
        ],
        improvements=[
            {
                "priority": "high",
                "text": f"{m['skill']} is weighted heavily in this profile. Only add it if you have genuine experience.",
                "reason": "SkillSyncer hard-skill gap (60-point category).",
            }
            for m in missing[:5]
        ],
        ats_issues=[],
        matched_skills=matched,
        missing_skills=missing,
        notes=[
            f"Documented allocation: hard {p['hard']} · soft {p['soft']} · other {p['other']} · title {p['title']} · degree {p['degree']}.",
            "Empty JD keyword category → full category points.",
        ],
        resume_text=resume_text,
        blurb="SkillSyncer-style documented 100-point weighted match (reference).",
    )
