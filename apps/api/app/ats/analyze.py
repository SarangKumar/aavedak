"""Transparent ATS Match & Resume Quality scoring engine."""

from __future__ import annotations

from typing import Any

from app.ats.evidence import evidence_strength, responsibility_match, title_similarity
from app.ats.jd_profile import parse_jd
from app.ats.resume_profile import parse_resume, bullet_has_action, bullet_has_metric
from app.ats.skill_taxonomy import display_name, infer_role_key


def _clamp(n: float) -> int:
    return max(0, min(100, int(round(n))))


def _label(score: int, mode: str) -> str:
    if score >= 90:
        base = "Excellent"
    elif score >= 80:
        base = "Strong"
    elif score >= 70:
        base = "Good"
    elif score >= 60:
        base = "Moderate"
    else:
        base = "Weak"
    if mode == "resume_only":
        return f"{base} resume quality"
    if mode == "role_match":
        return f"{base} role match"
    return f"{base} job match"


def _score_name(mode: str) -> str:
    if mode == "resume_only":
        return "Resume Quality Score"
    if mode == "role_match":
        return "Role Match Score"
    return "ATS Match Score"


def detect_mode(role: str, jd: str) -> str:
    has_role = bool((role or "").strip())
    has_jd = bool((jd or "").strip())
    if not has_role and not has_jd:
        return "resume_only"
    if has_jd and has_role:
        return "job_match"
    if has_jd and not has_role:
        return "job_match"  # title inferred
    return "role_match"


def score_ats_compatibility(profile) -> tuple[int, list[str], list[str]]:
    score = 0.0
    signals: list[str] = []
    issues: list[str] = []

    if len(profile.raw.strip()) >= 400:
        score += 18
        signals.append("Enough extractable text for parsers")
    else:
        issues.append("Little readable text — PDF may be image-only or sparsely extracted")

    if profile.email:
        score += 12
        signals.append("Email found in plain text")
    else:
        issues.append("Add a plain-text email address")

    if profile.phone:
        score += 8
        signals.append("Phone number found")
    else:
        issues.append("Include a phone number in plain text")

    if profile.linkedin:
        score += 6
        signals.append("LinkedIn present")
    if profile.github:
        score += 6
        signals.append("GitHub present")

    section_pts = min(28, len(profile.sections) * 7)
    score += section_pts
    if profile.sections:
        signals.append(f"Sections detected: {', '.join(profile.sections)}")
    else:
        issues.append("Use clear headings (Experience, Education, Skills)")

    if profile.date_ranges >= 1:
        score += 8
        signals.append("Date ranges found on experience")
    else:
        issues.append("Include employment date ranges parsers can read")

    if profile.titles:
        score += 8
        signals.append("Job titles detected")
    else:
        issues.append("Make prior job titles explicit")

    if len(profile.skill_mentions) >= 6:
        score += 8
    elif len(profile.skill_mentions) >= 3:
        score += 4
    else:
        issues.append("Spell out tools and skills as plain text")

    if profile.stuffing_score >= 0.4:
        score -= 12
        issues.append("Keyword repetition detected — reduce stuffing")

    return _clamp(score), signals[:8], issues[:8]


def score_resume_quality(profile) -> tuple[int, list[str], list[dict[str, str]]]:
    score = 35.0
    strengths: list[str] = []
    improvements: list[dict[str, str]] = []

    action_bullets = [b for b in profile.bullets if bullet_has_action(b)]
    metric_bullets = [b for b in profile.bullets if bullet_has_metric(b)]

    if action_bullets:
        score += min(20, len(action_bullets) * 3)
        strengths.append(f"{len(action_bullets)} bullets start with clear actions")
    else:
        improvements.append(
            {
                "priority": "high",
                "text": "Rewrite bullets to start with strong action verbs.",
                "reason": "Few action-led bullets were detected.",
            }
        )

    if metric_bullets:
        score += min(20, len(metric_bullets) * 5)
        strengths.append(f"{len(metric_bullets)} bullets include measurable impact")
    else:
        improvements.append(
            {
                "priority": "high",
                "text": "Add measurable results to 2–3 experience bullets (latency, users, revenue, time saved).",
                "reason": "Impact metrics improve resume quality signals.",
            }
        )

    # Brevity: penalize very long bullets
    long_bullets = [b for b in profile.bullets if len(b) > 220]
    if long_bullets:
        score -= min(10, len(long_bullets) * 2)
        improvements.append(
            {
                "priority": "medium",
                "text": "Shorten oversized bullets for clarity.",
                "reason": f"{len(long_bullets)} bullets are very long.",
            }
        )
    else:
        score += 8

    if len(profile.sections) >= 3:
        score += 10
        strengths.append("Clear section organization")
    else:
        improvements.append(
            {
                "priority": "medium",
                "text": "Organize into Experience, Education, and Skills sections.",
                "reason": "Parsers and recruiters scan structured sections faster.",
            }
        )

    if profile.stuffing_score >= 0.35:
        score -= 15
        improvements.append(
            {
                "priority": "high",
                "text": "Remove repeated keyword stuffing; show skills in real experience context.",
                "reason": "Keyword repetition detected.",
            }
        )
    else:
        score += 5

    tech_in_exp = sum(
        1 for m in profile.skill_mentions.values() if m.section in ("experience", "projects")
    )
    if tech_in_exp >= 3:
        score += 10
        strengths.append("Technical skills appear in experience context")

    return _clamp(score), strengths[:6], improvements[:8]


def _weighted_mean(parts: list[tuple[str, float, float]]) -> tuple[int, dict[str, float]]:
    """parts: (name, weight, score0-100). Redistributes if needed — caller only passes applicable."""
    total_w = sum(w for _, w, _ in parts if w > 0)
    if total_w <= 0:
        return 0, {}
    used: dict[str, float] = {}
    acc = 0.0
    for name, w, s in parts:
        if w <= 0:
            continue
        nw = w / total_w
        used[name] = round(nw, 4)
        acc += nw * s
    return _clamp(acc), used


def _skill_dimension(
    profile, requirements: list, *, core_weight_boost: bool = False
) -> tuple[int, list[dict], list[dict], list[dict]]:
    matched: list[dict] = []
    partial: list[dict] = []
    missing: list[dict] = []
    if not requirements:
        return 0, matched, partial, missing

    scores: list[float] = []
    for req in requirements:
        if not req.canonical:
            # text-only soft match
            status, strength, ev = responsibility_match(profile, req.text)
            entry = {
                "skill": req.text,
                "status": status,
                "strength": round(strength, 2),
                "evidence": ev,
            }
            if status == "matched":
                matched.append(entry)
            elif status == "partial":
                partial.append(entry)
            else:
                missing.append(entry)
            scores.append(strength)
            continue

        strength, label, ev = evidence_strength(profile, req.canonical)
        entry = {
            "skill": req.text or display_name(req.canonical),
            "canonical": req.canonical,
            "status": "matched"
            if strength >= 0.85
            else "partial"
            if strength >= 0.3
            else "missing",
            "matchType": label,
            "strength": round(strength, 2),
            "evidence": ev,
        }
        if entry["status"] == "matched":
            matched.append(entry)
        elif entry["status"] == "partial":
            partial.append(entry)
        else:
            missing.append(entry)
        scores.append(strength)

    avg = (sum(scores) / len(scores)) * 100 if scores else 0
    if core_weight_boost and scores:
        # Slightly emphasize first half (usually core)
        half = max(1, len(scores) // 2)
        core_avg = sum(scores[:half]) / half
        rest_avg = sum(scores[half:]) / max(1, len(scores) - half) if len(scores) > half else core_avg
        avg = (core_avg * 0.7 + rest_avg * 0.3) * 100
    return _clamp(avg), matched, partial, missing


def analyze_resume(
    resume_text: str,
    *,
    jd_text: str = "",
    role: str = "",
    resume_id: str = "",
) -> dict[str, Any]:
    mode = detect_mode(role, jd_text)
    profile = parse_resume(resume_text)
    jd = parse_jd(jd_text, role)
    effective_title = (role or "").strip() or jd.inferred_title

    notes: list[str] = []
    if jd.too_short and (jd_text or "").strip():
        notes.append(
            "Not enough job-description information for a reliable job match. "
            "Weights lean more on role/resume signals."
        )
        if mode == "job_match" and not (role or "").strip():
            pass

    if not (resume_text or "").strip():
        return {
            "resumeId": resume_id,
            "mode": mode,
            "scoreName": _score_name(mode),
            "overallScore": 0,
            "scoreLabel": "Could not analyze",
            "error": "Could not reliably parse this resume.",
            "scores": {},
            "matchedSkills": [],
            "partialSkills": [],
            "missingSkills": [],
            "matchedResponsibilities": [],
            "partialResponsibilities": [],
            "missingResponsibilities": [],
            "strengths": [],
            "improvements": [],
            "atsIssues": ["Empty or unreadable resume text"],
            "confidence": "low",
            "notes": notes,
            "weighting": {},
            "engine": "fastapi",
        }

    ats_score, ats_signals, ats_issues = score_ats_compatibility(profile)
    quality_score, quality_strengths, quality_improvements = score_resume_quality(profile)

    # Technical skills density (resume-only dimension)
    tech_score = _clamp(min(100, len(profile.skill_mentions) * 8 + sum(
        10 for m in profile.skill_mentions.values() if m.section in ("experience", "projects")
    )))

    exp_quality = _clamp(
        40
        + min(25, len(profile.bullets) * 2)
        + min(20, sum(1 for b in profile.bullets if bullet_has_metric(b)) * 5)
        + (10 if profile.titles else 0)
    )

    scores: dict[str, int | None] = {
        "atsCompatibility": ats_score,
        "requiredSkills": None,
        "preferredSkills": None,
        "experienceMatch": None,
        "responsibilityMatch": None,
        "keywordCoverage": None,
        "evidenceQuality": None,
        "jobTitleMatch": None,
        "resumeQuality": quality_score,
        "technicalSkills": tech_score,
        "experienceQuality": exp_quality,
        "structureFormatting": ats_score,  # closely tied to parse structure
    }

    matched_skills: list[dict] = []
    partial_skills: list[dict] = []
    missing_skills: list[dict] = []
    matched_resp: list[dict] = []
    partial_resp: list[dict] = []
    missing_resp: list[dict] = []
    strengths = list(quality_strengths)
    improvements = list(quality_improvements)
    strengths.extend(ats_signals[:3])

    if mode == "resume_only":
        parts = [
            ("atsCompatibility", 0.25, float(ats_score)),
            ("resumeQuality", 0.25, float(quality_score)),
            ("technicalSkills", 0.20, float(tech_score)),
            ("experienceQuality", 0.20, float(exp_quality)),
            ("evidenceQuality", 0.10, float(quality_score)),
        ]
        overall, weighting = _weighted_mean(parts)
        scores["evidenceQuality"] = quality_score
        confidence = "high" if len(profile.raw) > 600 else "medium"
        return _pack(
            resume_id,
            mode,
            overall,
            scores,
            matched_skills,
            partial_skills,
            missing_skills,
            matched_resp,
            partial_resp,
            missing_resp,
            strengths,
            improvements,
            ats_issues,
            confidence,
            notes,
            weighting,
            effective_title,
        )

    # Role / Job match dimensions
    req_score, m1, p1, miss1 = _skill_dimension(
        profile, jd.required, core_weight_boost=(mode == "role_match")
    )
    pref_score, m2, p2, miss2 = _skill_dimension(profile, jd.preferred)
    matched_skills = m1 + m2
    partial_skills = p1 + p2
    missing_skills = miss1 + miss2

    # Responsibilities
    resp_scores: list[float] = []
    for resp in jd.responsibilities:
        status, strength, ev = responsibility_match(profile, resp.text)
        entry = {"text": resp.text, "status": status, "strength": round(strength, 2), "evidence": ev}
        if status == "matched":
            matched_resp.append(entry)
        elif status == "partial":
            partial_resp.append(entry)
        else:
            missing_resp.append(entry)
        resp_scores.append(strength)
    resp_score = _clamp((sum(resp_scores) / len(resp_scores)) * 100) if resp_scores else None

    # Experience match (years + title relevance + tech in experience)
    exp = 50.0
    if jd.years_min is not None and profile.years_mentioned:
        have = max(profile.years_mentioned)
        if have >= jd.years_min:
            exp += 25
        elif have >= jd.years_min - 1:
            exp += 12
        else:
            exp -= 15
            improvements.append(
                {
                    "priority": "medium",
                    "text": f"JD suggests ~{jd.years_min}+ years; emphasize the most relevant tenure you do have.",
                    "reason": "Experience-years gap relative to the posting.",
                }
            )
    elif profile.years_mentioned or profile.date_ranges:
        exp += 15

    title_hits = 0
    for t in profile.titles:
        if title_similarity(t, effective_title) >= 0.45:
            title_hits += 1
    exp += min(20, title_hits * 10)
    exp += min(15, sum(1 for m in profile.skill_mentions.values() if m.section == "experience") * 2)
    experience_match = _clamp(exp)

    # Keyword coverage = required + preferred + other blended
    other_score, _, _, _ = _skill_dimension(profile, jd.other_keywords[:12])
    keyword_bits = [s for s in (req_score, pref_score, other_score) if s is not None]
    keyword_coverage = _clamp(sum(keyword_bits) / len(keyword_bits)) if keyword_bits else None

    # Evidence quality across matched required skills
    evidence_vals = [
        e["strength"]
        for e in matched_skills + partial_skills
        if isinstance(e.get("strength"), (int, float))
    ]
    evidence_quality = _clamp((sum(evidence_vals) / len(evidence_vals)) * 100) if evidence_vals else _clamp(
        quality_score * 0.7
    )
    if profile.stuffing_score >= 0.35:
        evidence_quality = _clamp(evidence_quality - 18)

    # Job title match
    resume_title_best = 0.0
    for t in profile.titles or [""]:
        resume_title_best = max(resume_title_best, title_similarity(t, effective_title))
    # also compare against whole resume text soft
    if effective_title and infer_role_key(effective_title):
        resume_title_best = max(
            resume_title_best, title_similarity(effective_title, " ".join(profile.titles))
        )
    job_title_match = _clamp(resume_title_best * 100)

    scores.update(
        {
            "requiredSkills": req_score if jd.required else None,
            "preferredSkills": pref_score if jd.preferred else None,
            "experienceMatch": experience_match,
            "responsibilityMatch": resp_score,
            "keywordCoverage": keyword_coverage,
            "evidenceQuality": evidence_quality,
            "jobTitleMatch": job_title_match if effective_title else None,
        }
    )

    # Build weights per mode — redistribute missing categories
    if mode == "role_match":
        parts = [
            ("atsCompatibility", 0.10, float(ats_score)),
            ("requiredSkills", 0.30 if jd.required else 0.0, float(req_score)),
            ("experienceMatch", 0.20, float(experience_match)),
            ("responsibilityMatch", 0.10 if resp_score is not None else 0.0, float(resp_score or 0)),
            ("keywordCoverage", 0.10 if keyword_coverage is not None else 0.0, float(keyword_coverage or 0)),
            ("evidenceQuality", 0.10, float(evidence_quality)),
            ("jobTitleMatch", 0.10 if effective_title else 0.0, float(job_title_match)),
        ]
    else:
        # job_match suggested weights
        edu_w = 0.05 if jd.education_required else 0.0
        edu_score = 80.0 if ("education" in profile.sections) else 40.0
        parts = [
            ("requiredSkills", 0.30 if jd.required else 0.0, float(req_score)),
            ("experienceMatch", 0.15, float(experience_match)),
            ("responsibilityMatch", 0.15 if resp_score is not None else 0.0, float(resp_score or 0)),
            ("preferredSkills", 0.10 if jd.preferred else 0.0, float(pref_score)),
            ("keywordCoverage", 0.10 if keyword_coverage is not None else 0.0, float(keyword_coverage or 0)),
            ("evidenceQuality", 0.10, float(evidence_quality)),
            ("jobTitleMatch", 0.05 if effective_title else 0.0, float(job_title_match)),
            ("education", edu_w, edu_score),
            ("atsCompatibility", 0.05, float(ats_score)),
        ]
        if jd.too_short:
            # lean more on role/resume
            parts = [
                ("requiredSkills", 0.25 if jd.required else 0.0, float(req_score)),
                ("experienceMatch", 0.20, float(experience_match)),
                ("evidenceQuality", 0.15, float(evidence_quality)),
                ("jobTitleMatch", 0.15 if effective_title else 0.0, float(job_title_match)),
                ("atsCompatibility", 0.15, float(ats_score)),
                ("resumeQuality", 0.10, float(quality_score)),
            ]

    overall, weighting = _weighted_mean(parts)

    # Strengths / improvements from skills
    for item in matched_skills[:4]:
        strengths.append(f"Strong {item['skill']} evidence")
    required_missing = {m.get("skill") for m in miss1}
    for item in missing_skills[:5]:
        improvements.append(
            {
                "priority": "high" if item.get("skill") in required_missing else "medium",
                "text": f"If you have experience with {item['skill']}, make it explicit in an experience bullet — do not invent it.",
                "reason": f"{item['skill']} appears as a requirement but was not evidenced.",
            }
        )
    for item in partial_skills[:3]:
        improvements.append(
            {
                "priority": "high",
                "text": f"Make {item['skill']} experience more explicit (tool name + action + outcome).",
                "reason": "Only partial/indirect evidence found.",
            }
        )

    # Deduplicate improvements by text
    seen_imp: set[str] = set()
    uniq_imp: list[dict[str, str]] = []
    for imp in improvements:
        if imp["text"] in seen_imp:
            continue
        seen_imp.add(imp["text"])
        uniq_imp.append(imp)

    confidence = "high"
    if jd.too_short or len(profile.raw) < 400:
        confidence = "medium"
    if not profile.skill_mentions:
        confidence = "low"

    return _pack(
        resume_id,
        mode,
        overall,
        scores,
        matched_skills,
        partial_skills,
        missing_skills,
        matched_resp,
        partial_resp,
        missing_resp,
        list(dict.fromkeys(strengths))[:8],
        uniq_imp[:10],
        ats_issues,
        confidence,
        notes,
        weighting,
        effective_title,
    )


def _pack(
    resume_id,
    mode,
    overall,
    scores,
    matched_skills,
    partial_skills,
    missing_skills,
    matched_resp,
    partial_resp,
    missing_resp,
    strengths,
    improvements,
    ats_issues,
    confidence,
    notes,
    weighting,
    effective_title,
):
    return {
        "resumeId": resume_id,
        "mode": mode,
        "scoreName": _score_name(mode),
        "overallScore": overall,
        "scoreLabel": _label(overall, mode),
        "targetTitle": effective_title,
        "scores": scores,
        "matchedSkills": matched_skills[:20],
        "partialSkills": partial_skills[:20],
        "missingSkills": missing_skills[:20],
        "matchedResponsibilities": matched_resp[:12],
        "partialResponsibilities": partial_resp[:12],
        "missingResponsibilities": missing_resp[:12],
        "strengths": strengths,
        "improvements": improvements,
        "atsIssues": ats_issues,
        "confidence": confidence,
        "notes": notes,
        "weighting": weighting,
        "blurb": "Calculated from ATS compatibility, skills, experience, responsibilities, keywords, and evidence.",
        "engine": "fastapi",
        # Back-compat for older clients
        "atsScore": overall,
    }
