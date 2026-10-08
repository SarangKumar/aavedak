from __future__ import annotations

from pydantic import BaseModel, Field


class ResumeInput(BaseModel):
    id: str = Field(..., min_length=1)
    text: str = ""


class ScoreRequest(BaseModel):
    resumeText: str = ""
    jdText: str = ""
    role: str = ""
    skills: list[str] = Field(default_factory=list)
    preferredRoles: list[str] = Field(default_factory=list)


class BatchScoreRequest(BaseModel):
    jdText: str = ""
    role: str = ""
    skills: list[str] = Field(default_factory=list)
    preferredRoles: list[str] = Field(default_factory=list)
    resumes: list[ResumeInput] = Field(default_factory=list)
