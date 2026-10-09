"""Dispatch ATS scoring to native, reference, or open-source-adapted engines (FastAPI)."""

from __future__ import annotations

import logging

from fastapi import HTTPException

from app.ats.analyze import analyze_resume, detect_mode
from app.ats.oss_profiles import OSS_ENGINES, EngineInput
from app.ats.pipeline import (
    ANALYSIS_FAILURE,
    CALCULATING_SCORE,
    VALIDATING_INPUT,
    Emit,
    EngineFailure,
    no_emit,
    resolve_mode,
)
from app.ats.reference_profiles import (
    run_jobscan_style,
    run_rezi_style,
    run_resume_worded_style,
    run_skillsyncer_style,
    run_teal_style,
)

logger = logging.getLogger("aavedak.ats")

LEGACY_ENGINES = frozenset(
    {
        "aavedak",
        "jobscan_style",
        "resume_worded_style",
        "teal_style",
        "rezi_style",
        "skillsyncer_style",
    }
)
VALID_ENGINES = LEGACY_ENGINES | frozenset(OSS_ENGINES)


def _run_legacy(engine_id: str, rid: str, resume_text: str, jd_text: str, role: str, mode: str | None) -> dict:
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
    return run_skillsyncer_style(rid, resume_text, role, jd_text)


def run_engine_staged(
    *,
    engine_id: str,
    resume_text: str,
    jd_text: str = "",
    role: str = "",
    mode: str | None = None,
    resume_id: str = "",
    emit: Emit = no_emit,
) -> dict:
    """Run one engine, reporting stages through `emit`. Raises EngineFailure on input/analysis failure."""
    rid = resume_id or "local"
    emit(VALIDATING_INPUT, None)
    if engine_id in LEGACY_ENGINES:
        # Legacy engines parse and score in one call — report that honestly as one stage.
        emit(CALCULATING_SCORE, None)
        return _run_legacy(engine_id, rid, resume_text, jd_text, role, mode)

    name, contract, run = OSS_ENGINES[engine_id]
    resolved = resolve_mode(contract, engine_name=name, role=role, jd_text=jd_text, mode=mode)
    try:
        return run(EngineInput(rid, resume_text, jd_text, role, resolved), emit)
    except EngineFailure:
        raise
    except Exception as exc:  # noqa: BLE001 — surface as a typed failure, keep other combos running
        logger.exception("engine %s failed", engine_id)
        raise EngineFailure(ANALYSIS_FAILURE, f"{name} analysis failed.") from exc


def run_engine_profile(
    *,
    engine_id: str,
    resume_text: str,
    jd_text: str = "",
    role: str = "",
    mode: str | None = None,
    resume_id: str = "",
) -> dict:
    """Synchronous JSON contract used by POST /score-engine."""
    if engine_id not in VALID_ENGINES:
        raise HTTPException(status_code=400, detail=f"Unknown engine: {engine_id}")
    if not (resume_text or "").strip():
        raise HTTPException(status_code=400, detail="resumeText is required.")
    try:
        return run_engine_staged(
            engine_id=engine_id,
            resume_text=resume_text,
            jd_text=jd_text,
            role=role,
            mode=mode,
            resume_id=resume_id,
        )
    except EngineFailure as failure:
        raise HTTPException(
            status_code=422, detail={"failureKind": failure.kind, "message": failure.message}
        ) from failure


__all__ = ["VALID_ENGINES", "run_engine_profile", "run_engine_staged", "detect_mode"]
