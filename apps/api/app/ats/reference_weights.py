"""Configurable reference profile weights (Aavedak approximations — not vendor values)."""

JOBSCAN_WEIGHTS = {"hard": 45, "soft": 15, "other": 25, "title": 15}

RESUME_WORDED_WEIGHTS = {"impact": 0.3, "skills": 0.25, "wording": 0.25, "presentation": 0.2}

TEAL_JOB_MATCH_WEIGHTS = {"hard": 55, "keywords": 30, "title": 15}

REZI_WEIGHTS = {
    "content": 0.25,
    "format": 0.2,
    "optimization": 0.2,
    "best_practices": 0.2,
    "application_readiness": 0.15,
}

SKILLSYNCER_POINTS = {"hard": 60, "soft": 15, "other": 5, "title": 10, "degree": 10}
