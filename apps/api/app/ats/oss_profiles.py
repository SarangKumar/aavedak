"""Engines adapted from open-source ATS projects (FastAPI only — no TS fallback).

Each engine reuses the shared parsed inputs from `pipeline.py` and applies the formulas
verified in its reference repository. Deviations are deliberate and listed in each result's
`limitations` and in app/ats/ENGINES.md. These are Aavedak adaptations, not the original
projects running inside Aavedak.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable

from app.ats.analyze import _fingerprint
from app.ats.pipeline import (
    ANALYZING_CONTENT,
    CALCULATING_SCORE,
    EXTRACTING_SKILLS,
    GENERATING_REPORT,
    MATCHING_KEYWORDS,
    PARSING_JOB_DESCRIPTION,
    PARSING_RESUME,
    Emit,
    EngineContract,
    ParsedJd,
    ParsedResume,
    parse_jd_shared,
    parse_resume_shared,
    require_parsable,
    role_expected_skills,
)
from app.ats.reference_signals import HARD_SKILL_ALIASES, count_phrase
from app.ats.reference_weights import (
    ATS_CHECKER_STRICTNESS,
    ATS_CHECKER_WEIGHTS,
    HYBRID_COMBINE_WEIGHTS,
    HYBRID_RUBRIC_POINTS,
    OPEN_ATS_CATEGORY_WEIGHTS,
    OPEN_ATS_CONTENT_WEIGHTS,
    OPEN_ATS_FORMAT_PENALTIES,
    OPEN_ATS_KEYWORD_WEIGHTS,
    SKILLS_EXTRACTOR_TFIDF_CALIBRATION,
    SKILLS_EXTRACTOR_WEIGHTS,
)
from app.ats.skill_taxonomy import display_name, infer_role_key, role_skill_buckets
from app.ats.text_similarity import tfidf_cosine

OSS_PROFILE_VERSION = "1.0"


@dataclass(frozen=True)
class EngineInput:
    resume_id: str
    resume_text: str
    jd_text: str
    role: str
    mode: str


def _clamp(n: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, n))


def _r(n: float) -> int:
    return int(round(_clamp(n)))


def _js_round(n: float) -> int:
    """JavaScript `Math.round` (half rounds up). Python's `round` is half-to-even, so 62.5 → 62
    there but 63 in the ATS Resume Checker reference, which is JS."""
    return math.floor(n + 0.5)


def _skill_rows(canonicals: list[str], status: str, evidence: str = "") -> list[dict[str, Any]]:
    return [
        {
            "skill": display_name(c),
            "canonical": c,
            "status": status,
            "strength": 0.85 if status == "matched" else 0,
            **({"evidence": evidence} if evidence and status == "matched" else {}),
        }
        for c in canonicals
    ]


def _finding(fid: str, severity: str, category: str, title: str, detail: str, recommendation: str = "") -> dict:
    return {
        "id": fid,
        "severity": severity,
        "category": category,
        "title": title,
        "detail": detail,
        **({"recommendation": recommendation} if recommendation else {}),
    }


def _result(
    *,
    inp: EngineInput,
    resume: ParsedResume,
    engine_id: str,
    engine_name: str,
    profile_id: str,
    score_type: str,
    score_name: str,
    overall: float,
    score_label: str,
    formula: str,
    reference: str,
    breakdown: list[dict],
    findings: list[dict],
    improvements: list[dict],
    scores: dict[str, int | None],
    strengths: list[str],
    limitations: list[str],
    matched: list[dict] | None = None,
    missing: list[dict] | None = None,
    metrics: list[dict] | None = None,
    skill_categories: list[dict] | None = None,
    warnings: list[str] | None = None,
    blurb: str,
) -> dict[str, Any]:
    overall_i = _r(overall)
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    findings = sorted(findings, key=lambda f: sev_order.get(f["severity"], 5))
    return {
        "resumeId": inp.resume_id,
        "mode": inp.mode,
        "engineId": engine_id,
        "engineName": engine_name,
        "scoreType": score_type,
        "scoreScale": {"min": 0, "max": 100},
        "scoreName": score_name,
        "overallScore": overall_i,
        "atsScore": overall_i,
        "scoreLabel": score_label,
        "scores": scores,
        "breakdown": breakdown,
        "findings": findings,
        "metrics": metrics or [],
        "skillCategories": skill_categories or [],
        "limitations": limitations,
        "warnings": warnings or [],
        "methodology": {
            "id": profile_id,
            "version": OSS_PROFILE_VERSION,
            "formula": formula,
            "reference": reference,
        },
        "matchedSkills": matched or [],
        "partialSkills": [],
        "missingSkills": missing or [],
        "matchedResponsibilities": [],
        "partialResponsibilities": [],
        "missingResponsibilities": [],
        "strengths": strengths[:8],
        "improvements": improvements[:10],
        # Existing UI section for parse/format problems — mirror the formatting findings there.
        "atsIssues": [
            {"code": f["id"], "title": f["title"], "detail": f["detail"]}
            for f in findings
            if f["category"] in ("formatting", "contact", "structure")
        ][:8],
        "confidence": "high" if len(resume.raw) > 900 else "medium" if len(resume.raw) > 400 else "low",
        "notes": [formula, f"profile {profile_id}@{OSS_PROFILE_VERSION} · adapted from {reference}"],
        "engine": "fastapi",
        "engineVersion": f"{profile_id}@{OSS_PROFILE_VERSION}",
        "textChars": len(resume.raw.strip()),
        "textFingerprint": _fingerprint(resume.raw),
        "blurb": blurb,
    }


def _word_in(text_lower: str, term: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(term.lower())}(?![a-z0-9])", text_lower) is not None


def _first_word(line: str) -> str | None:
    m = re.match(r"[A-Za-z']+", line.lstrip("- *+•▪◦‣").strip())
    return m.group(0).lower() if m else None


def _parse_inputs(inp: EngineInput, emit: Emit, *, needs_jd: bool) -> tuple[ParsedResume, ParsedJd]:
    emit(PARSING_RESUME, None)
    resume = parse_resume_shared(inp.resume_text)
    require_parsable(resume)
    if needs_jd:
        emit(PARSING_JOB_DESCRIPTION, None)
    jd = parse_jd_shared(inp.jd_text, inp.role)
    return resume, jd


# ═══ 1. Open ATS (jlynshue/open-ats, MIT) ═══════════════════════════════════

OPEN_ATS_CONTRACT = EngineContract(modes=("resume_only", "role_match", "job_match"), jd="optional", title="optional")

# Adapted from open-ats src/open_ats/data/*.yaml (MIT).
OPEN_ATS_ACTION_VERBS = frozenset(
    v.lower()
    for v in """Achieved Architected Authored Automated Built Coached Collaborated Conceived Crafted
    Created Decreased Defined Delivered Designed Developed Drove Eliminated Engineered Established
    Executed Expanded Generated Grew Guided Hired Implemented Improved Increased Influenced Initiated
    Innovated Instituted Introduced Invented Launched Led Managed Mentored Migrated Negotiated Optimized
    Orchestrated Originated Owned Pioneered Produced Reduced Refactored Resolved Restructured Revamped
    Saved Scaled Secured Shipped Simplified Spearheaded Standardized Streamlined Strengthened Tripled
    Unified""".split()
)
OPEN_ATS_HEDGING = (
    "helped to", "tried to", "worked on", "worked with", "was involved in", "participated in",
    "familiar with", "exposed to", "some experience with", "basic understanding of",
    "working knowledge of", "have used", "have worked with", "had a hand in", "took part in",
    "played a role in", "contributed somewhat to", "got introduced to",
)
OPEN_ATS_PASSIVE_MARKERS = (
    "was responsible for", "were tasked with", "is being", "was being", "have been", "had been",
    "got assigned", "was given", "were asked to", "it was decided", "is performed", "are managed",
    "were created", "was implemented", "has been carried out", "was utilized", "was leveraged",
    "have been responsible", "was placed in charge", "was promoted to",
)
OPEN_ATS_INDUSTRY_TERMS: dict[str, tuple[str, ...]] = {
    "software development life cycle": ("sdlc",),
    "agile": (),
    "scrum": (),
    "service-level objective": ("slo", "slos"),
    "service-level agreement": ("sla", "slas"),
    "incident response": (),
    "postmortem": ("post-mortem",),
    "runbook": ("runbooks",),
    "architecture review": (),
    "dora metrics": (),
    "reliability engineering": (),
    "software supply chain": (),
    "microservices": ("microservice",),
    "distributed systems": ("distributed system",),
}
_AUX_PARTICIPLE_RE = re.compile(
    r"\b(was|were|is|are|been|being|has\s+been|had\s+been|have\s+been)\s+\w+(?:ed|en)\b", re.I
)
_SPECIAL_PAIRS = (("—", "-"), ("–", "-"), ("•", "-"), ("“", '"'), ("”", '"'), ("‘", "'"), ("’", "'"))


def _date_shape(token: str) -> str:
    t = token.strip()
    if re.match(r"^\d{4}-\d{1,2}$", t):
        return "iso_year_month"
    if re.match(r"^[A-Za-z]{3,9}\.?\s+\d{4}$", t):
        return "month_year_word"
    if re.match(r"^\d{4}$", t):
        return "year_only"
    return "unknown"  # includes Present/Current — see limitations


def _subscore(matched: int, expected: int) -> float:
    return 100.0 if expected <= 0 else min(100.0, 100.0 * matched / expected)


def run_open_ats(inp: EngineInput, emit: Emit) -> dict[str, Any]:
    use_jd = inp.mode == "job_match"
    resume, jd = _parse_inputs(inp, emit, needs_jd=use_jd)
    rhard = set(resume.hard_skills)
    verbs_used = sorted({w for b in resume.bullets if (w := _first_word(b)) in OPEN_ATS_ACTION_VERBS})
    kw = OPEN_ATS_KEYWORD_WEIGHTS
    hard_exp: list[str] = []
    hard_m: list[str] = []
    sub: dict[str, float] = {}
    keyword: float | None = None

    if inp.mode != "resume_only":
        emit(EXTRACTING_SKILLS, "Classifying JD keywords into hard, soft and industry terms" if use_jd else "Loading the title's skill profile")
        if use_jd:
            hard_exp = list(jd.hard_skills)
            soft_exp = list(jd.soft_skills)
            ind_exp = [t for t, syn in OPEN_ATS_INDUSTRY_TERMS.items() if any(count_phrase(jd.lower, p) for p in (t, *syn))]
        else:
            hard_exp = list(role_expected_skills(inp.role, engine_name="Open ATS"))
        emit(MATCHING_KEYWORDS, None)
        hard_m = [c for c in hard_exp if c in rhard]
        sub["hard"] = _subscore(len(hard_m), len(hard_exp))
        if use_jd:
            soft_m = [t for t in soft_exp if t in resume.soft_skills]
            ind_m = [t for t in ind_exp if any(count_phrase(resume.lower, p) for p in (t, *OPEN_ATS_INDUSTRY_TERMS[t]))]
            sub["soft"] = _subscore(len(soft_m), len(soft_exp))
            sub["industry"] = _subscore(len(ind_m), len(ind_exp))
        sub["action"] = min(100.0, 100.0 * len(verbs_used) / 10)
    # Title-only has no source for soft/industry terms: weight hard + action only instead of
    # crediting unknown categories with Open ATS's "empty JD category = 100" rule.
    kw_w = {k: kw[k] / sum(kw[j] for j in sub) for k in sub}
    if sub:
        keyword = sum(kw_w[k] * sub[k] for k in sub)

    emit(ANALYZING_CONTENT, "Formatting penalties and content-quality checks")
    p = OPEN_ATS_FORMAT_PENALTIES
    findings: list[dict] = []
    penalties = 0
    table_lines = sum(1 for l in resume.lines if l.count("|") >= 2 or l.count("\t") >= 2)
    if table_lines >= 2:
        penalties += p["table"]
        findings.append(_finding("formatting.table", "high", "formatting", "Table-like layout detected",
                                 f"{table_lines} lines look like table rows; ATS readers may misorder content.",
                                 "Convert tables to plain bullet points."))
    if not resume.email:
        penalties += p["missing_contact"]
        findings.append(_finding("formatting.missing_email", "critical", "formatting", "No email address detected",
                                 "No plain-text email address was found.", "Add your email as selectable text in the header."))
    if not resume.name:
        penalties += p["missing_contact"]
        findings.append(_finding("formatting.missing_name", "high", "formatting", "No candidate name detected",
                                 "The first lines don't look like a name (2–4 capitalized words).",
                                 "Put your full name alone on the first line."))
    shapes = sorted({s for d in resume.date_ranges for s in (_date_shape(d.start_raw), _date_shape(d.end_raw)) if s != "unknown"})
    if len(shapes) > 1:
        penalties += p["date_inconsistency"]
        findings.append(_finding("formatting.date_inconsistency", "medium", "formatting", "Mixed date formats",
                                 f"Dates use several formats: {', '.join(shapes)}.", "Pick one date format for every role."))
    offenses = sorted({s for s, a in _SPECIAL_PAIRS if s in resume.raw and a in resume.raw})
    if offenses:
        amount = min(p["special_char_each"] * len(offenses), p["special_char_cap"])
        penalties += amount
        findings.append(_finding("formatting.special_chars", "low", "formatting", "Inconsistent separator characters",
                                 f"Both typographic and ASCII forms are used: {' '.join(offenses)}.",
                                 "Use one separator / quote style throughout."))
    long_lines = sum(1 for l in resume.lines if len(l) > 120)
    if long_lines:
        penalties += min(long_lines, p["long_line_cap"])
        findings.append(_finding("formatting.long_lines", "low", "formatting", "Very long lines",
                                 f"{long_lines} line(s) exceed 120 characters.", "Break long lines into shorter bullets."))
    formatting = max(0.0, 100.0 - penalties)

    bullets = list(resume.bullets)
    sentences = [s.strip() for b in bullets for s in re.split(r"(?<=[.!?])\s+", b) if s.strip()]
    action_pct = 100.0 * sum(1 for b in bullets if _first_word(b) in OPEN_ATS_ACTION_VERBS) / len(bullets) if bullets else 0.0
    passive_n = sum(1 for s in sentences if any(m in s.lower() for m in OPEN_ATS_PASSIVE_MARKERS) or _AUX_PARTICIPLE_RE.search(s))
    hedging_n = sum(1 for b in bullets if any(h in b.lower() for h in OPEN_ATS_HEDGING))
    passive_sub = max(0.0, 100.0 - (passive_n / len(sentences) * 100.0 if sentences else 0.0))
    hedging_sub = max(0.0, 100.0 - (hedging_n / len(bullets) * 100.0 if bullets else 0.0))
    wc = resume.word_count
    if 400 <= wc <= 800:
        wc_fit = 100.0
    elif wc < 100 or wc > 1500:
        wc_fit = 0.0
    elif wc < 400:
        wc_fit = 100.0 * (wc - 100) / 300
    else:
        wc_fit = 100.0 * (1500 - wc) / 700
    cw = OPEN_ATS_CONTENT_WEIGHTS
    content = _clamp(cw["action"] * action_pct + cw["passive"] * passive_sub + cw["hedging"] * hedging_sub + cw["word_count"] * wc_fit)
    if sentences and passive_n / len(sentences) >= 0.20:
        findings.append(_finding("content_quality.passive_voice_high", "medium", "content", "Passive voice is frequent",
                                 f"{passive_n}/{len(sentences)} sentences look passive.", "Prefer active constructions."))
    if bullets and hedging_n / len(bullets) >= 0.15:
        findings.append(_finding("content_quality.hedging_high", "medium", "content", "Hedging language",
                                 f"{hedging_n}/{len(bullets)} bullets contain hedging phrases (e.g. “worked on”).",
                                 "State what you did and the outcome instead."))
    if wc < 400:
        findings.append(_finding("content_quality.too_short", "medium", "content", "Resume is short",
                                 f"{wc} words; Open ATS targets 400–800.", "Expand bullets with concrete scope and results."))
    elif wc > 800:
        findings.append(_finding("content_quality.too_long", "low", "content", "Resume is long",
                                 f"{wc} words; Open ATS targets ≤ 800.", "Trim older or less relevant content."))
    missing_hard = [c for c in hard_exp if c not in rhard]
    source = "job description" if use_jd else f"{inp.role.strip()} skill profile"
    for c in missing_hard[:6]:
        findings.append(_finding(f"keyword.missing.{c}", "high", "keyword", f"Hard skill not found: {display_name(c)}",
                                 f"Expected by the {source} but not found on the resume.",
                                 f"If you have genuine {display_name(c)} experience, show it in a bullet."))

    emit(CALCULATING_SCORE, None)
    parts: dict[str, float] = {"formatting": formatting, "content_quality": content}
    if keyword is not None:
        parts = {"keyword": keyword, **parts}
    cat_total = sum(OPEN_ATS_CATEGORY_WEIGHTS[k] for k in parts)
    cat = {k: OPEN_ATS_CATEGORY_WEIGHTS[k] / cat_total for k in parts}
    overall = sum(cat[k] * parts[k] for k in parts)

    emit(GENERATING_REPORT, None)
    rating = "Excellent" if overall >= 80 else "Good" if overall >= 70 else "Fair" if overall >= 60 else "Poor"
    labels = {"keyword": "Keyword", "formatting": "Formatting", "content_quality": "Content quality"}
    breakdown = [
        {"key": k, "label": labels[k], "score": round(parts[k], 1), "weight": round(cat[k], 4), "contribution": round(cat[k] * parts[k], 1)}
        for k in parts
    ]
    breakdown += [
        {"key": f"keyword.{k}", "label": f"Keyword · {k}", "score": round(sub[k], 1), "weight": round(kw_w[k], 4), "parent": "keyword"}
        for k in sub
    ]
    improvements = [
        {"priority": "high" if f["severity"] in ("critical", "high") else "medium" if f["severity"] == "medium" else "low",
         "text": f["recommendation"], "reason": f["title"], "findingId": f["id"]}
        for f in sorted(findings, key=lambda f: {"critical": 0, "high": 1, "medium": 2, "low": 3}[f["severity"]])
        if f.get("recommendation")
    ]
    formula = " + ".join(f"{labels[k].lower()}×{cat[k]:.2f}" for k in parts)
    if sub:
        formula += "; keyword = " + " + ".join(f"{k}×{kw_w[k]:.2f}" for k in sub)
    mode_limits = {
        "job_match": "A JD category with no terms scores 100, as in Open ATS.",
        "role_match": "Title-only: hard skills come from Aavedak's role profile (core + common); soft/industry terms are skipped and keyword weights renormalized.",
        "resume_only": "Resume-only: Open ATS's CLI always needs a JD; here keyword is skipped and formatting + content are reweighted 50/50 (both analyzers ignore the JD upstream).",
    }
    return _result(
        inp=inp, resume=resume, engine_id="open_ats", engine_name="Open ATS", profile_id="open-ats-adapted",
        score_type="ats_scan" if keyword is not None else "resume_quality",
        score_name="Open ATS Score" if keyword is not None else "Open ATS Resume Score",
        overall=overall, score_label=f"{rating} (Open ATS)",
        formula=f"overall = {formula}",
        reference="github.com/jlynshue/open-ats (MIT)",
        breakdown=breakdown, findings=findings, improvements=improvements,
        scores={"keywordCoverage": _r(keyword) if keyword is not None else None,
                "requiredSkills": _r(sub["hard"]) if "hard" in sub else None,
                "preferredSkills": _r(sub["soft"]) if "soft" in sub else None,
                "structureFormatting": _r(formatting), "resumeQuality": _r(content)},
        strengths=[s for s in (
            f"{len(verbs_used)} distinct strong action verbs" if len(verbs_used) >= 5 else "",
            "No formatting penalties" if penalties == 0 else "",
            f"Hard-skill coverage {int(sub['hard'])}%" if hard_exp and sub.get("hard", 0) >= 60 else "",
        ) if s],
        matched=_skill_rows(hard_m, "matched", "Found on resume"), missing=_skill_rows(missing_hard, "missing"),
        metrics=[
            {"key": "word_count", "label": "Word count", "value": wc},
            {"key": "bullets", "label": "Bullets analyzed", "value": len(bullets)},
            {"key": "action_verbs", "label": "Distinct strong action verbs", "value": len(verbs_used)},
            {"key": "passive", "label": "Passive sentences", "value": passive_n},
            {"key": "hedging", "label": "Hedging bullets", "value": hedging_n},
            {"key": "penalty", "label": "Formatting penalty", "value": penalties},
        ],
        limitations=[
            mode_limits[inp.mode],
            "Runs on extracted text only: table detection is a text heuristic, not Open ATS's DOCX/PDF parser warnings.",
            "Hard/soft skills use Aavedak's taxonomy instead of Open ATS's YAML keyword database.",
            "“Present/Current” is not counted as a date format (Open ATS counts it, which flags almost every resume).",
        ],
        blurb="Open ATS adaptation: transparent keyword + formatting + content-quality scan.",
    )


# ═══ 2. ATS Resume Checker (Jahangirhussen/ats-resume-checker, MIT) ═════════

ATS_CHECKER_CONTRACT = EngineContract(modes=("resume_only", "role_match", "job_match"), jd="optional", title="optional")

# Adapted from ats-resume-checker data/*.json (MIT).
_AC_STRONG = frozenset(
    """achieved accelerated architected automated boosted built championed closed coordinated created cut
    decreased delivered designed developed directed drove eliminated engineered enhanced established executed
    expanded generated grew implemented improved increased initiated launched led managed mentored negotiated
    optimized orchestrated overhauled pioneered produced reduced redesigned resolved restructured saved scaled
    secured spearheaded streamlined strengthened transformed upgraded""".split()
)
_AC_WEAK = (
    "responsible for", "worked on", "helped with", "assisted with", "involved in", "participated in",
    "tasked with", "duties included", "in charge of", "dealt with", "handled", "was part of", "various",
    "things", "stuff", "etc", "good communication skills", "hard working", "team player", "detail oriented",
    "go-getter", "synergy", "dynamic", "results-driven", "self-starter",
)
_AC_BUZZ = (
    "synergy", "thought leader", "ninja", "rockstar", "guru", "go-getter", "team player", "hard worker",
    "results-driven", "dynamic", "proactive", "detail oriented", "outside the box", "value add",
    "circle back", "best of breed", "game changer", "wheelhouse",
)
_AC_STOP = frozenset(
    """a an the and or but of in on at to for with by is are was were be been being this that these those
    it its as from into than then so such also will would can could should may might must have has had do
    does did not no yes i we you he she they them his her their our your""".split()
)
_AC_TECH = (
    "Python", "Java", "JavaScript", "TypeScript", "C++", "C#", "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin",
    "React", "Angular", "Vue", "Node.js", "Django", "Flask", "Spring Boot", "Laravel", ".NET", "AWS", "Azure",
    "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins", "Git", "SQL", "PostgreSQL", "MySQL", "MongoDB",
    "Redis", "TensorFlow", "PyTorch", "Pandas", "NumPy", "Power BI", "Tableau", "Excel", "Figma",
    "Photoshop", "Salesforce", "SAP", "Jira", "Confluence",
)
_AC_SECTIONS: dict[str, tuple[str, ...]] = {
    "contact": ("contact", "contact information", "personal information"),
    "summary": ("summary", "professional summary", "objective", "career objective", "profile", "about me"),
    "experience": ("experience", "work experience", "employment history", "professional experience", "career history"),
    "education": ("education", "academic background", "qualifications"),
    "skills": ("skills", "technical skills", "core competencies", "key skills", "expertise"),
    "projects": ("projects", "personal projects", "key projects"),
    "certifications": ("certifications", "certificates", "licenses"),
    "awards": ("awards", "honors", "achievements"),
    "publications": ("publications", "papers"),
    "research": ("research", "research experience"),
    "languages": ("languages", "language proficiency"),
    "volunteer": ("volunteer", "volunteering", "community service"),
    "references": ("references",),
}
_AC_CORE = ("contact", "summary", "experience", "education", "skills")
_AC_LABELS = {
    "keywordMatch": "Keyword match", "structure": "Structure", "formatting": "Formatting",
    "writingQuality": "Writing quality", "achievements": "Achievements", "experience": "Experience",
    "education": "Education", "contact": "Contact",
}


def _ac_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9+.#/]+", text.lower())


def _syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if len(w) <= 3:
        return 1
    w = re.sub(r"(?:[^laeiouy]es|ed|[^laeiouy]e)$", "", w)
    w = re.sub(r"^y", "", w)
    m = re.findall(r"[aeiouy]{1,2}", w)
    return len(m) if m else 1


def _flesch(text: str) -> int:
    sents = [s for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    words = _ac_words(text)
    if not sents or not words:
        return 0
    syl = sum(_syllables(w) for w in words)
    return int(round(_clamp(206.835 - 1.015 * (len(words) / len(sents)) - 84.6 * (syl / len(words)))))


def _ac_key_phrases(jd_text: str) -> list[str]:
    freq: Counter[str] = Counter(
        w for w in re.findall(r"[a-z][a-z0-9+.#/\-]{1,30}", jd_text.lower()) if w not in _AC_STOP and len(w) >= 3
    )
    tech = [t.lower() for t in _AC_TECH if _word_in(jd_text.lower(), t)]
    ranked = [w for w, _ in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:40]]
    return list(dict.fromkeys([*tech, *ranked]))[:35]


def _ac_role_terms(role: str) -> list[tuple[str, tuple[str, ...]]]:
    buckets = role_skill_buckets(role)
    canon = list(dict.fromkeys(c for k in ("core", "common", "optional", "specialized") for c in buckets.get(k, [])))
    return [(display_name(c).lower(), tuple(HARD_SKILL_ALIASES.get(c, [c]))) for c in canon]


def run_ats_resume_checker(inp: EngineInput, emit: Emit) -> dict[str, Any]:
    use_jd = inp.mode == "job_match"
    resume, _jd = _parse_inputs(inp, emit, needs_jd=use_jd)
    lower = resume.lower
    findings: list[dict] = []
    fid = iter(range(1, 1000))

    def issue(category: str, severity: str, title: str, detail: str, rec: str) -> None:
        findings.append(_finding(f"{category}.{next(fid)}", severity, category, title, detail, rec))

    checker_warnings: list[str] = []
    keyword_score: float | None = None
    terms: list[tuple[str, tuple[str, ...]]] = []
    matched_terms: list[str] = []
    missing_terms: list[str] = []
    if inp.mode in ("role_match", "job_match"):
        emit(EXTRACTING_SKILLS, "Extracting key phrases" if use_jd else "Loading role skill list")
        if use_jd and len(inp.jd_text.strip()) > 30:
            terms = [(t, (t,)) for t in _ac_key_phrases(inp.jd_text)]
        if len(terms) < 8 and inp.role.strip():
            seen = {t for t, _ in terms}
            terms += [rt for rt in _ac_role_terms(inp.role) if rt[0] not in seen]
        emit(MATCHING_KEYWORDS, None)
        for label, aliases in terms:
            (matched_terms if any(_word_in(lower, a) for a in aliases) else missing_terms).append(label)
        if not terms:
            # Reference returns 100 here; that would reward an empty requirement list.
            checker_warnings.append("Keyword match could not be scored; the overall excludes it.")
            issue("keywordMatch", "medium", "No keywords to match",
                  "Neither the job description nor the title produced a keyword list.",
                  "Paste a fuller job description or a recognizable job title.")
        else:
            keyword_score = 100.0 * len(matched_terms) / len(terms)
        for m in missing_terms[:12]:
            issue("keywordMatch", "high", f"Missing keyword: “{m}”",
                  "Appears in the " + ("job description" if use_jd else "role skill list") + " but not on the resume.",
                  f"Work “{m}” into Skills or Experience only if it genuinely applies.")
        words_all = _ac_words(resume.raw)
        for t in matched_terms:
            count = sum(1 for w in words_all if w == t or w.startswith(t))
            if count > 5 and count / max(1, len(words_all)) > 0.04:
                issue("keywordMatch", "medium", "Possible keyword stuffing",
                      f"“{t}” appears {count}×.", "Use the term naturally — 2–4 mentions is enough.")
                break

    emit(ANALYZING_CONTENT, "Structure, formatting, writing, achievements, experience, education, contact")
    # Structure
    found: dict[str, bool] = {}
    for sec, aliases in _AC_SECTIONS.items():
        alt = "|".join(re.escape(a) for a in aliases)
        found[sec] = any(re.match(rf"^\s*({alt})\s*:?\s*$", l, re.I) for l in resume.lines) or bool(
            re.search(rf"\b({alt})\b", resume.raw, re.I)
        )
    core_n = sum(found[s] for s in _AC_CORE)
    bonus = [s for s in _AC_SECTIONS if s not in _AC_CORE]
    structure = _clamp(_js_round(core_n / len(_AC_CORE) * 85 + sum(found[s] for s in bonus) / len(bonus) * 15))
    for s in _AC_CORE:
        if not found[s]:
            issue("structure", "critical" if s in ("contact", "experience") else "high", f"Missing “{s}” section",
                  f"No “{s}” heading was detected; parsers rely on headings to categorize content.",
                  f"Add a clearly labeled “{s.title()}” section.")
    dupes = [l for l, c in Counter(l.lower() for l in resume.lines if len(l) > 15).items() if c > 1]
    if dupes:
        issue("structure", "low", "Duplicate lines", f"{len(dupes)} line(s) repeat verbatim.", "Remove duplicate bullets.")

    # Formatting (text-only checks; page count / OCR not available from extracted text)
    wc = len(_ac_words(resume.raw))
    formatting = 100.0
    if wc < 150:
        formatting -= 15
        issue("formatting", "high", "Resume content is too short", f"Only ~{wc} words detected.",
              "Expand experience bullets with responsibilities and quantified results.")
    if wc > 1100:
        formatting -= 5
        issue("formatting", "low", "Resume may be too long", f"~{wc} words detected.", "Focus on the last 10–15 years.")
    icons = re.findall(r"[☀-➿\U0001F300-\U0001FAFF]", resume.raw)
    if len(icons) > 3:
        formatting -= 8
        issue("formatting", "medium", "Icons or emoji detected", f"{len(icons)} icon-like characters found.",
              "Replace icons with plain-text labels.")
    multi = sum(1 for l in resume.raw.split("\n") if re.search(r"\S {3,}\S", l))
    total_lines = max(1, len(resume.lines))
    if multi / total_lines > 0.25:
        formatting -= 12
        issue("formatting", "medium", "Possible multi-column layout", f"{multi} of {total_lines} lines have wide gaps.",
              "Use a single-column layout.")
    if re.search(r"\|.*\|.*\|", resume.raw):
        formatting -= 6
        issue("formatting", "low", "Possible table structure", "Pipe-separated content suggests a table.",
              "Convert tables to bullet points.")
    formatting = _clamp(formatting)

    # Writing quality
    writing = 100.0
    weak = [w for w in _AC_WEAK if _word_in(lower, w)]
    if weak:
        writing -= min(20, len(weak) * 4)
        issue("writingQuality", "high", "Weak / filler phrases", f"Found: {', '.join(weak[:3])}.",
              "Lead with what you did and the result (e.g. “Led…, cutting release time 30%”).")
    buzz = [b for b in _AC_BUZZ if _word_in(lower, b)]
    if buzz:
        writing -= min(10, len(buzz) * 2)
        issue("writingQuality", "low", "Overused buzzwords", f"Found: {', '.join(buzz[:3])}.",
              "Replace buzzwords with a specific accomplishment.")
    passive = re.findall(r"\b(?:is|are|was|were|been|being|be)\s+\w+ed\b", resume.raw, re.I)
    if len(passive) > 2:
        writing -= min(12, len(passive) * 2)
        issue("writingQuality", "medium", "Passive voice", f"{len(passive)} passive constructions.", "Use active voice.")
    freq = Counter(w for w in _ac_words(resume.raw) if len(w) > 4 and w not in _AC_STOP)
    overused = [(w, c) for w, c in freq.most_common(5) if c >= 6]
    if overused:
        writing -= 5
        issue("writingQuality", "low", "Repeated words", ", ".join(f"{w} ({c}×)" for w, c in overused),
              "Vary vocabulary where natural.")
    long_s = [s for s in re.split(r"(?<=[.!?])\s+", resume.raw) if len(_ac_words(s)) > 32]
    if len(long_s) > 3:
        writing -= 6
        issue("writingQuality", "low", "Several long sentences", f"{len(long_s)} sentences exceed 32 words.",
              "Break them into short bullets.")
    flesch = _flesch(resume.raw)
    if flesch < 30:
        writing -= 8
        issue("writingQuality", "medium", "Low readability", f"Flesch Reading Ease {flesch}/100.",
              "Shorten sentences and prefer direct wording.")
    writing = _clamp(writing)

    # Achievements
    ac_bullets = [
        re.sub(r"^[•\-*▪◦‣o]\s+", "", l)
        for l in resume.lines
        if re.match(r"^[•\-*▪◦‣o]\s+", l) or 20 < len(l) < 220
    ]
    if not ac_bullets:
        achievements, quant_pct, verb_pct = 40.0, 0, 0
        issue("achievements", "high", "No clear bullet points", "No achievement statements were detected.",
              "Use 3–6 bullets per role, each starting with an action verb.")
    else:
        quant_pct = _js_round(100 * sum(1 for b in ac_bullets if re.search(r"\d", b)) / len(ac_bullets))
        # The reference strips every non-letter from the first word before the lookup.
        verb_pct = _js_round(100 * sum(1 for b in ac_bullets if re.sub(r"[^a-z]", "", (b.split() or [""])[0].lower()) in _AC_STRONG) / len(ac_bullets))
        achievements = _clamp(_js_round(quant_pct * 0.5 + verb_pct * 0.5))
        if quant_pct < 40:
            issue("achievements", "critical", "Most bullets lack measurable impact",
                  f"Only {quant_pct}% of bullets include a number or metric.",
                  "Add truthful metrics (latency, users, revenue, time saved) to key bullets.")
        if verb_pct < 40:
            issue("achievements", "high", "Bullets don't start with strong verbs",
                  f"Only {verb_pct}% start with a strong action verb.", "Start bullets with verbs like led, built, reduced.")

    # Experience (no seniority input in Aavedak → reference's no-seniority branch)
    ranges = sorted(resume.date_ranges, key=lambda d: d.start_year)
    years = len({y for d in ranges for y in range(d.start_year, d.end_year)})
    gaps = [(a.end_year, b.start_year) for a, b in zip(ranges, ranges[1:]) if b.start_year - a.end_year >= 1]
    if not ranges:
        experience = 50.0
        issue("experience", "medium", "No clear employment dates", "No date ranges like “Jan 2022 – Present” found.",
              "List start/end dates for every role.")
    else:
        experience = 70.0
    if gaps:
        issue("experience", "low", f"{len(gaps)} potential employment gap(s)", ", ".join(f"{a}–{b}" for a, b in gaps),
              "Optionally address significant gaps (study, freelance, career break).")

    # Education
    has_degree = bool(re.search(r"\b(Bachelor|Master|PhD|Ph\.D|B\.?Sc|M\.?Sc|BBA|MBA|B\.?A\.?|M\.?A\.?|B\.?Tech|M\.?Tech|Associate Degree|Diploma)\b", resume.raw, re.I))
    education = 60.0 + (25 if has_degree else 0) + (15 if re.search(r"(19|20)\d{2}", resume.raw) else 0)
    if not has_degree:
        issue("education", "medium", "No recognizable degree", "No standard degree keyword found.",
              "Name your degree in full (e.g. “Bachelor of Science in Computer Science”).")

    # Contact
    contact = 100.0
    if not resume.email:
        contact -= 40
        issue("contact", "critical", "No email address", "Recruiters and ATS auto-responders cannot reach you.",
              "Add a professional email at the top.")
    if not resume.phone:
        contact -= 20
        issue("contact", "high", "No phone number", "Phone numbers are expected and used for deduplication.",
              "Add a phone number with country code.")
    if not resume.linkedin:
        contact -= 10
        issue("contact", "low", "No LinkedIn profile", "A LinkedIn URL increases credibility.", "Add your LinkedIn URL.")
    role_key = infer_role_key(inp.role)
    if role_key and role_key != "product designer" and not resume.github:
        contact -= 10
        issue("contact", "low", "No GitHub profile", "For technical roles GitHub is an expected signal.",
              "Add your GitHub profile URL.")
    contact = _clamp(contact)

    emit(CALCULATING_SCORE, None)
    raw_scores: dict[str, float] = {
        "structure": structure, "formatting": formatting, "writingQuality": writing, "achievements": achievements,
        "experience": experience, "education": _clamp(education), "contact": contact,
    }
    if keyword_score is not None:
        raw_scores["keywordMatch"] = keyword_score

    def strict(v: float) -> float:
        return _clamp(_js_round(v - (100 - v) * (ATS_CHECKER_STRICTNESS - 1)))

    cat_scores = {k: strict(v) for k, v in raw_scores.items()}
    weights = {k: w for k, w in ATS_CHECKER_WEIGHTS.items() if k in cat_scores}
    total_w = sum(weights.values())
    # Renormalize when keywordMatch is absent (resume-only) so the score stays on 0–100.
    norm = {k: w / total_w for k, w in weights.items()}
    overall = _clamp(_js_round(sum(cat_scores[k] * norm[k] for k in norm)))
    q_keys = [k for k in norm if k != "keywordMatch"]
    q_total = sum(ATS_CHECKER_WEIGHTS[k] for k in q_keys)
    quality_only = sum(cat_scores[k] * ATS_CHECKER_WEIGHTS[k] / q_total for k in q_keys)

    emit(GENERATING_REPORT, "Prioritizing fixes by weighted deficiency")
    roadmap = sorted(
        ((k, (100 - cat_scores[k]) * norm[k]) for k in norm), key=lambda kv: -kv[1]
    )
    improvements: list[dict] = []
    for i, (k, deficiency) in enumerate([r for r in roadmap if r[1] > 1][:5]):
        top = next((f for f in sorted(findings, key=lambda f: ["critical", "high", "medium", "low"].index(f["severity"])) if f["category"] == k), None)
        improvements.append({
            "priority": "high" if i < 2 else "medium" if i < 4 else "low",
            "text": top["recommendation"] if top else f"Improve {_AC_LABELS[k].lower()}.",
            "reason": f"{_AC_LABELS[k]} {cat_scores[k]:.0f}/100 · up to {deficiency:.1f} weighted points",
            **({"findingId": top["id"]} if top else {}),
        })
    grade = next(g for m, g in ((90, "A+ Excellent"), (80, "A Very Good"), (70, "B Good"), (60, "C Fair"), (50, "D Needs Work"), (0, "F Poor")) if overall >= m)
    score_type = "resume_quality" if inp.mode == "resume_only" else "ats_readiness"
    breakdown = [
        {"key": k, "label": _AC_LABELS[k], "score": cat_scores[k], "weight": round(norm[k], 4),
         "contribution": round(cat_scores[k] * norm[k], 1)}
        for k in ATS_CHECKER_WEIGHTS if k in norm
    ]
    critical = sum(1 for f in findings if f["severity"] == "critical")
    high = sum(1 for f in findings if f["severity"] == "high")
    strengths = [s for s in (
        "Complete, valid contact information" if cat_scores["contact"] >= 90 else "",
        "Strong, quantified achievement bullets" if cat_scores["achievements"] >= 75 else "",
        "Strong keyword alignment" if cat_scores.get("keywordMatch", 0) >= 75 else "",
        "Well-structured resume with clear sections" if cat_scores["structure"] >= 85 else "",
        "Clear, readable writing" if flesch >= 50 else "",
    ) if s]
    return _result(
        inp=inp, resume=resume, engine_id="ats_resume_checker", engine_name="ATS Resume Checker",
        profile_id="ats-resume-checker-adapted", score_type=score_type,
        score_name="Resume Quality Score" if score_type == "resume_quality" else "ATS Readiness Score",
        overall=overall, score_label=grade,
        formula="overall = Σ category × weight (keyword .22 · structure/formatting/writing/achievements .14 · "
                "experience .10 · education/contact .06); weights renormalized when keyword match is not scored",
        reference="github.com/Jahangirhussen/ats-resume-checker (MIT)",
        breakdown=breakdown, findings=findings, improvements=improvements,
        scores={"keywordCoverage": _r(keyword_score) if keyword_score is not None else None,
                "structureFormatting": _r(structure), "atsCompatibility": _r(formatting),
                "evidenceQuality": _r(achievements), "experienceQuality": _r(experience),
                "resumeQuality": _r(quality_only)},
        strengths=strengths,
        matched=[{"skill": t, "status": "matched", "strength": 0.8} for t in matched_terms],
        missing=[{"skill": t, "status": "missing", "strength": 0} for t in missing_terms],
        metrics=[
            {"key": "resume_quality", "label": "Resume quality (non-keyword categories)", "value": _r(quality_only), "unit": "/100"},
            *([{"key": "keyword_match", "label": "Keyword match", "value": _r(keyword_score), "unit": "%"}] if keyword_score is not None else []),
            {"key": "flesch", "label": "Flesch reading ease", "value": flesch},
            {"key": "quantified", "label": "Quantified bullets", "value": quant_pct, "unit": "%"},
            {"key": "strong_verbs", "label": "Strong-verb bullets", "value": verb_pct, "unit": "%"},
            {"key": "years", "label": "Years covered by date ranges", "value": years},
            {"key": "health", "label": "Health", "value": "Red" if critical else "Yellow" if high > 2 else "Green"},
        ],
        limitations=[
            "Generic ATS profile only (strictness 1.0); page count and OCR checks need the original file and are skipped.",
            "No seniority input, so experience uses the reference's no-seniority branch (70 with dates, 50 without).",
            "Resume-only mode excludes keyword match and renormalizes weights (the reference scores it as 100).",
            "Weak phrases / buzzwords use word-boundary matching (the reference's substring check matched “did” inside “candidate”).",
            "JD keywords are frequency-ranked terms, so generic words can appear in the list, as in the reference.",
        ],
        warnings=checker_warnings,
        blurb="ATS Resume Checker adaptation: 8 weighted categories, severity-ranked findings, prioritized fixes.",
    )


# ═══ 3. Resume Skills Extractor (blueabstract/resume-skills-extractor) ══════

# No resume-only mode: the source only scores against a comparison target.
SKILLS_EXTRACTOR_CONTRACT = EngineContract(modes=("role_match", "job_match"), jd="optional", title="optional")

# Aavedak grouping of its own taxonomy, following the reference's category idea.
SKILL_CATEGORIES: dict[str, tuple[str, ...]] = {
    "Languages": ("python", "javascript", "typescript", "java", "csharp", "cplusplus", "go", "rust", "sql"),
    "Frontend": ("react", "nextjs", "vue", "angular", "html", "css", "tailwind", "redux"),
    "Backend": ("fastapi", "django", "flask", "express", "spring", "nodejs", "graphql", "rest"),
    "Data / ML": ("machine_learning", "pytorch", "tensorflow", "spark", "airflow", "dbt", "etl", "databricks", "kafka"),
    "Cloud / DevOps": ("aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci_cd", "linux"),
    "Databases": ("postgresql", "mysql", "mongodb", "redis", "elasticsearch", "snowflake", "bigquery", "duckdb", "trino", "iceberg", "delta_lake"),
    "Tools": ("git", "figma"),
}


def _clean_for_tfidf(text: str) -> str:
    t = re.sub(r"[^\w\s./#+]", " ", text.lower())
    return re.sub(r"\s+", " ", t).strip()


def run_resume_skills_extractor(inp: EngineInput, emit: Emit) -> dict[str, Any]:
    use_jd = inp.mode == "job_match"
    resume, jd = _parse_inputs(inp, emit, needs_jd=use_jd)
    emit(EXTRACTING_SKILLS, None if use_jd else "Loading the title's skill profile")
    rset = set(resume.hard_skills)
    jset = set(jd.hard_skills) if use_jd else set(role_expected_skills(inp.role, engine_name="Resume Skills Extractor"))
    in_section = set(resume.skills_section_skills)
    source = "JD" if use_jd else "role"

    emit(MATCHING_KEYWORDS, None)
    matched = sorted(rset & jset)
    missing = sorted(jset - rset)
    bonus = sorted(rset - jset)
    keyword_ratio = len(matched) / len(jset) if jset else 0.0

    w = SKILLS_EXTRACTOR_WEIGHTS
    cosine: float | None = None
    calibrated: int | None = None
    if use_jd:
        emit(CALCULATING_SCORE, "TF-IDF (1–3 grams) cosine similarity")
        cosine = tfidf_cosine(_clean_for_tfidf(resume.raw), _clean_for_tfidf(jd.raw), ngram_range=(1, 3),
                              stop_words=True, sublinear_tf=True, max_features=10000)
        calibrated = min(100, round(cosine * SKILLS_EXTRACTOR_TFIDF_CALIBRATION))
        overall = _clamp(round(calibrated * w["tfidf"] + keyword_ratio * 100 * w["keyword"]))
        breakdown = [
            {"key": "tfidf", "label": "TF-IDF similarity (calibrated)", "score": calibrated, "weight": w["tfidf"],
             "contribution": round(calibrated * w["tfidf"], 1)},
            {"key": "keyword", "label": "Skill keyword ratio", "score": round(keyword_ratio * 100), "weight": w["keyword"],
             "contribution": round(keyword_ratio * 100 * w["keyword"], 1)},
        ]
        formula = f"overall = min(100, cosine×{SKILLS_EXTRACTOR_TFIDF_CALIBRATION})×{w['tfidf']} + keyword_ratio×100×{w['keyword']}"
    else:
        # A title is not a document, so TF-IDF has nothing to compare: score skill coverage alone.
        emit(CALCULATING_SCORE, "Skill coverage against the role profile")
        overall = _clamp(round(keyword_ratio * 100))
        breakdown = [
            {"key": "keyword", "label": "Role skill coverage", "score": round(keyword_ratio * 100), "weight": 1.0,
             "contribution": round(keyword_ratio * 100, 1)},
        ]
        formula = "overall = role skills found / role skills × 100 (TF-IDF needs a JD)"

    emit(GENERATING_REPORT, None)
    categories = []
    for cat, skills in SKILL_CATEGORIES.items():
        jd_cat = [s for s in skills if s in jset]
        if jd_cat:
            m = [s for s in jd_cat if s in rset]
            categories.append({"category": cat, "score": round(100 * len(m) / len(jd_cat)),
                               "matched": [display_name(s) for s in m],
                               "missing": [display_name(s) for s in jd_cat if s not in rset]})
    verdict = "Excellent match" if overall >= 80 else "Good match" if overall >= 60 else "Partial match" if overall >= 40 else "Low match"
    findings = [
        _finding(f"skill.missing.{c}", "high", "skills", f"Missing {source} skill: {display_name(c)}",
                 "Expected by the " + ("job description" if use_jd else f"{inp.role.strip()} skill profile") + ", not on the resume.",
                 f"Add {display_name(c)} only if you have real experience with it.")
        for c in missing
    ]
    if not jset:
        findings.append(_finding("skill.none_in_jd", "medium", "skills", "No recognizable skills in the JD",
                                 "Keyword ratio is 0 because no taxonomy skills were found in the JD; the score is similarity only.",
                                 "Paste the full JD including its requirements section."))
    metrics = [
        *([{"key": "tfidf_raw", "label": "Raw TF-IDF cosine similarity", "value": round(cosine * 100, 1), "unit": "%"},
           {"key": "tfidf_calibrated", "label": f"Calibrated similarity (×{SKILLS_EXTRACTOR_TFIDF_CALIBRATION}, capped)", "value": calibrated}]
          if cosine is not None else []),
        {"key": "keyword_ratio", "label": "Skill keyword ratio", "value": round(keyword_ratio * 100), "unit": "%"},
        {"key": "bonus", "label": f"Bonus skills (not in {source})", "value": ", ".join(display_name(s) for s in bonus[:10]) or "—"},
    ]
    return _result(
        inp=inp, resume=resume, engine_id="resume_skills_extractor", engine_name="Resume Skills Extractor",
        profile_id="resume-skills-extractor-adapted",
        score_type="skill_similarity_match" if use_jd else "role_match",
        score_name="Skill + Similarity Match" if use_jd else "Role Skill Coverage",
        overall=overall, score_label=verdict, formula=formula,
        reference="github.com/blueabstract/resume-skills-extractor (README states MIT; no LICENSE file — formula adapted, no code copied)",
        breakdown=breakdown,
        findings=findings,
        improvements=[{"priority": "high", "text": f["recommendation"], "reason": f["title"], "findingId": f["id"]}
                      for f in findings if f.get("recommendation")],
        scores={"requiredSkills": _r(keyword_ratio * 100), "keywordCoverage": _r(calibrated) if calibrated is not None else None},
        strengths=[f"{len(matched)}/{len(jset)} {source} skills matched"] if jset and matched else [],
        matched=[{**row, "confidence": 1.0 if row["canonical"] in in_section else 0.5}
                 for row in _skill_rows(matched, "matched", "Found on resume")],
        missing=_skill_rows(missing, "missing"),
        metrics=metrics,
        skill_categories=categories,
        limitations=[
            *([] if use_jd else ["Title-only: compares against Aavedak's role profile (core + common skills); no similarity part — the source requires a JD for its score."]),
            "Text similarity is lexical TF-IDF overlap, not semantic understanding, and is not an ATS score by itself.",
            "The ×180 calibration is the reference's heuristic so typical resume/JD cosines (0.1–0.4) spread over 0–100.",
            "Skills come from Aavedak's taxonomy and category grouping, not the reference's skill list.",
            "TF-IDF is a pure-Python port; its stop-word list is shorter than scikit-learn's.",
        ],
        blurb="Resume Skills Extractor adaptation: TF-IDF similarity blended with explicit skill coverage, by category.",
    )


# ═══ 4. Hybrid Resume Analyzer (Anirodh-Padhy/resume-analyzer, MIT) ════════

HYBRID_CONTRACT = EngineContract(
    modes=("resume_only", "role_match", "job_match"), jd="optional", title="optional", min_jd_chars=21
)
_HY_SECTIONS = ("education", "experience", "skills", "projects", "work experience", "internship",
                "certifications", "achievements", "summary", "objective")


def run_hybrid_resume_analyzer(inp: EngineInput, emit: Emit) -> dict[str, Any]:
    use_jd = inp.mode == "job_match"
    resume, jd = _parse_inputs(inp, emit, needs_jd=use_jd)
    warnings: list[str] = []
    findings: list[dict] = []
    common_limits = [
        "No machine-learning model is used: the reference's pickled classifier only gates resume validity and is not loaded.",
        "Skills use Aavedak's word-boundary taxonomy matching (the reference's substring check matches “r” or “ai” inside words).",
    ]

    emit(ANALYZING_CONTENT, "Rule-based resume validation")
    rule = (min(sum(1 for s in _HY_SECTIONS if s in resume.lower) * 15, 45) + (20 if "@" in resume.raw else 0)
            + (10 if any(ch.isdigit() for ch in resume.raw) else 0) + (25 if resume.word_count > 150 else 0))
    if rule < 60:
        warnings.append("Low resume-likeness from the rule check; results may be unreliable.")
        findings.append(_finding("validation.low_rule_score", "medium", "validation", "Document may not be a resume",
                                 f"Rule-based validation scored {rule}/100 (sections, email, digits, length).",
                                 "Check that the uploaded file is your resume with standard sections."))
    rule_metric = {"key": "rule_validation", "label": "Rule-based resume validation", "value": rule, "unit": "/100"}

    if inp.mode == "resume_only":
        # The reference's only JD-free signal is its rule validation — report exactly that, labelled as such.
        emit(CALCULATING_SCORE, None)
        emit(GENERATING_REPORT, None)
        hits = [s for s in _HY_SECTIONS if s in resume.lower]
        return _result(
            inp=inp, resume=resume, engine_id="hybrid_resume_analyzer", engine_name="Hybrid Resume Analyzer",
            profile_id="hybrid-resume-analyzer-adapted", score_type="resume_validation",
            score_name="Resume Validation Score", overall=rule,
            score_label="Recognized as a resume" if rule >= 70 else "Weak resume signals",
            formula="overall = min(15×section keywords, 45) + 20 email + 10 digits + 25 if > 150 words",
            reference="github.com/Anirodh-Padhy/resume-analyzer (MIT)",
            breakdown=[
                {"key": "sections", "label": "Section keywords", "points": min(len(hits) * 15, 45), "maxPoints": 45},
                {"key": "email", "label": "Email (@)", "points": 20 if "@" in resume.raw else 0, "maxPoints": 20},
                {"key": "digits", "label": "Digits (phone/dates)", "points": 10 if any(ch.isdigit() for ch in resume.raw) else 0, "maxPoints": 10},
                {"key": "length", "label": "More than 150 words", "points": 25 if resume.word_count > 150 else 0, "maxPoints": 25},
            ],
            findings=findings,
            improvements=[{"priority": "medium", "text": f["recommendation"], "reason": f["title"], "findingId": f["id"]}
                          for f in findings if f.get("recommendation")],
            scores={},
            strengths=[f"Sections found: {', '.join(hits)}"] if hits else [],
            metrics=[rule_metric, {"key": "words", "label": "Word count", "value": resume.word_count}],
            warnings=warnings,
            limitations=[
                "Resume-only: this is the reference's document-validation rule score (is this a resume?), not a quality or match score.",
                *common_limits,
            ],
            blurb="Hybrid Resume Analyzer, resume-only: the reference's rule-based resume validation.",
        )

    emit(EXTRACTING_SKILLS, None if use_jd else "Loading the title's skill profile")
    required = list(jd.hard_skills) if use_jd else list(role_expected_skills(inp.role, engine_name="Hybrid Resume Analyzer"))
    rset = set(resume.hard_skills)
    matched = [c for c in required if c in rset]
    missing = [c for c in required if c not in rset]
    source = "JD" if use_jd else "role"

    emit(MATCHING_KEYWORDS, None)
    P = HYBRID_RUBRIC_POINTS
    skill_pts = len(matched) / len(required) * P["skill"] if required else 0.0
    res_words = set(resume.lower.split())
    keyword_pts: float | None = None
    if use_jd:
        jd_words = set(jd.lower.split())
        keyword_pts = len(jd_words & res_words) / len(jd_words) * P["keyword"] if jd_words else 0.0
    unique_words = len(res_words)
    length_pts = float(P["length"]) if 300 <= unique_words <= 800 else max(0.0, min(float(P["length"]), unique_words / 300 * P["length"]))
    penalty = len(missing) * P["missing_penalty_each"]
    # Title-only: no JD words to overlap, so the rubric is out of skill + length points.
    rubric_max = P["skill"] + P["length"] + (P["keyword"] if use_jd else 0)
    rubric = _clamp(skill_pts + (keyword_pts or 0.0) + length_pts - penalty, 0, rubric_max)
    rubric_norm = rubric / rubric_max * 100

    cw = HYBRID_COMBINE_WEIGHTS
    similarity: float | None = None
    if use_jd:
        emit(CALCULATING_SCORE, "TF-IDF similarity and weighted combination")
        similarity = tfidf_cosine(resume.lower, jd.lower) * 100
        overall = _clamp(cw["rubric"] * rubric_norm + cw["similarity"] * similarity)
        formula = (f"overall = {cw['rubric']}×(rubric/{rubric_max}×100) + {cw['similarity']}×tfidf%; "
                   f"rubric = skill {P['skill']} + keyword {P['keyword']} + length {P['length']} − {P['missing_penalty_each']}×missing")
    else:
        emit(CALCULATING_SCORE, "Rubric against the role profile")
        overall = rubric_norm
        formula = (f"overall = rubric/{rubric_max}×100; rubric = skill {P['skill']} + length {P['length']} "
                   f"− {P['missing_penalty_each']}×missing (keyword overlap and TF-IDF need a JD)")

    emit(GENERATING_REPORT, None)
    for c in missing:
        findings.append(_finding(f"skill.missing.{c}", "high", "skills", f"Missing {source} skill: {display_name(c)}",
                                 f"Costs {P['missing_penalty_each']} rubric points.",
                                 f"If you have {display_name(c)} experience, evidence it in a bullet."))
    if unique_words < 300:
        findings.append(_finding("content.length", "medium", "content", "Short resume",
                                 f"{unique_words} unique words; full length points start at 300.",
                                 "Add concrete detail to experience and projects."))
    if not required:
        findings.append(_finding("skill.none_in_jd", "medium", "skills", "No recognizable skills in the JD",
                                 "The skill category scores 0 when the JD lists no taxonomy skills (as in the reference).",
                                 "Paste the full JD including its requirements section."))
    breakdown = [
        {"key": "skill", "label": "Skill match", "score": round(skill_pts / P["skill"] * 100), "points": round(skill_pts, 1), "maxPoints": P["skill"], "parent": "rubric"},
        *([{"key": "keyword", "label": "Keyword overlap", "score": round(keyword_pts / P["keyword"] * 100), "points": round(keyword_pts, 1), "maxPoints": P["keyword"], "parent": "rubric"}]
          if keyword_pts is not None else []),
        {"key": "length", "label": "Length", "score": round(length_pts / P["length"] * 100), "points": round(length_pts, 1), "maxPoints": P["length"], "parent": "rubric"},
        {"key": "penalty", "label": "Missing-skill penalty", "points": -penalty, "parent": "rubric"},
        {"key": "rubric", "label": f"Rubric (normalized from /{rubric_max})", "score": round(rubric_norm, 1),
         "weight": cw["rubric"] if use_jd else 1.0, "contribution": round((cw["rubric"] if use_jd else 1.0) * rubric_norm, 1)},
        *([{"key": "similarity", "label": "TF-IDF similarity", "score": round(similarity, 1), "weight": cw["similarity"], "contribution": round(cw["similarity"] * similarity, 1)}]
          if similarity is not None else []),
    ]
    band = "Strong" if overall >= 75 else "Moderate" if overall >= 55 else "Weak"
    return _result(
        inp=inp, resume=resume, engine_id="hybrid_resume_analyzer", engine_name="Hybrid Resume Analyzer",
        profile_id="hybrid-resume-analyzer-adapted",
        score_type="hybrid_match" if use_jd else "role_match",
        score_name="Hybrid Match Score" if use_jd else "Hybrid Role Match",
        overall=overall, score_label=f"{band} {'hybrid' if use_jd else 'role'} match",
        formula=formula,
        reference="github.com/Anirodh-Padhy/resume-analyzer (MIT)",
        breakdown=breakdown,
        findings=findings,
        improvements=[{"priority": "high" if f["severity"] == "high" else "medium", "text": f["recommendation"], "reason": f["title"], "findingId": f["id"]}
                      for f in findings if f.get("recommendation")],
        scores={"requiredSkills": _r(skill_pts / P["skill"] * 100),
                "keywordCoverage": _r(keyword_pts / P["keyword"] * 100) if keyword_pts is not None else None},
        strengths=[f"{len(matched)}/{len(required)} {source} skills matched"] if matched else [],
        matched=_skill_rows(matched, "matched", "Found on resume"), missing=_skill_rows(missing, "missing"),
        metrics=[
            {"key": "rubric_total", "label": f"Rubric total (max {rubric_max})", "value": round(rubric, 1)},
            *([{"key": "tfidf", "label": "TF-IDF cosine similarity", "value": round(similarity, 1), "unit": "%"}] if similarity is not None else []),
            rule_metric,
        ],
        warnings=warnings,
        limitations=[
            *(["Combining rubric and similarity (70/30) is an Aavedak choice; the reference reports them separately.",
               "TF-IDF similarity is lexical, not semantic."] if use_jd else
              ["Title-only: required skills come from Aavedak's role profile (core + common); keyword overlap and TF-IDF are skipped and the rubric is out of 60."]),
            *common_limits,
            "As in the reference, resumes over 800 unique words still receive full length points.",
        ],
        blurb="Hybrid Resume Analyzer adaptation: rubric (skills, keywords, length, penalty) combined with TF-IDF similarity.",
    )


OSS_ENGINES: dict[str, tuple[str, EngineContract, Callable[[EngineInput, Emit], dict[str, Any]]]] = {
    "open_ats": ("Open ATS", OPEN_ATS_CONTRACT, run_open_ats),
    "ats_resume_checker": ("ATS Resume Checker", ATS_CHECKER_CONTRACT, run_ats_resume_checker),
    "resume_skills_extractor": ("Resume Skills Extractor", SKILLS_EXTRACTOR_CONTRACT, run_resume_skills_extractor),
    "hybrid_resume_analyzer": ("Hybrid Resume Analyzer", HYBRID_CONTRACT, run_hybrid_resume_analyzer),
}
