from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.ats.analyze import analyze_resume, detect_mode
from app.ats.schemas import BatchScoreRequest, ScoreRequest

router = APIRouter(prefix="/svc/v1/ats", tags=["ats"])


@router.get("/health")
def ats_health():
    return {"ok": True, "service": "ats", "engine": "fastapi"}


@router.post("/score")
def score_one(body: ScoreRequest):
    if not (body.resumeText or "").strip():
        raise HTTPException(status_code=400, detail="resumeText is required.")
    return analyze_resume(
        body.resumeText,
        jd_text=body.jdText,
        role=body.role,
    )


@router.post("/score-batch")
def score_batch(body: BatchScoreRequest):
    if not body.resumes:
        raise HTTPException(status_code=400, detail="resumes is required.")

    mode = detect_mode(body.role, body.jdText)
    results = []
    for resume in body.resumes:
        scored = analyze_resume(
            resume.text,
            jd_text=body.jdText,
            role=body.role,
            resume_id=resume.id,
        )
        results.append(scored)
    return {"results": results, "engine": "fastapi", "mode": mode}
