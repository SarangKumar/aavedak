"""Reference ATS scoring profiles (FastAPI primary implementations)."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from app.ats.analyze import _fingerprint, _label
from app.ats.benchmark import COMMON_TYPOS, WEAK_OPENERS
from app.ats.seniority import level_band
from app.ats.reference_signals import (
    HARD_SKILL_ALIASES,
    ReferenceSignals,
    clamp,
    coverage,
    extract_quality_signals,
    extract_reference_signals,
    frequency_category_points,
    hard_skill_frequencies,
    jd_keyphrases,
    keyphrase_coverage,
    pass_rate,
    weighted_pass,
    skillsyncer_degree_points,
    token_coverage,
)
from app.ats.reference_weights import (
    ENHANCV_WEIGHTS,
    JOBSCAN_MIN_TAXONOMY_SKILLS,
    JOBSCAN_WEIGHTS,
    REZI_AUDIT_WEIGHTS,
    REZI_WEIGHTS,
    SKILLSYNCER_POINTS,
    TEAL_CARD_WEIGHTS,
)

PROFILE_VERSION = "1.4"


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
    phrase_missing: list[str] = []
    if len(jd_freq) >= JOBSCAN_MIN_TAXONOMY_SKILLS:
        total = sum(jd_freq.values())
        parts["hard"] = (sum(n for k, n in jd_freq.items() if k in rset) / total, w["hard"])
    else:
        # Few software skills in the JD (e.g. a mechanical-engineering role): its domain phrases are the hard skills.
        phrases = jd_keyphrases(jd_text)
        if phrases:
            ratio, phrase_missing = keyphrase_coverage(resume_text, phrases)
            parts["hard"] = (ratio, w["hard"])
    if s.degree_jd >= 2:
        parts["education"] = (1.0 if s.degree_resume >= s.degree_jd else 0.0, w["education"])
    if role.strip():
        # Jobscan checks for the exact job title ("not found in your resume") — no partial credit.
        parts["title"] = (1.0 if s.title_exact else 0.0, w["title"])
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
        ]
        + [
            {
                "priority": "medium",
                "text": f"“{ph}” is a recurring term in the JD but isn't on the resume. Add it only if it truthfully applies.",
                "reason": "Domain keyword gap vs JD.",
            }
            for ph in phrase_missing[:5]
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
    resume_id: str,
    resume_text: str,
    role: str,
    jd_text: str,
    mode: str | None = None,
    years_experience: float | None = None,
) -> dict[str, Any]:
    """Resume Worded: 20+ checks grouped as Impact, Brevity and Style, weighted by importance (weights
    not public); 85+ is 'good', 90+ passes every check. Checks below are the ones its pages describe."""
    s = extract_reference_signals(resume_text, jd_text, role)
    q = extract_quality_signals(resume_text)
    if mode in ("job_match", "resume_only", "role_match"):
        resolved = "resume_only" if mode == "role_match" else mode
    else:
        resolved = "job_match" if jd_text.strip() else "resume_only"
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
    starts = [b.split()[0].lower().strip(",.") for b in q.bullets if b.split()]
    past = sum(1 for x in starts if x.endswith("ed"))
    present = sum(1 for x in starts if x.endswith("s") and not x.endswith("ss"))
    impact_checks["No weak verb openers (Assisted, Helped…)"] = not any(x in WEAK_OPENERS for x in starts)
    impact_checks["Consistent verb tense"] = min(past, present) <= max(1, 0.25 * (past + present))
    impact_checks["No repeated bullet openers (3+ times)"] = all(starts.count(x) < 3 for x in set(starts))
    impact_checks["Teamwork / communication / analytical signals"] = bool(
        re.search(r"\b(?:collaborat|cross-functional|partnered|presented|analy[sz]|stakeholder)", s.resume_lower)
    )
    brevity_checks["No personal pronouns"] = q.pronoun_lines == 0
    brevity_checks["No common spelling mistakes"] = not any(
        re.search(rf"\b{t}\b", s.resume_lower) for t in COMMON_TYPOS
    )
    style_checks = {
        "Contact details parse (email and phone)": s.has_email and s.has_phone,
        "Standard sections present": len(s.sections) >= 3,
        "Consistent date format": not (q.full_month_dates and q.other_dates),
        "Active voice": q.passive_hits <= 2,
        "No keyword stuffing": s.stuffing == 0,
    }
    level_note: list[str] = []
    if years_experience is not None:
        # Resume Worded asks for career level and adapts its checks to it; mirror that.
        band = level_band(years_experience)
        brevity_checks.pop("Resume is focused (≤ 800 words)")
        brevity_checks[f"Length suits {band.label} (≤ {band.max_words} words)"] = (
            q.word_count <= band.max_words
        )
        if not band.needs_leadership:
            impact_checks.pop("Growth or leadership signals (led, mentored, grew…)")
        level_note.append(f"Checks calibrated for {years_experience:g} years ({band.label}).")
    impact, brevity, style = (pass_rate(list(c.values())) for c in (impact_checks, brevity_checks, style_checks))
    # "Your score out of 100 reflects how many checks you pass" (resumeworded.com/score): equal weight per check.
    all_checks = [*impact_checks.values(), *brevity_checks.values(), *style_checks.values()]
    quality = clamp(pass_rate(all_checks))
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
            f"Quality = share of all {len(all_checks)} checks passed (Resume Worded: score reflects how many checks you pass); group scores shown for reference.",
            "Resume Worded does not publish its 20+ checks or weights; these are the checks its pages describe.",
            *level_note,
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
        # Teal: "Your match score reflects how many of the job's keywords appear in your resume" —
        # hard skills, soft skills and other keywords, no published weights → share of all surfaced keywords.
        hard = coverage(s.hard_skills_resume, s.hard_skills_jd) if s.hard_skills_jd else 1.0
        toks = token_coverage(s.resume_tokens, s.jd_tokens[:30]) if s.jd_tokens else 1.0
        title = 1.0 if s.title_exact else s.title_hit
        rset = set(s.hard_skills_resume) | set(s.soft_skills_resume) | set(s.resume_tokens)
        keywords = list(dict.fromkeys([*s.hard_skills_jd, *s.soft_skills_jd, *s.jd_tokens[:30]]))
        overall = clamp(100 * sum(1 for k in keywords if k in rset) / len(keywords)) if keywords else 0
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
            notes=[
                f"Job Match = share of the JD's {len(keywords)} surfaced keywords (hard + soft + other) found on the resume.",
                "Teal publishes no weights; it says the score reflects how many of the job's keywords appear.",
            ],
            resume_text=resume_text,
            blurb="Teal-style Job Matcher path.",
        )
    # Resume Analyzer issue cards (help.tealhq.com "Using the Resume Analyzer"): time-based metrics
    # (≥ 2 bullets "in/within <period>"), improvement metrics (≥ 1 bullet with %, range or money),
    # contact info, professional summary, target title, not too many skills, 3–5 bullets per
    # position, skills used inside bullets. Score = share of cards cleared.
    q = extract_quality_signals(resume_text)
    time_based = sum(
        1 for b in q.bullets
        if re.search(r"\b(?:in|within)\s+(?:\d+|one|two|three|four|five|six)\s*(?:days?|weeks?|months?|quarters?|years?)\b|\bin\s+(?:19|20)\d{2}\b", b, re.I)
    )
    improvement = sum(1 for b in q.bullets if re.search(r"\d+(?:\.\d+)?\s*%|\d+\s*[-–]\s*\d+|[$₹€£]\s?\d", b))
    skills_in_bullets = sum(
        1 for b in q.bullets if any(re.search(rf"\b{re.escape(k)}\b", b.lower()) for k in s.hard_skills_resume)
    )
    cards = {
        "Time-based metrics (2+ bullets with “in/within …”)": time_based >= 2,
        "Improvement metric (1+ bullet with %, range or money)": improvement >= 1,
        "Contact information": s.has_email and s.has_phone,
        "Professional summary": "summary" in s.sections or bool(re.search(r"(?:^|\n)\s*(?:profile|about me|objective)\b", s.resume_lower)),
        "Target title near the top": bool(re.search(r"\b(?:engineer|developer|analyst|designer|manager|scientist|intern)\b", "\n".join(resume_text.splitlines()[:4]).lower())),
        "Not too many skills listed (≤ 30)": len(s.hard_skills_resume) <= 30,
        "3–5 bullets per position": 3 <= q.bullets_per_role <= 5 if q.roles else len(q.bullets) >= 3,
        "Skills used inside bullets": skills_in_bullets >= 2,
    }
    overall = clamp(weighted_pass(cards, TEAL_CARD_WEIGHTS))
    failed = [k for k, ok in cards.items() if not ok]
    return _pack(
        resume_id=resume_id,
        mode="resume_only",
        score_name="Resume Score",
        overall=overall,
        engine_id="teal_style",
        scoring_profile_id="teal-reference",
        scores={
            "resumeQuality": overall,
            "evidenceQuality": clamp(pass_rate([cards[k] for k in list(cards)[:2]])),
            "structureFormatting": clamp(pass_rate([cards[k] for k in list(cards)[2:5]])),
            "experienceQuality": clamp(pass_rate([cards[k] for k in list(cards)[5:]])),
        },
        strengths=[k for k, ok in cards.items() if ok][:4],
        improvements=_failed_improvements(failed, "Teal Resume Analyzer issue card (reference)"),
        ats_issues=[],
        notes=[
            f"Resume Score = weighted share of {len(cards)} documented Resume Analyzer issue cards cleared "
            "(metrics and contact 1.5×, skills-in-bullets 1.25×, others 1×; Teal publishes no weights)."
        ],
        resume_text=resume_text,
        blurb="Teal-style Resume Analyzer: documented issue cards (metrics, contact, summary, title, skills, bullets).",
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
        "content": weighted_pass(content_checks, REZI_AUDIT_WEIGHTS),
        "format": weighted_pass(format_checks, REZI_AUDIT_WEIGHTS),
        "optimization": weighted_pass(optimization_checks, REZI_AUDIT_WEIGHTS),
        "best_practices": weighted_pass(best_checks, REZI_AUDIT_WEIGHTS),
    }
    details = pass_rate([s.has_email, s.has_phone, "experience" in s.sections, "education" in s.sections])
    # Application Ready: complete details, plus overall standing in the other four categories.
    four = ("content", "format", "optimization", "best_practices")
    standing = sum(cats[k] * w[k] for k in four) / sum(w[k] for k in four)
    cats["application_readiness"] = 0.5 * details + 0.5 * standing
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
            "Each category is the weighted share of its audits passed (impact/targeting audits weigh more): " + ", ".join(f"{k} {int(v)}" for k, v in cats.items()) + ".",
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
            f"Point allocation (Aavedak estimate — SkillSyncer documents the categories and frequency weighting, not the points): hard {p['hard']} · soft {p['soft']} · other {p['other']} · title {p['title']} · degree {p['degree']}.",
            "Empty JD keyword category → full category points; frequent JD terms count more.",
        ],
        resume_text=resume_text,
        blurb="SkillSyncer-style documented 100-point weighted match (reference).",
    )


# ─── Enhancv (reference — public checker UI, not a published formula) ──────────

_ENHANCV_MISSPELLINGS = {
    "teh": "the", "recieve": "receive", "seperate": "separate", "definately": "definitely",
    "occured": "occurred", "managment": "management", "enviroment": "environment",
    "developement": "development", "successfull": "successful", "acheivement": "achievement",
    "experiance": "experience", "publically": "publicly", "untill": "until", "becuase": "because",
    "thier": "their", "comitted": "committed", "personel": "personnel", "maintainance": "maintenance",
    "priviledge": "privilege", "calender": "calendar", "wich": "which", "grammer": "grammar",
    "independant": "independent", "liasion": "liaison", "acheive": "achieve", "buisness": "business",
    "collegue": "colleague", "excellant": "excellent", "knowlege": "knowledge",
    "neccessary": "necessary", "oppurtunity": "opportunity", "recomend": "recommend",
    "refered": "referred", "relevent": "relevant", "responsibilties": "responsibilities",
    "sucessful": "successful", "techincal": "technical",
}
_ENHANCV_REPEAT_WORD_RE = re.compile(r"\b([A-Za-z]{3,})\s+\1\b", re.I)
_ENHANCV_MISSING_SPACE_RE = re.compile(r"[a-z]\.[A-Z][a-z]")


def _enhancv_issue_label(n: int) -> str:
    if n == 0:
        return "No issues"
    return f"{n} issue" if n == 1 else f"{n} issues"


def run_enhancv_style(
    resume_id: str, resume_text: str, role: str, jd_text: str, mode: str | None = None
) -> dict[str, Any]:
    """Enhancv-style reference: approximates the four "Content" checks Enhancv's free resume
    checker shows as issue counts (ATS Parse Rate, Quantifying Impact, Repetition, Spelling &
    Grammar). Enhancv does not publish its scoring formula or weights — this is an Aavedak
    approximation of the public checker UI, not Enhancv's proprietary scoring."""
    s = extract_reference_signals(resume_text, jd_text, role)
    q = extract_quality_signals(resume_text)
    resolved = "job_match" if (mode == "job_match" or (not mode and jd_text.strip())) else "resume_only"
    w = ENHANCV_WEIGHTS

    findings: list[dict[str, Any]] = []
    fid = iter(range(1, 1000))

    def flag(category: str, severity: str, title: str, detail: str, recommendation: str = "") -> None:
        findings.append(
            {
                "id": f"{category}.{next(fid)}",
                "severity": severity,
                "category": category,
                "title": title,
                "detail": detail,
                **({"recommendation": recommendation} if recommendation else {}),
            }
        )

    # ATS Parse Rate
    parse_issues = 0
    if not s.has_email:
        parse_issues += 1
        flag("parse_rate", "critical", "No email address found",
             "Recruiters and ATS auto-responders can't reach you.",
             "Add an email address near the top of the resume.")
    if not s.has_phone:
        parse_issues += 1
        flag("parse_rate", "high", "No phone number found",
             "A phone number is expected contact information.",
             "Add a phone number near the top of the resume.")
    if re.search(r"\|.*\|.*\|", resume_text):
        parse_issues += 1
        flag("parse_rate", "medium", "Possible table structure",
             "Pipe-separated content suggests a table, which some ATS parsers misread.",
             "Convert tables to plain bullet points.")
    icons = re.findall(r"[☀-➿\U0001F300-\U0001FAFF]", resume_text)
    if len(icons) > 3:
        parse_issues += 1
        flag("parse_rate", "low", "Icons or emoji detected", f"{len(icons)} icon-like characters found.",
             "Replace icons with plain-text labels.")
    parse_score = clamp(100 - parse_issues * 20)

    # Quantifying Impact — accomplishment-length bullets with no number in them
    meaningful_bullets = [b for b in q.bullets if len(b.split()) >= 6]
    unquantified = [b for b in meaningful_bullets if not re.search(r"\d", b)]
    quant_issue_count = len(unquantified)
    for b in unquantified[:5]:
        flag("quantifying_impact", "medium", "Bullet lacks a measurable result",
             f"“{b[:90]}{'…' if len(b) > 90 else ''}” has no number.",
             "Add a truthful metric (%, time, count, revenue) if one genuinely applies.")
    quant_score = clamp(100 - min(60, quant_issue_count * 15))

    # Repetition — a repeated word (excluding likely proper nouns) or several bullets opening
    # with the same word
    cased_words = re.findall(r"[A-Za-z0-9+.#/]+", resume_text)
    freq = Counter(w.lower() for w in cased_words if len(w) > 4)
    repeated_words: list[tuple[str, int]] = []
    for word, count in freq.most_common(10):
        if count < 5:
            break
        occurrences = [t for t in cased_words if t.lower() == word]
        if occurrences and sum(1 for t in occurrences if t[:1].isupper()) / len(occurrences) > 0.6:
            continue  # likely a company / college / product name — repeating it is normal
        repeated_words.append((word, count))
        if len(repeated_words) == 5:
            break
    starts = Counter(b.split()[0].lower() for b in q.bullets if b.split())
    repeat_starts = [(w, c) for w, c in starts.most_common(5) if c >= 3]
    repetition_issue_count = len(repeated_words) + len(repeat_starts)
    for word, count in repeated_words:
        flag("repetition", "low", f"“{word}” is repeated {count}×",
             "Repeating the same word reduces impact and readability.",
             "Vary the vocabulary where natural.")
    for word, count in repeat_starts:
        flag("repetition", "medium", f"{count} bullets start with “{word.title()}”",
             "Starting several bullets with the same word makes the resume monotonous.",
             "Lead with a different action verb for each bullet.")
    repetition_score = clamp(100 - repetition_issue_count * 15)

    # Spelling & Grammar — a small common-typo list plus basic punctuation/doubling checks;
    # not a real spell-checker, so it will miss most genuine misspellings.
    lower_text = resume_text.lower()
    misspellings_found = [
        (w, fix) for w, fix in _ENHANCV_MISSPELLINGS.items() if re.search(rf"\b{w}\b", lower_text)
    ]
    repeat_word_hits = _ENHANCV_REPEAT_WORD_RE.findall(resume_text)
    missing_space_hits = _ENHANCV_MISSING_SPACE_RE.findall(resume_text)
    double_space = "  " in resume_text
    spelling_issue_count = (
        len(misspellings_found) + len(repeat_word_hits) + len(missing_space_hits) + (1 if double_space else 0)
    )
    for word, fix in misspellings_found[:5]:
        flag("spelling_grammar", "medium", f"Possible misspelling: “{word}”", f"Did you mean “{fix}”?",
             f"Replace “{word}” with “{fix}”.")
    if repeat_word_hits:
        flag("spelling_grammar", "low", "Accidentally doubled word",
             f"Found {len(repeat_word_hits)} instance(s) like “{repeat_word_hits[0]} {repeat_word_hits[0]}”.",
             "Remove the duplicate word.")
    if missing_space_hits:
        flag("spelling_grammar", "low", "Missing space after a period",
             f"{len(missing_space_hits)} place(s) where one sentence runs into the next without a space.",
             "Add a space after the period.")
    if double_space:
        flag("spelling_grammar", "info", "Double spaces found", "Extra spaces between words or sentences.",
             "Use a single space throughout.")
    spelling_score = clamp(100 - min(70, spelling_issue_count * 12))

    # Bullet length and consistency (listed under Content on enhancv.com/resources/resume-checker)
    lens = [len(b.split()) for b in q.bullets]
    off_len = [b for b, n in zip(q.bullets, lens) if n < 6 or n > 35]
    bullet_score = clamp(100 - min(60, len(off_len) * 12))
    for b in off_len[:3]:
        flag("bullet_length", "low", "Bullet length is off",
             f"“{b[:80]}{'…' if len(b) > 80 else ''}” is {len(b.split())} words (aim for 6–35).",
             "Keep bullets to one or two lines with a consistent length.")

    content = clamp(
        parse_score * w["parse_rate"]
        + quant_score * w["quantifying_impact"]
        + repetition_score * w["repetition"]
        + spelling_score * w["spelling_grammar"]
        + bullet_score * w["bullet_length"]
    )
    # Job tailoring (documented: hard skills, soft skills, action verbs, tailored job title).
    target = None
    if resolved == "job_match" and (s.hard_skills_jd or s.soft_skills_jd):
        tail = [coverage(s.hard_skills_resume, s.hard_skills_jd) if s.hard_skills_jd else None,
                coverage(s.soft_skills_resume, s.soft_skills_jd) if s.soft_skills_jd else None,
                min(1.0, s.action_bullets / max(1, len(q.bullets)) / 0.5),
                (1.0 if s.title_exact else s.title_hit) if role.strip() else None]
        tail_w = [0.55, 0.15, 0.15, 0.15]
        used = [(v, wt) for v, wt in zip(tail, tail_w) if v is not None]
        target = sum(v * wt for v, wt in used) / sum(wt for _, wt in used)
    overall = clamp(content * 0.7 + target * 100 * 0.3) if target is not None else content
    matched, missing = (
        _skill_hits(s.hard_skills_resume, s.hard_skills_jd) if target is not None else ([], [])
    )

    strengths = [
        *(["No ATS parse-rate issues found"] if parse_issues == 0 else []),
        *(["Most bullets carry a measurable result"] if quant_issue_count == 0 and meaningful_bullets else []),
        *(["No repeated wording detected"] if repetition_issue_count == 0 else []),
        *(["No spelling issues detected"] if spelling_issue_count == 0 else []),
    ]
    breakdown = [
        {"key": "parse_rate", "label": "ATS Parse Rate", "score": parse_score,
         "weight": w["parse_rate"], "contribution": round(parse_score * w["parse_rate"], 1)},
        {"key": "quantifying_impact", "label": "Quantifying Impact", "score": quant_score,
         "weight": w["quantifying_impact"], "contribution": round(quant_score * w["quantifying_impact"], 1)},
        {"key": "repetition", "label": "Repetition", "score": repetition_score,
         "weight": w["repetition"], "contribution": round(repetition_score * w["repetition"], 1)},
        {"key": "spelling_grammar", "label": "Spelling & Grammar", "score": spelling_score,
         "weight": w["spelling_grammar"], "contribution": round(spelling_score * w["spelling_grammar"], 1)},
        {"key": "bullet_length", "label": "Bullet length & consistency", "score": bullet_score,
         "weight": w["bullet_length"], "contribution": round(bullet_score * w["bullet_length"], 1)},
    ]
    metrics = [
        {"key": "parse_rate", "label": "ATS Parse Rate", "value": _enhancv_issue_label(parse_issues)},
        {"key": "quantifying_impact", "label": "Quantifying Impact", "value": _enhancv_issue_label(quant_issue_count)},
        {"key": "repetition", "label": "Repetition", "value": _enhancv_issue_label(repetition_issue_count)},
        {"key": "spelling_grammar", "label": "Spelling & Grammar", "value": _enhancv_issue_label(spelling_issue_count)},
    ]
    notes = [
        f"Content = Parse Rate×{w['parse_rate']} + Quantifying Impact×{w['quantifying_impact']} "
        f"+ Repetition×{w['repetition']} + Spelling & Grammar×{w['spelling_grammar']} "
        f"+ Bullet length×{w['bullet_length']}. With a JD: 70% content + 30% job tailoring "
        "(hard skills .55, soft .15, action verbs .15, title .15).",
        "Enhancv does not publish its checker's weights or full rule set; these are the four "
        "content checks it surfaces publicly, approximated by Aavedak.",
        "Spelling is checked against a short list of common English typos plus basic punctuation "
        "checks, not a full dictionary — it will miss most real misspellings.",
    ]
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    findings.sort(key=lambda f: sev_order.get(f["severity"], 5))

    return {
        "resumeId": resume_id,
        "mode": resolved,
        "engineId": "enhancv_style",
        "engineName": "Enhancv",
        "scoreType": "job_match" if target is not None else "resume_quality",
        "scoreScale": {"min": 0, "max": 100},
        "scoreName": "Targeted Content Score" if target is not None else "Content Score",
        "overallScore": overall,
        "atsScore": overall,
        "scoreLabel": _label(overall, resolved),
        "scores": {
            "resumeQuality": content,
            "atsCompatibility": parse_score,
            "evidenceQuality": quant_score,
            "experienceQuality": repetition_score,
            "structureFormatting": spelling_score,
            "requiredSkills": clamp(target * 100) if target is not None else None,
        },
        "breakdown": breakdown,
        "findings": findings,
        "metrics": metrics,
        "skillCategories": [],
        "limitations": [
            "Reference approximation of Enhancv's public resume checker — not Enhancv's proprietary scoring.",
            "Spelling & Grammar is a heuristic (common-typo list + basic punctuation checks), not a real spell-checker.",
        ],
        "warnings": [],
        "methodology": {
            "id": "enhancv-reference",
            "version": PROFILE_VERSION,
            "formula": notes[0],
            "reference": "Enhancv resume checker (public Content checks only) — Aavedak approximation",
        },
        "matchedSkills": matched,
        "partialSkills": [],
        "missingSkills": missing,
        "matchedResponsibilities": [],
        "partialResponsibilities": [],
        "missingResponsibilities": [],
        "strengths": strengths[:8],
        "improvements": [],
        "atsIssues": [],
        "confidence": "high" if len(resume_text) > 900 else "medium" if len(resume_text) > 400 else "low",
        "notes": notes,
        "engine": "fastapi",
        "engineVersion": f"enhancv-reference@{PROFILE_VERSION}",
        "textChars": len(resume_text.strip()),
        "textFingerprint": _fingerprint(resume_text),
        "blurb": "Enhancv-style reference: ATS Parse Rate, Quantifying Impact, Repetition, and "
        "Spelling & Grammar checks under Content.",
    }
