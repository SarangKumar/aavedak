"""POST /svc/v1/improve — revised resume, changes, gaps and before/after scores in one call."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ats.engine_runner import VALID_ENGINES
from app.ats.jd_input import CleanJdText
from app.improve.service import DEFAULT_ENGINES, improve, improve_and_score

router = APIRouter(prefix="/svc/v1/improve", tags=["improve"])


class ImproveRequest(BaseModel):
    resumeText: str = Field(..., min_length=1, max_length=200_000)
    role: str = Field(default="", max_length=200)
    jdText: CleanJdText = Field(default="", max_length=60_000)
    yearsExperience: float | None = Field(default=None, ge=0, le=60)
    # None = every safe change; a list = only these change ids (per-change accept/reject).
    accepted: list[str] | None = None
    engines: list[str] | None = None
    score: bool = True


@router.post("")
def improve_resume(body: ImproveRequest):
    if not body.role.strip():
        raise HTTPException(status_code=400, detail="A job title is required.")
    engines = tuple(body.engines) if body.engines else DEFAULT_ENGINES
    unknown = [e for e in engines if e not in VALID_ENGINES]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown engines: {', '.join(unknown)}")
    if not body.score:
        return improve(
            body.resumeText,
            role=body.role,
            jd_text=body.jdText,
            years_experience=body.yearsExperience,
            accepted=body.accepted,
        )
    return improve_and_score(
        body.resumeText,
        role=body.role,
        jd_text=body.jdText,
        years_experience=body.yearsExperience,
        accepted=body.accepted,
        engines=engines,
    )
