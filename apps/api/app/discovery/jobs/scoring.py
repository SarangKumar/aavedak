"""JD quality score for a stored posting ("how complete is this description?").

Port of `computeAtsScore` in apps/web/lib/job-scoring.ts, which scores jobs a user adds by
hand; keep both in sync (tests/test_discovery_jobs.py pins a few values). It says nothing
about the candidate — job → candidate matching is `match.py`.
"""

from __future__ import annotations

import math
import re
from typing import Any

_STOP = frozenset(
    "a an the and or to of in on for with at by from as is are be this that it you your we our "
    "will can have has was were been their they them not but if into over per via etc such using "
    "use used work working role job team years year experience including ability strong good".split()
)
def tokenize(text: str) -> list[str]:
    cleaned = re.sub(r"[^a-z0-9+#.\s-]", " ", (text or "").lower())
    return [t.strip() for t in re.split(r"[\s,/|;]+", cleaned) if len(t.strip()) >= 2 and t.strip() not in _STOP]


def _clamp(n: float) -> int:
    # JS Math.round semantics (half up), not Python's banker's rounding.
    return max(0, min(100, math.floor(n + 0.5)))


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
