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


# ── Documented-behaviour checks (Jobscan tutorial, Rezi docs) ───────────────────────────────────

def _score(engine_id: str, resume: str, jd: str, role: str = "Backend Engineer", mode: str = "job_match") -> dict:
    return run_engine_profile(engine_id=engine_id, resume_text=resume, role=role, jd_text=jd, resume_id="t", mode=mode)


def test_jobscan_weights_follow_documented_priority():
    from app.ats.reference_weights import JOBSCAN_WEIGHTS as w

    assert w["hard"] > w["education"] > 0
    assert w["hard"] > w["title"] > w["soft"] > w["other"]


def test_jobscan_education_counts_only_for_advanced_degree():
    # Bachelor's in the JD: no education category, so a resume without a degree isn't penalised for it.
    r = _score("jobscan_style", SAMPLE_RESUME.replace("B.S. Computer Science", ""), SAMPLE_JD)
    assert "education" not in " ".join(r["notes"]).split("renormalised")[0]
    masters_jd = SAMPLE_JD.replace("Bachelor's degree", "Master's degree")
    with_degree = _score("jobscan_style", SAMPLE_RESUME.replace("B.S.", "M.S."), masters_jd)
    without = _score("jobscan_style", SAMPLE_RESUME.replace("B.S. Computer Science", ""), masters_jd)
    assert with_degree["overallScore"] > without["overallScore"]


def test_jobscan_frequent_hard_skills_weigh_more():
    jd = "Backend Engineer. Python Python Python Python Docker."
    has_python = _score("jobscan_style", "Jane Doe\nSKILLS\nPython", jd)
    has_docker = _score("jobscan_style", "Jane Doe\nSKILLS\nDocker", jd)
    assert has_python["overallScore"] > has_docker["overallScore"]


def test_rezi_audits_flag_documented_problems():
    bad = SAMPLE_RESUME + "\nI am a team player. My dynamic work was done by me.\n"
    good = _score("rezi_style", SAMPLE_RESUME, SAMPLE_JD)
    worse = _score("rezi_style", bad, SAMPLE_JD)
    assert worse["overallScore"] <= good["overallScore"]


def test_resume_worded_reports_impact_brevity_style():
    r = _score("resume_worded_style", SAMPLE_RESUME, "", mode="resume_only", role="")
    assert {"evidenceQuality", "experienceQuality", "structureFormatting"} <= set(r["scores"])


def test_native_quality_penalises_hedging_and_pronouns():
    from app.ats.analyze import analyze_resume

    plain = analyze_resume(SAMPLE_RESUME)["overallScore"]
    hedgy = analyze_resume(
        SAMPLE_RESUME + "\nI was responsible for various things. Worked on stuff and helped with tasks. My team player work.\n"
    )["overallScore"]
    assert hedgy < plain


def test_jobscan_uses_domain_phrases_when_jd_has_few_software_skills():
    # Mechanical-engineering JD: the software taxonomy finds nothing, but Jobscan still lists many
    # hard-skill gaps, so shared domain phrases must count (a software resume used to score ~2).
    jd = (
        "Product development, project management, engineering drawings, design standards, testing and "
        "calibration, data analytics, quality and reliability for diesel fuel injection systems."
    )
    resume = "Jane Doe\nSKILLS\nProduct development, project management, data analytics, testing, design"
    unrelated = "Jane Doe\nSKILLS\nGardening, cooking"
    close = _score("jobscan_style", resume, jd, role="")
    far = _score("jobscan_style", unrelated, jd, role="")
    assert close["overallScore"] > far["overallScore"] + 20
