"""Back-compat entrypoints — prefer app.ats.analyze.analyze_resume."""

from __future__ import annotations

from app.ats.analyze import analyze_resume


def score_resume(
    resume_text: str,
    *,
    jd_text: str = "",
    role: str = "",
    skills: list[str] | None = None,
    preferred_roles: list[str] | None = None,
):
    # skills / preferred_roles reserved for future profile fusion
    _ = skills, preferred_roles
    return analyze_resume(resume_text, jd_text=jd_text, role=role)


def score_resume_batch(
    resumes: list[dict],
    *,
    jd_text: str = "",
    role: str = "",
):
    results = []
    for row in resumes:
        results.append(
            analyze_resume(
                row.get("text") or "",
                jd_text=jd_text,
                role=role,
                resume_id=row.get("id") or "",
            )
        )
    return results
