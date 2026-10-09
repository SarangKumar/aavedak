"""Match + ATS heuristics used to rank recommendations.

Port of `computeCompatibilityScore` / `computeAtsScore` in apps/web/lib/job-scoring.ts so
the scores written to `job_scores` match what the web app computes for manual jobs.
Keep both in sync (tests/test_discovery_jobs.py pins a few values).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

_STOP = frozenset(
    "a an the and or to of in on for with at by from as is are be this that it you your we our "
    "will can have has was were been their they them not but if into over per via etc such using "
    "use used work working role job team years year experience including ability strong good".split()
)
_EXPERIENCE_MAP = {"0-1": 1, "1-3": 2, "3-5": 4, "5-8": 6, "8+": 9}


def tokenize(text: str) -> list[str]:
    cleaned = re.sub(r"[^a-z0-9+#.\s-]", " ", (text or "").lower())
    return [t.strip() for t in re.split(r"[\s,/|;]+", cleaned) if len(t.strip()) >= 2 and t.strip() not in _STOP]


def _clamp(n: float) -> int:
    # JS Math.round semantics (half up), not Python's banker's rounding.
    return max(0, min(100, math.floor(n + 0.5)))


@dataclass
class Career:
    skills: list[str] = field(default_factory=list)
    preferred_roles: list[str] = field(default_factory=list)
    preferred_locations: list[str] = field(default_factory=list)
    remote_preference: str | None = None
    experience_level: str | None = None
    industry_preference: str | None = None

    @property
    def has_signals(self) -> bool:
        return bool(self.skills or self.preferred_roles)


def ats_score(job: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    desc = job.get("description") or ""
    words = len(desc.split())
    checks = {
        "hasTitle": bool((job.get("title") or "").strip()),
        "hasCompany": bool((job.get("company") or "").strip()),
        "hasLocation": bool((job.get("location") or "").strip()),
        "hasUrl": bool((job.get("url") or "").strip()),
        "hasSalary": bool((job.get("salary") or "").strip()),
        "hasDescription": words >= 40,
        "hasRequirements": bool(re.search(r"requirement|qualification|must have|you.?ll need|skills?:", desc, re.I)),
        "hasResponsibilities": bool(
            re.search(r"responsibilit|what you.?ll do|you will|day.?to.?day|about the role", desc, re.I)
        ),
        "hasBulletOrLines": bool(re.search(r"(?:^|\n)\s*[•\-*●]|\n{2,}", desc)),
        "enoughLength": words >= 80,
    }
    weights = {
        "hasTitle": 8, "hasCompany": 6, "hasLocation": 4, "hasUrl": 4, "hasSalary": 4,
        "hasDescription": 12, "hasRequirements": 16, "hasResponsibilities": 12,
        "hasBulletOrLines": 8, "enoughLength": 10,
    }
    score = 20 + sum(w for k, w in weights.items() if checks[k])
    unique_tokens = len(set(tokenize(desc)))
    if unique_tokens >= 40:
        score += 8
    elif unique_tokens >= 20:
        score += 4
    return _clamp(score), {"checks": checks, "wordCount": words, "uniqueTokens": unique_tokens}


def compatibility_score(job: dict[str, Any], career: Career, resume_text: str) -> tuple[int, dict[str, Any]]:
    title = job.get("title") or ""
    location = job.get("location") or ""
    description = job.get("description") or ""
    jd = f"{title}\n{job.get('company') or ''}\n{location}\n{description}\n{job.get('salary') or ''}"
    jd_lower = jd.lower()
    jd_tokens = set(tokenize(jd))

    skill_hits = [
        s for s in career.skills if any(p in jd_tokens for p in tokenize(s)) or s.lower() in jd_lower
    ]
    role_hits = [
        r for r in career.preferred_roles if any(p in jd_tokens for p in tokenize(r)) or r.lower() in title.lower()
    ]
    location_hits = [
        loc for loc in career.preferred_locations if loc.lower() in location.lower() or loc.lower() == "remote"
    ]
    if career.remote_preference == "remote" and re.search(r"remote", location, re.I):
        location_hits.append("remote")

    resume_tokens = list(dict.fromkeys(tokenize(resume_text)))
    resume_overlap = [t for t in resume_tokens if t in jd_tokens]

    score = 12.0
    skill_ratio = len(skill_hits) / len(career.skills) if career.skills else 0
    score += skill_ratio * 38
    score += min(18, len(role_hits) * 9)
    score += min(12, len(location_hits) * 6)
    if resume_tokens:
        overlap_ratio = len(resume_overlap) / max(12, min(len(resume_tokens), 80))
        score += min(28, overlap_ratio * 40)
    elif not career.skills:
        soft = sum(1 for t in tokenize(title) if t in jd_tokens)
        score += min(10, soft * 2)

    if career.experience_level:
        match = re.search(r"(\d+)\+?\s*\+?\s*years?", description, re.I)
        if match:
            needed = int(match.group(1))
            have = _EXPERIENCE_MAP.get(career.experience_level, 0)
            if have >= needed:
                score += 8
            elif have >= needed - 1:
                score += 4

    return _clamp(score), {
        "skillHits": skill_hits,
        "roleHits": role_hits,
        "locationHits": location_hits,
        "resumeOverlapCount": len(resume_overlap),
        "resumeTokenCount": len(resume_tokens),
    }
