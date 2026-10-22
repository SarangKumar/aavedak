"""Shared result envelope for the engines that report a full profile (OSS + ATS platform).

The `AtsAnalysis` fields the web app reads are identical across these engines; only the
methodology version, the reference and the wording differ. Keeping one builder here means a new
engine family cannot drift from the contract documented in app/ats/ENGINES.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.ats.analyze import _fingerprint
from app.ats.pipeline import ParsedResume


@dataclass(frozen=True)
class EngineInput:
    resume_id: str
    resume_text: str
    jd_text: str
    role: str
    mode: str


def engine_result(
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
    profile_version: str,
    reference_label: str = "adapted from",
) -> dict[str, Any]:
    overall_i = max(0, min(100, int(round(overall))))
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
            "version": profile_version,
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
        "notes": [formula, f"profile {profile_id}@{profile_version} · {reference_label} {reference}"],
        "engine": "fastapi",
        "engineVersion": f"{profile_id}@{profile_version}",
        "textChars": len(resume.raw.strip()),
        "textFingerprint": _fingerprint(resume.raw),
        "blurb": blurb,
    }
