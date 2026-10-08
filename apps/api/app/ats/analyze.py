"""Transparent ATS Match & Resume Quality scoring engine."""

from __future__ import annotations

from typing import Any

from app.ats.evidence import (
    LEVEL_LABEL,
    evidence_strength,
    responsibility_match,
    title_similarity,
)
from app.ats.jd_profile import parse_jd
from app.ats.resume_profile import parse_resume, bullet_has_action, bullet_has_metric
from app.ats.skill_taxonomy import display_name, infer_role_key
from app.ats.version import ENGINE_VERSION


def _clamp(n: float) -> int:
    return max(0, min(100, int(round(n))))


def _soft_cap(n: float, soft_max: float = 92.0) -> int:
    """Prevent checklist resumes from all landing on 100."""
    if n <= soft_max:
        return _clamp(n)
    return _clamp(soft_max + (n - soft_max) * 0.25)


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


def _issue(code: str, title: str, detail: str) -> dict[str, str]:
    return {"code": code, "title": title, "detail": detail}


def score_ats_compatibility(profile) -> tuple[int, list[str], list[dict[str, str]]]:
    """Continuous ATS-parseability score — hard to max, varies with content density."""
    score = 6.0
    signals: list[str] = []
    issues: list[dict[str, str]] = []
    n = len(profile.raw.strip())

    # Length continuum (not a binary cliff at 400)
    score += min(16.0, n / 140.0)
    if n >= 400:
        signals.append("Enough extractable text for parsers")
    else:
        issues.append(
            _issue(
                "sparse_text",
                "Too little readable text extracted",
                f"Only about {n} characters came out of this file. Many ATS systems cannot read "
                "scanned/image-only PDFs, text locked in images, or heavily designed layouts. "
                "Export a text-based PDF (or DOCX → PDF) with selectable body text and avoid "
                "putting contact info or skills only inside graphics.",
            )
        )

    if profile.email:
        score += 9
        signals.append("Email found in plain text")
    else:
        issues.append(
            _issue(
                "missing_email",
                "No plain-text email address found",
                "Parsers look for a normal address like name@domain.com in the header. "
                "Emails drawn as icons, QR codes, or image text are often skipped. Put your "
                "email as selectable text near the top of the resume.",
            )
        )

    if profile.phone:
        score += 6
        signals.append("Phone number found")
    else:
        issues.append(
            _issue(
                "missing_phone",
                "No plain-text phone number found",
                "Include a phone number as normal digits (with optional country code), not as "
                "an icon or image. Recruiters and older ATS parsers still rely on this field "
                "when building a candidate profile.",
            )
        )

    if profile.linkedin:
        score += 4
        signals.append("LinkedIn present")
    elif profile.email:
        issues.append(
            _issue(
                "missing_linkedin",
                "LinkedIn URL not detected",
                "Add your LinkedIn profile as plain text (linkedin.com/in/…) in the header. "
                "Optional for parseability, but it helps recruiters and many ATS profiles "
                "attach a verifiable identity to the application.",
            )
        )
    if profile.github:
        score += 4
        signals.append("GitHub present")
    elif profile.email and any(
        s in profile.skill_mentions
        for s in ("react", "nodejs", "python", "typescript", "javascript", "go", "java")
    ):
        issues.append(
            _issue(
                "missing_github",
                "No GitHub (or portfolio) link detected",
                "For engineering roles, a plain-text GitHub, GitLab, or portfolio URL gives "
                "parsers and hiring managers a verifiable signal beyond a skills list.",
            )
        )

    section_pts = min(18.0, len(profile.sections) * 4.5)
    score += section_pts
    if profile.sections:
        signals.append(f"Sections detected: {', '.join(profile.sections)}")
        missing_core = [s for s in ("experience", "education", "skills") if s not in profile.sections]
        if missing_core:
            issues.append(
                _issue(
                    "incomplete_sections",
                    f"Missing clear section(s): {', '.join(missing_core)}",
                    "Detected headings: "
                    + (", ".join(profile.sections) if profile.sections else "none")
                    + ". Standard labeled sections (Experience, Education, Skills) help ATS "
                    "systems map content correctly. Use those words as line headings, not only "
                    "in a design sidebar or icon labels.",
                )
            )
    else:
        issues.append(
            _issue(
                "no_sections",
                "No standard section headings detected",
                "The extract has no clear Experience / Education / Skills (or equivalent) "
                "headings. Without them, parsers often dump the whole resume into one bag of "
                "words and miss employment history. Use plain text headings on their own lines.",
            )
        )

    score += min(8.0, profile.date_ranges * 3.5)
    if profile.date_ranges >= 1:
        signals.append("Date ranges found on experience")
    else:
        issues.append(
            _issue(
                "missing_dates",
                "No employment date ranges detected",
                "Write roles with readable ranges such as “Jan 2021 – Present” or "
                "“03/2019 – 06/2022”. Date chips inside images or “2021-23” crammed into "
                "tables are often missed, so tenure and recency signals stay empty.",
            )
        )

    score += min(7.0, len(profile.titles) * 3.5)
    if profile.titles:
        signals.append("Job titles detected")
    else:
        issues.append(
            _issue(
                "missing_titles",
                "No prior job titles detected",
                "Spell out titles like “Software Engineer” or “Backend Developer” next to "
                "each role. Creative labels, icons, or titles only inside graphics make it "
                "hard for ATS software to match your history to the target role.",
            )
        )

    skill_n = len(profile.skill_mentions)
    score += min(12.0, skill_n * 1.4)
    if skill_n < 3:
        issues.append(
            _issue(
                "few_skills",
                "Very few recognizable tools/skills in plain text",
                f"Only {skill_n} known skill(s) were found in the extract. Write tool names "
                "as normal words (e.g. React, PostgreSQL, Docker)—not logos, icon rows, or "
                "skill bars. ATS keyword matching needs the literal text.",
            )
        )

    # Bullet density helps parsers
    score += min(8.0, len(profile.bullets) * 0.7)
    if len(profile.bullets) < 3 and n >= 400:
        issues.append(
            _issue(
                "few_bullets",
                "Few distinct experience bullets detected",
                f"Only {len(profile.bullets)} substantial line(s) looked like bullets. Prefer "
                "short action-led lines (• Built… / - Designed…) instead of one dense paragraph "
                "per job so parsers and humans can scan impact.",
            )
        )

    if profile.stuffing_score >= 0.4:
        score -= 12
        issues.append(
            _issue(
                "keyword_stuffing",
                "Keyword repetition / stuffing detected",
                "The same tools appear many times with little experience context. That can "
                "look like gaming to both parsers and recruiters, and it weakens evidence "
                "quality. List each skill once in Skills, then prove it in Experience bullets "
                "with an action and outcome.",
            )
        )

    return _soft_cap(score, 88), signals[:8], issues[:10]


def score_resume_quality(profile) -> tuple[int, list[str], list[dict[str, str]]]:
    score = 18.0
    strengths: list[str] = []
    improvements: list[dict[str, str]] = []

    action_bullets = [b for b in profile.bullets if bullet_has_action(b)]
    metric_bullets = [b for b in profile.bullets if bullet_has_metric(b)]

    if action_bullets:
        score += min(22.0, len(action_bullets) * 3.2)
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
        score += min(22.0, len(metric_bullets) * 4.5)
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
        score += min(6.0, len(profile.bullets) * 0.4)

    score += min(12.0, len(profile.sections) * 3.0)
    if len(profile.sections) >= 3:
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

    tech_in_exp = sum(
        1 for m in profile.skill_mentions.values() if m.section in ("experience", "projects")
    )
    score += min(12.0, tech_in_exp * 2.5)
    if tech_in_exp >= 3:
        strengths.append("Technical skills appear in experience context")

    # Vocabulary richness — primary differentiator across resume variants
    import re

    uniq = len(set(re.findall(r"[a-z][a-z0-9+.#-]{2,}", profile.lower)))
    score += min(14.0, uniq / 18.0)

    if len(profile.raw) < 800:
        score -= 6

    return _soft_cap(score, 90), strengths[:6], improvements[:8]


_FRONTEND_MARKERS = (
    "frontend",
    "front-end",
    " ui ",
    "ux",
    "css",
    "component",
    "react",
    "next",
    "figma",
    "tailwind",
    "responsive",
)
_BACKEND_MARKERS = (
    "backend",
    "back-end",
    "api",
    "postgres",
    "database",
    "microservice",
    "queue",
    "server",
    "fastapi",
    "django",
)
_CLOUD_MARKERS = ("aws", "gcp", "azure", "kubernetes", "terraform", "devops", "infra")
_DATA_MARKERS = (
    "data engineer",
    "data platform",
    "pyspark",
    "spark",
    "airflow",
    "kafka",
    "snowflake",
    "bigquery",
    "dbt",
    "iceberg",
    "delta lake",
    "duckdb",
    "etl",
    "elt",
    "lakehouse",
    "data lake",
    "warehouse",
    "pipeline",
    "ingestion",
)


def _marker_ratio(lower: str, markers: tuple[str, ...]) -> float:
    hits = sum(1 for m in markers if m in lower)
    return hits / max(1, len(markers))


def _role_flavor(profile, role_key: str | None) -> float:
    """0–100 alignment of resume language to the target role flavor."""
    lower = f" {profile.lower} "
    fe = _marker_ratio(lower, _FRONTEND_MARKERS)
    be = _marker_ratio(lower, _BACKEND_MARKERS)
    cloud = _marker_ratio(lower, _CLOUD_MARKERS)
    data = _marker_ratio(lower, _DATA_MARKERS)
    if role_key == "frontend engineer" or role_key == "product designer":
        return 30 + fe * 55 + (1 - be) * 10
    if role_key == "data engineer":
        # Full-stack resumes often hit backend markers — require DE signal
        return 22 + data * 65 + be * 8 + (1 - fe) * 5
    if role_key == "backend engineer":
        return 30 + be * 55 + (1 - fe) * 10
    if role_key == "cloud engineer":
        return 30 + cloud * 55
    if role_key == "full stack":
        return 35 + ((fe + be) / 2) * 50
    return 38 + ((fe + be) / 2) * 40 + cloud * 8


_SKILL_CATEGORIES = (
    frozenset({"react", "nextjs", "typescript", "javascript", "css", "html", "redux", "vue", "angular"}),
    frozenset({"nodejs", "python", "java", "go", "fastapi", "django", "flask", "rest", "graphql", "express"}),
    frozenset({"postgresql", "mysql", "mongodb", "redis", "sql"}),
    frozenset({"aws", "gcp", "azure", "docker", "kubernetes", "terraform", "linux", "ci_cd"}),
    frozenset({"spark", "airflow", "kafka", "snowflake", "dbt", "bigquery", "etl", "iceberg", "databricks"}),
    frozenset({"machine_learning", "pytorch", "tensorflow"}),
)


def _skill_set_signal(profile) -> float:
    """0–100 from category breadth + experience depth (not a skill-id hash)."""
    ids = set(profile.skill_mentions.keys())
    if not ids:
        return 15.0
    in_exp = sum(
        1 for m in profile.skill_mentions.values() if m.section in ("experience", "projects")
    )
    categories = sum(1 for cat in _SKILL_CATEGORIES if ids & cat)
    breadth = min(40.0, categories * 8.0)
    depth = min(35.0, in_exp * 5.0)
    volume = min(25.0, len(ids) * 2.5)
    # Skills only in a Skills section (no experience evidence) cap the signal.
    if in_exp == 0 and ids:
        return float(min(55.0, breadth * 0.6 + volume * 0.5))
    return float(min(100.0, breadth + depth + volume))


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
) -> tuple[int, list[dict], list[dict], list[dict], float]:
    """
    Returns score, matched, partial, missing, critical_gap (0..1).
    critical_gap = weighted fraction of high-importance requirements with weak evidence.
    """
    matched: list[dict] = []
    partial: list[dict] = []
    missing: list[dict] = []
    if not requirements:
        return 0, matched, partial, missing, 0.0

    scores: list[float] = []
    weights: list[float] = []
    critical_gap_num = 0.0
    critical_gap_den = 0.0

    for idx, req in enumerate(requirements):
        importance = float(getattr(req, "importance", 1.0) or 1.0)
        if core_weight_boost:
            half = max(1, len(requirements) // 2)
            w = importance * (1.5 if idx < half else 1.0)
        else:
            w = importance

        if not req.canonical:
            status, strength, ev = responsibility_match(profile, req.text)
            entry = {
                "skill": req.text,
                "status": status,
                "strength": round(strength, 2),
                "evidence": ev,
                "evidenceLevel": 3 if strength >= 0.78 else 1 if strength >= 0.28 else 0,
                "importance": importance,
            }
            if status == "matched":
                matched.append(entry)
            elif status == "partial":
                partial.append(entry)
            else:
                missing.append(entry)
            scores.append(strength)
            weights.append(w)
            if importance >= 1.15:
                critical_gap_den += importance
                critical_gap_num += importance * max(0.0, 1.0 - strength)
            continue

        strength, label, ev, level = evidence_strength(profile, req.canonical)
        # Status: professional+ = matched; mention/project = partial; else missing
        if level >= 3 or strength >= 0.78:
            status = "matched"
        elif level >= 1 or strength >= 0.28:
            status = "partial"
        else:
            status = "missing"
        match_kind = (
            "related"
            if label == "related"
            else "indirect"
            if label == "indirect"
            else "direct"
            if level >= 1
            else "missing"
        )
        entry = {
            "skill": req.text or display_name(req.canonical),
            "canonical": req.canonical,
            "status": status,
            "matchType": label,
            "matchKind": match_kind,
            "strength": round(strength, 2),
            "evidence": ev,
            "evidenceLevel": level,
            "evidenceLabel": LEVEL_LABEL.get(level, "missing"),
            "importance": importance,
            "confidence": float(getattr(req, "confidence", 0.85) or 0.85),
        }
        if status == "matched":
            matched.append(entry)
        elif status == "partial":
            partial.append(entry)
        else:
            missing.append(entry)
        scores.append(strength)
        weights.append(w)
        if importance >= 1.15:
            critical_gap_den += importance
            critical_gap_num += importance * max(0.0, 1.0 - strength)

    weight_total = sum(weights) or 1.0
    avg = (sum(s * w for s, w in zip(scores, weights)) / weight_total) * 100
    missing_ratio = sum(1 for s in scores if s < 0.28) / len(scores)
    avg *= 1.0 - 0.25 * missing_ratio
    critical_gap = (critical_gap_num / critical_gap_den) if critical_gap_den else 0.0
    return _clamp(avg), matched, partial, missing, critical_gap


def _apply_critical_protection(overall: float, critical_gap: float) -> int:
    """
    Smooth ceiling when high-importance required skills lack evidence.
    critical_gap 0 → no change; 1 → ~42% reduction + soft max ~55.
    """
    if critical_gap <= 0.02:
        return _soft_cap(overall, 93)
    reduced = overall * (1.0 - 0.38 * critical_gap)
    soft_max = 93.0 - 38.0 * critical_gap
    return _soft_cap(reduced, soft_max)


def _jd_keyword_coverage(profile, jd_text: str, required_canonicals: set[str]) -> int | None:
    """Lexical JD↔resume coverage for content beyond already-scored required skills."""
    import re

    raw = (jd_text or "").strip()
    if not raw:
        return None
    stop = {
        "with",
        "from",
        "that",
        "this",
        "your",
        "will",
        "have",
        "experience",
        "years",
        "year",
        "team",
        "work",
        "role",
        "job",
        "ability",
        "strong",
        "using",
        "including",
        "across",
        "about",
        "within",
        "must",
        "should",
        "preferred",
        "required",
        "qualifications",
        "responsibilities",
    }
    jd_tokens = {
        t for t in re.findall(r"[a-z][a-z0-9+.#-]{3,}", raw.lower()) if t not in stop
    }
    # Drop tokens that are aliases of already-required skills (scored elsewhere).
    from app.ats.skill_taxonomy import ALIAS_TO_CANONICAL

    filtered: set[str] = set()
    for t in jd_tokens:
        can = ALIAS_TO_CANONICAL.get(t)
        if can and can in required_canonicals:
            continue
        filtered.add(t)
    if not filtered:
        return None
    resume_tokens = set(re.findall(r"[a-z][a-z0-9+.#-]{3,}", profile.lower))
    coverage = len(filtered & resume_tokens) / len(filtered)
    return _soft_cap(coverage * 100, 94)


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
            "atsIssues": [
                _issue(
                    "empty_resume",
                    "Empty or unreadable resume text",
                    "No extractable text was available for this file. Re-upload a text-based "
                    "PDF (selectable text), or paste the resume content if the PDF is scanned.",
                )
            ],
            "confidence": "low",
            "notes": notes,
            "weighting": {},
            "engine": "fastapi",
            "engineVersion": ENGINE_VERSION,
        }

    ats_score, ats_signals, ats_issues = score_ats_compatibility(profile)
    quality_score, quality_strengths, quality_improvements = score_resume_quality(profile)

    # Technical skills — count + experience context + which skills (set signal)
    in_exp_skills = sum(
        1 for m in profile.skill_mentions.values() if m.section in ("experience", "projects")
    )
    skill_signal = _skill_set_signal(profile)
    tech_score = _soft_cap(
        len(profile.skill_mentions) * 6 + in_exp_skills * 4 + skill_signal * 0.35,
        90,
    )

    exp_quality = _soft_cap(
        22
        + min(28, len(profile.bullets) * 2.2)
        + min(22, sum(1 for b in profile.bullets if bullet_has_metric(b)) * 5)
        + min(12, len(profile.titles) * 4)
        + min(10, in_exp_skills * 2),
        90,
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
        import re

        uniq = len(set(re.findall(r"[a-z][a-z0-9+.#-]{2,}", profile.lower)))
        uniqueness = min(100.0, uniq / 2.2)
        evidence = _soft_cap(
            quality_score * 0.5
            + (in_exp_skills / max(1, len(profile.skill_mentions))) * 45
            + (0 if profile.stuffing_score >= 0.35 else 8),
            90,
        )
        parts = [
            ("atsCompatibility", 0.18, float(ats_score)),
            ("resumeQuality", 0.26, float(quality_score)),
            ("technicalSkills", 0.16, float(tech_score)),
            ("experienceQuality", 0.22, float(exp_quality)),
            ("evidenceQuality", 0.12, float(evidence)),
            ("skillBreadth", 0.06, skill_signal),
        ]
        overall, weighting = _weighted_mean(parts)
        overall = _soft_cap(overall, 93)
        scores["evidenceQuality"] = evidence
        scores["atsCompatibility"] = ats_score
        scores["resumeQuality"] = quality_score
        fp = _fingerprint(profile.raw)
        notes.append(
            f"Extracted {len(profile.raw.strip())} chars · {uniq} unique tokens · "
            f"{len(profile.skill_mentions)} skills · fp {fp}"
        )
        confidence = "high" if len(profile.raw) > 900 else "medium"
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
            resume_text=profile.raw,
        )

    # Role / Job match dimensions
    req_score, m1, p1, miss1, critical_gap = _skill_dimension(
        profile, jd.required, core_weight_boost=(mode == "role_match")
    )
    pref_score, m2, p2, miss2, _pref_gap = _skill_dimension(profile, jd.preferred)
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

    # Experience match (years + title + role flavor + tech in experience)
    role_key = infer_role_key(effective_title) if effective_title else None
    flavor = _role_flavor(profile, role_key)
    exp = 28.0 + flavor * 0.35
    if jd.years_min is not None and profile.years_mentioned:
        have = max(profile.years_mentioned)
        if have >= jd.years_min:
            exp += 18
        elif have >= jd.years_min - 1:
            exp += 10
        else:
            exp -= 12
            improvements.append(
                {
                    "priority": "medium",
                    "text": f"JD suggests ~{jd.years_min}+ years; emphasize the most relevant tenure you do have.",
                    "reason": "Experience-years gap relative to the posting.",
                }
            )
    elif profile.years_mentioned or profile.date_ranges:
        exp += 10

    title_hits = 0
    for t in profile.titles:
        if title_similarity(t, effective_title) >= 0.45:
            title_hits += 1
    exp += min(16, title_hits * 8)
    exp += min(12, sum(1 for m in profile.skill_mentions.values() if m.section == "experience") * 2)
    experience_match = _soft_cap(exp, 92)

    # Lexical JD coverage (excluding required-skill tokens already scored above)
    required_canonicals = {r.canonical for r in jd.required if r.canonical}
    keyword_coverage = _jd_keyword_coverage(profile, jd_text, required_canonicals)
    if keyword_coverage is None and jd.other_keywords:
        other_score, _, _, _, _ = _skill_dimension(profile, jd.other_keywords[:12])
        keyword_coverage = other_score

    # Evidence quality: prefer experience-backed strengths over skills-list hits
    evidence_vals = [
        float(e["strength"])
        for e in matched_skills + partial_skills
        if isinstance(e.get("strength"), (int, float))
    ]
    if evidence_vals:
        ranked = sorted(evidence_vals, reverse=True)
        top = ranked[: max(1, len(ranked) // 2)]
        evidence_quality = _clamp((sum(top) / len(top)) * 65 + (sum(ranked) / len(ranked)) * 35)
    else:
        evidence_quality = _clamp(quality_score * 0.65)
    if profile.stuffing_score >= 0.35:
        evidence_quality = _clamp(evidence_quality - 18)
    if in_exp_skills == 0 and profile.skill_mentions:
        evidence_quality = _clamp(evidence_quality - 12)

    # Job title match — lexical + flavor so FE/BE/SDE titles diverge
    resume_title_best = 0.0
    for t in profile.titles or [""]:
        resume_title_best = max(resume_title_best, title_similarity(t, effective_title))
    if effective_title and role_key:
        resume_title_best = max(
            resume_title_best, title_similarity(effective_title, " ".join(profile.titles))
        )
    job_title_match = _soft_cap(resume_title_best * 70 + flavor * 0.28, 94)

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

    # v2 weights — parseability is barely in job match (suitability ≠ formatting).
    if mode == "role_match":
        parts = [
            ("requiredSkills", 0.32 if jd.required else 0.0, float(req_score)),
            ("experienceMatch", 0.20, float(experience_match)),
            ("evidenceQuality", 0.18, float(evidence_quality)),
            ("jobTitleMatch", 0.12 if effective_title else 0.0, float(job_title_match)),
            ("preferredSkills", 0.08 if jd.preferred else 0.0, float(pref_score)),
            ("responsibilityMatch", 0.06 if resp_score is not None else 0.0, float(resp_score or 0)),
            ("atsCompatibility", 0.04, float(ats_score)),
        ]
    else:
        # Suggested job_match blend (validated via benchmarks)
        parts = [
            ("requiredSkills", 0.30 if jd.required else 0.0, float(req_score)),
            ("responsibilityMatch", 0.20 if resp_score is not None else 0.0, float(resp_score or 0)),
            ("evidenceQuality", 0.20, float(evidence_quality)),
            ("experienceMatch", 0.15, float(experience_match)),
            ("jobTitleMatch", 0.10 if effective_title else 0.0, float(job_title_match)),
            ("preferredSkills", 0.05 if jd.preferred else 0.0, float(pref_score)),
        ]
        if jd.too_short:
            parts = [
                ("requiredSkills", 0.28 if jd.required else 0.0, float(req_score)),
                ("experienceMatch", 0.20, float(experience_match)),
                ("evidenceQuality", 0.20, float(evidence_quality)),
                ("jobTitleMatch", 0.16 if effective_title else 0.0, float(job_title_match)),
                ("resumeQuality", 0.10, float(quality_score)),
                ("atsCompatibility", 0.06, float(ats_score)),
            ]

    overall, weighting = _weighted_mean(parts)
    overall = _apply_critical_protection(float(overall), critical_gap)
    if critical_gap >= 0.35:
        notes.append(
            f"Critical required-skill gap ({critical_gap:.0%}) limited the overall score — "
            "preferred keywords cannot fully compensate for missing core requirements."
        )

    # Strengths / improvements from skills — grounded in evidence level
    for item in matched_skills[:4]:
        lvl = item.get("evidenceLabel") or "professional"
        strengths.append(f"{item['skill']} — {lvl.replace('_', ' ')} evidence")
    required_missing = {m.get("skill") for m in miss1}
    for item in missing_skills[:5]:
        improvements.append(
            {
                "priority": "high" if item.get("skill") in required_missing else "medium",
                "text": (
                    f"{item['skill']} appears in the posting but not on this resume. "
                    "Only add it if you have genuine experience — do not invent it."
                ),
                "reason": f"{item['skill']} is a requirement without resume evidence.",
            }
        )
    for item in partial_skills[:3]:
        if item.get("evidenceLevel", 0) <= 1:
            improvements.append(
                {
                    "priority": "high",
                    "text": (
                        f"{item['skill']} is listed but the resume has no supporting experience bullet. "
                        f"If you have professional {item['skill']} experience, make it explicit in one relevant bullet."
                    ),
                    "reason": "Skills-list / mention-only evidence (level 1).",
                }
            )
        else:
            improvements.append(
                {
                    "priority": "medium",
                    "text": f"Strengthen {item['skill']} with a clearer action + context in Experience or Projects.",
                    "reason": f"Partial evidence ({item.get('evidenceLabel', 'partial')}).",
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

    import re

    resume_tokens = set(re.findall(r"[a-z][a-z0-9+.#-]{3,}", profile.lower))
    fp = _fingerprint(profile.raw)
    notes.append(
        f"engine {ENGINE_VERSION} · {len(profile.raw.strip())} chars · "
        f"{len(resume_tokens)} tokens · {len(profile.skill_mentions)} skills · fp {fp}"
    )

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
        resume_text=profile.raw,
    )


def _fingerprint(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return "empty"
    h = 2166136261
    for ch in t:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"{len(t)}:{h:x}"


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
    resume_text: str = "",
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
        "blurb": (
            "Evidence-based match: required skills, responsibilities, experience, and "
            "evidence strength — not keyword stuffing. Parseability is reported separately."
        ),
        "engine": "fastapi",
        "engineVersion": ENGINE_VERSION,
        "textChars": len((resume_text or "").strip()),
        "textFingerprint": _fingerprint(resume_text or ""),
        # Back-compat for older clients
        "atsScore": overall,
    }
