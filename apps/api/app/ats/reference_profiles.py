"""Reference ATS scoring profiles (FastAPI primary implementations)."""

from __future__ import annotations

from typing import Any

from app.ats.analyze import _fingerprint, _label
from app.ats.reference_signals import (
    HARD_SKILL_ALIASES,
    ReferenceSignals,
    clamp,
    coverage,
    extract_reference_signals,
    frequency_category_points,
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

PROFILE_VERSION = "1.1"


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


def run_jobscan_style(resume_id: str, resume_text: str, role: str, jd_text: str) -> dict[str, Any]:
    s = extract_reference_signals(resume_text, jd_text, role)
    w = JOBSCAN_WEIGHTS
    hard = coverage(s.hard_skills_resume, s.hard_skills_jd) if s.hard_skills_jd else 1.0
    soft_target = s.soft_skills_jd or []
    soft = coverage(s.soft_skills_resume, soft_target) if soft_target else 1.0
    other = token_coverage(s.resume_tokens, s.jd_tokens) if s.jd_tokens else 1.0
    title = 1.0 if s.title_exact else s.title_hit
    readability = clamp(
        (20 if s.has_email else 0)
        + (15 if s.has_phone else 0)
        + len(s.sections) * 10
        + min(25, s.text_len / 80)
        - s.stuffing * 8
    )
    match = clamp(hard * w["hard"] + soft * w["soft"] + other * w["other"] + title * w["title"])
    matched, missing = _skill_hits(s.hard_skills_resume, s.hard_skills_jd)
    return _pack(
        resume_id=resume_id,
        mode="job_match",
        score_name="Job Match Score",
        overall=match,
        engine_id="jobscan_style",
        scoring_profile_id="jobscan-reference",
        scores={
            "requiredSkills": clamp(hard * 100),
            "preferredSkills": clamp(soft * 100),
            "keywordCoverage": clamp(other * 100),
            "jobTitleMatch": clamp(title * 100),
            "atsCompatibility": readability,
            "structureFormatting": readability,
        },
        strengths=[
            *( [f"Hard-skill coverage {int(hard * 100)}%"] if hard > 0.5 else [] ),
            *( ["Title alignment signals present"] if title > 0.4 else [] ),
            *( ["Solid plain-text parseability (advisory)"] if readability >= 70 else [] ),
        ],
        improvements=[
            {
                "priority": "high",
                "text": f"{m['skill']} appears in the JD but not clearly on the resume. Add only if you have genuine experience.",
                "reason": "Hard-skill gap vs JD (Jobscan reference approximation).",
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
            f"Match formula: hard×{w['hard']} + soft×{w['soft']} + other×{w['other']} + title×{w['title']}.",
            "Readability is advisory and excluded from the match total.",
        ],
        resume_text=resume_text,
        blurb="Jobscan-style reference: JD keyword & title match (not Jobscan’s proprietary engine).",
    )


def run_resume_worded_style(
    resume_id: str, resume_text: str, role: str, jd_text: str, mode: str | None = None
) -> dict[str, Any]:
    s = extract_reference_signals(resume_text, jd_text, role)
    if mode in ("job_match", "resume_only", "role_match"):
        resolved = "resume_only" if mode == "role_match" else mode
    else:
        resolved = "job_match" if jd_text.strip() else "resume_only"
    w = RESUME_WORDED_WEIGHTS
    impact = clamp(18 + s.metric_bullets * 12 + s.action_bullets * 4)
    skills = clamp(20 + len(s.hard_skills_resume) * 5 + (-15 if s.stuffing else 5))
    wording = clamp(25 + min(30, s.action_bullets * 5) - min(20, s.stuffing * 10))
    presentation = clamp(
        (15 if s.has_email else 0)
        + (10 if s.has_phone else 0)
        + len(s.sections) * 12
        + min(20, s.text_len / 100)
    )
    quality = clamp(
        impact * w["impact"] + skills * w["skills"] + wording * w["wording"] + presentation * w["presentation"]
    )
    target = (
        coverage(s.hard_skills_resume, s.hard_skills_jd)
        if resolved == "job_match" and s.hard_skills_jd
        else None
    )
    overall = clamp(quality * 0.7 + target * 100 * 0.3) if target is not None else quality
    return _pack(
        resume_id=resume_id,
        mode="job_match" if resolved == "job_match" else "resume_only",
        score_name="Targeted Resume Score" if resolved == "job_match" else "Resume Quality Score",
        overall=overall,
        engine_id="resume_worded_style",
        scoring_profile_id="resume-worded-reference",
        scores={
            "resumeQuality": quality,
            "evidenceQuality": impact,
            "technicalSkills": skills,
            "structureFormatting": presentation,
            "requiredSkills": clamp(target * 100) if target is not None else None,
        },
        strengths=[
            *( [f"{s.metric_bullets} measurable impact bullets"] if s.metric_bullets >= 2 else [] ),
            *( [f"{s.action_bullets} action-led bullets"] if s.action_bullets >= 3 else [] ),
        ],
        improvements=(
            [
                {
                    "priority": "high",
                    "text": "Add measurable results to 2–3 bullets where truthful (latency, users, time saved).",
                    "reason": "Impact check (Resume Worded reference approximation).",
                }
            ]
            if s.metric_bullets < 2
            else []
        ),
        ats_issues=[],
        resume_text=resume_text,
        blurb="Resume Worded-style reference: weighted resume quality checks.",
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
    s = extract_reference_signals(resume_text, jd_text, role)
    resolved = (
        "job_match"
        if mode == "job_match" or (not mode and jd_text.strip())
        else "resume_only"
    )
    w = REZI_WEIGHTS
    content = clamp(20 + s.action_bullets * 6 + s.metric_bullets * 8 + len(s.hard_skills_resume) * 2)
    fmt = clamp(
        (20 if s.has_email else 0)
        + (15 if s.has_phone else 0)
        + len(s.sections) * 12
        + (15 if s.text_len > 600 else 5)
    )
    optimization = clamp(
        30
        + (
            coverage(s.hard_skills_resume, s.hard_skills_jd) * 40
            if resolved == "job_match" and s.hard_skills_jd
            else 20
        )
        + (-20 if s.stuffing else 10)
    )
    best = clamp(
        (25 if s.action_bullets >= 3 else 10)
        + (25 if s.metric_bullets >= 1 else 5)
        + (25 if not s.stuffing else 0)
        + (25 if "experience" in s.sections else 10)
    )
    readiness = clamp(
        (30 if s.has_email else 0)
        + (20 if s.has_phone else 0)
        + (30 if len(s.sections) >= 3 else 10)
        + (20 if s.text_len > 400 else 5)
    )
    overall = clamp(
        content * w["content"]
        + fmt * w["format"]
        + optimization * w["optimization"]
        + best * w["best_practices"]
        + readiness * w["application_readiness"]
    )
    return _pack(
        resume_id=resume_id,
        mode=resolved,
        score_name="Application Readiness Score" if resolved == "job_match" else "Resume Optimization Score",
        overall=overall,
        engine_id="rezi_style",
        scoring_profile_id="rezi-reference",
        scores={
            "resumeQuality": content,
            "structureFormatting": fmt,
            "keywordCoverage": (
                clamp(coverage(s.hard_skills_resume, s.hard_skills_jd) * 100)
                if resolved == "job_match" and s.hard_skills_jd
                else None
            ),
            "atsCompatibility": fmt,
            "evidenceQuality": best,
            "experienceQuality": readiness,
        },
        strengths=[
            *( ["Format/contact structure looks parser-friendly"] if fmt >= 70 else [] ),
            *( ["Content density with actions/metrics"] if content >= 70 else [] ),
        ],
        improvements=(
            [
                {
                    "priority": "high",
                    "text": "Align experience bullets to JD tools you actually used — do not paste JD keywords without evidence.",
                    "reason": "Rezi optimization category (reference approximation).",
                }
            ]
            if optimization < 60 and resolved == "job_match"
            else []
        ),
        ats_issues=[],
        resume_text=resume_text,
        blurb="Rezi-style readiness categories (reference approximation).",
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
