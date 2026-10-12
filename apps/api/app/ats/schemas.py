from __future__ import annotations

from pydantic import BaseModel, Field


class ResumeInput(BaseModel):
    id: str = Field(..., min_length=1)
    text: str = ""


class ScoreRequest(BaseModel):
    resumeText: str = ""
    jdText: str = ""
    role: str = ""
    yearsExperience: float | None = Field(default=None, ge=0, le=60)
    skills: list[str] = Field(default_factory=list)
    preferredRoles: list[str] = Field(default_factory=list)


class BatchScoreRequest(BaseModel):
    jdText: str = ""
    role: str = ""
    yearsExperience: float | None = Field(default=None, ge=0, le=60)
    skills: list[str] = Field(default_factory=list)
    preferredRoles: list[str] = Field(default_factory=list)
    resumes: list[ResumeInput] = Field(default_factory=list)


class EngineScoreRequest(BaseModel):
    engineId: str = Field(..., min_length=1)
    resumeId: str = ""
    resumeText: str = ""
    jdText: str = ""
    role: str = ""
    yearsExperience: float | None = Field(default=None, ge=0, le=60)
    mode: str | None = None  # resume_only | role_match | job_match
    runId: str = ""  # echoed on streamed stage events so the client can drop stale updates
