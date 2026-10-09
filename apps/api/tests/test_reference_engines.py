"""Reference ATS engine profiles (FastAPI)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.ats.engine_runner import run_engine_profile
from app.ats.reference_signals import skillsyncer_degree_points
from app.ats.reference_weights import SKILLSYNCER_POINTS

SAMPLE_RESUME = """
Jane Doe
jane@example.com | +1 555 0100
EXPERIENCE
Backend Engineer — 2020 – Present
Built FastAPI services in Python with PostgreSQL cutting latency 30%.
SKILLS
Python, FastAPI, PostgreSQL, SQL, Docker
EDUCATION
B.S. Computer Science
"""

SAMPLE_JD = """
Backend Engineer
Requirements: Python, FastAPI, PostgreSQL, Docker, Kubernetes
Education: Bachelor's degree
"""


def test_skillsyncer_points_sum():
    p = SKILLSYNCER_POINTS
    assert p["hard"] + p["soft"] + p["other"] + p["title"] + p["degree"] == 100


def test_degree_points():
    assert skillsyncer_degree_points(0, 0) == 10
    assert skillsyncer_degree_points(2, 2) == 10
    assert skillsyncer_degree_points(1, 2) == 5


def test_reference_engines_fastapi():
    base = dict(resume_text=SAMPLE_RESUME, role="Backend Engineer", jd_text=SAMPLE_JD, resume_id="t1")
    for engine_id in (
        "jobscan_style",
        "resume_worded_style",
        "teal_style",
        "rezi_style",
        "skillsyncer_style",
    ):
        r = run_engine_profile(engine_id=engine_id, mode="job_match", **base)
        assert r["engine"] == "fastapi", engine_id
        assert 0 <= r["overallScore"] <= 100, engine_id


def test_teal_resume_only_path():
    r = run_engine_profile(
        engine_id="teal_style",
        resume_text=SAMPLE_RESUME,
        role="",
        jd_text="",
        mode="resume_only",
        resume_id="t2",
    )
    assert r["mode"] == "resume_only"
    assert r["scoreName"] == "Resume Score"
