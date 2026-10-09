"""Dispatch ATS scoring to native or reference engines (FastAPI)."""

from __future__ import annotations

from fastapi import HTTPException

from app.ats.analyze import analyze_resume
from app.ats.reference_profiles import (
    run_jobscan_style,
    run_rezi_style,
    run_resume_worded_style,
    run_skillsyncer_style,
    run_teal_style,
)

VALID_ENGINES = frozenset(
    {
        "aavedak",
        "jobscan_style",
        "resume_worded_style",
        "teal_style",
        "rezi_style",
        "skillsyncer_style",
    }
)


def run_engine_profile(
    *,
    engine_id: str,
    resume_text: str,
    jd_text: str = "",
    role: str = "",
    mode: str | None = None,
    resume_id: str = "",
) -> dict:
    if engine_id not in VALID_ENGINES:
        raise HTTPException(status_code=400, detail=f"Unknown engine: {engine_id}")
    if not (resume_text or "").strip():
        raise HTTPException(status_code=400, detail="resumeText is required.")

    rid = resume_id or "local"

    if engine_id == "aavedak":
        return analyze_resume(resume_text, jd_text=jd_text, role=role, resume_id=rid)

    if engine_id == "jobscan_style":
        return run_jobscan_style(rid, resume_text, role, jd_text)
    if engine_id == "resume_worded_style":
        return run_resume_worded_style(rid, resume_text, role, jd_text, mode=mode)
    if engine_id == "teal_style":
        return run_teal_style(rid, resume_text, role, jd_text, mode=mode)
    if engine_id == "rezi_style":
        return run_rezi_style(rid, resume_text, role, jd_text, mode=mode)
    if engine_id == "skillsyncer_style":
        return run_skillsyncer_style(rid, resume_text, role, jd_text)

    raise HTTPException(status_code=400, detail=f"Unsupported engine: {engine_id}")
