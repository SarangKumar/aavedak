"""ATS platform profiles (Greenhouse / Lever / Workable / iCIMS candidate-record readiness)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest

from app.ats.engine_runner import VALID_ENGINES, run_engine_profile, run_engine_staged
from app.ats.pipeline import EngineFailure
from app.ats.platform_profiles import (
    PLATFORM_ENGINES,
    PLATFORMS,
    _all_checks,
    extract_record,
)
from app.ats.reference_weights import PLATFORM_FIELD_WEIGHTS, PLATFORM_SEARCH_SHARE

CLEAN = """Sarang Kumar
Pune, Maharashtra | sarang@example.com | +91 98765 43210
linkedin.com/in/sarangkumar | github.com/sarangkumar

Summary
Backend engineer with 2 years building Python services.

Work Experience
Backend Engineer | Acme Technologies | Mar 2023 - Present
- Built FastAPI services in Python handling 40k requests/day, cutting p95 latency 35%.
- Migrated PostgreSQL schemas and automated deploys with Docker and GitHub Actions.
Software Engineer Intern | Nimbus Labs | Jun 2022 - Dec 2022
- Developed a Redis caching layer that reduced API response time by 28%.

Education
Pune Institute of Computer Technology
B.Tech in Computer Science, 2019 - 2023

Skills
Python, FastAPI, PostgreSQL, Docker, Redis, AWS, Git
"""

MESSY = """CURRICULUM VITAE
Aspiring technologist | reachme(at)example(dot)com

PROFILE
Passionate developer seeking opportunities.

EXPERIENCE
2021 - 2023   Worked on various web projects for several clients
2023 - Present  Freelancing on mobile apps

ACADEMICS
Graduated with distinction, 2021
"""

JD = """Backend Engineer
Requirements: 2+ years with Python, FastAPI, PostgreSQL, Docker and AWS.
Responsibilities: design REST APIs, improve latency, own deployments and monitoring.
"""

ENGINE_IDS = tuple(PLATFORM_ENGINES)


def _run(engine_id: str, resume: str, **kw) -> dict:
    return run_engine_profile(engine_id=engine_id, resume_text=resume, **kw)


def test_registered_and_contracted():
    assert set(ENGINE_IDS) == {p.engine_id for p in PLATFORMS}
    for engine_id in ENGINE_IDS:
        assert engine_id in VALID_ENGINES
        _name, contract, _run_fn = PLATFORM_ENGINES[engine_id]
        assert contract.modes == ("resume_only", "role_match", "job_match")
        assert contract.jd == "optional" and contract.title == "optional"


def test_every_weight_key_is_a_real_check():
    """A typo in the weight table would silently drop or KeyError a field."""
    checks = _all_checks(extract_record(CLEAN), "employments")
    for engine_id, weights in PLATFORM_FIELD_WEIGHTS.items():
        prefix = next(p.prefix for p in PLATFORMS if p.engine_id == engine_id)
        keys = set(_all_checks(extract_record(CLEAN), prefix))
        assert set(weights) <= keys, (engine_id, set(weights) - keys)
        assert abs(sum(weights.values()) - 1.0) < 1e-9
    assert "name" in checks


@pytest.mark.parametrize("engine_id", ENGINE_IDS)
def test_clean_resume_fills_the_record(engine_id: str):
    r = _run(engine_id, CLEAN, mode="resume_only")
    assert r["overallScore"] >= 90, r["findings"]
    assert r["scoreType"] == "parse_readiness"
    assert r["engineVersion"].endswith("@1.0")
    assert r["scores"]["keywordCoverage"] is None


@pytest.mark.parametrize("engine_id", ENGINE_IDS)
def test_unparseable_resume_scores_low_with_field_level_fixes(engine_id: str):
    r = _run(engine_id, MESSY, mode="resume_only")
    assert r["overallScore"] < 50
    assert r["findings"], "expected per-field findings"
    # Every finding must say what to change, and name the vendor's own field.
    for f in r["findings"]:
        assert f["recommendation"].strip()
        assert "“" in f["title"]
    assert all(i["text"].strip() for i in r["improvements"])


@pytest.mark.parametrize("engine_id", ENGINE_IDS)
def test_job_match_adds_search_coverage(engine_id: str):
    r = _run(engine_id, CLEAN, jd_text=JD, role="Backend Engineer", mode="job_match")
    assert r["scoreType"] == "application_readiness"
    assert r["scores"]["keywordCoverage"] is not None
    search = next(b for b in r["breakdown"] if b["key"] == "search_coverage")
    assert search["weight"] == PLATFORM_SEARCH_SHARE
    field_weight = sum(
        b["weight"] for b in r["breakdown"] if b.get("parent") == "Field coverage"
    )
    assert abs(field_weight - (1 - PLATFORM_SEARCH_SHARE)) < 0.01


@pytest.mark.parametrize("engine_id", ENGINE_IDS)
def test_role_match_without_jd(engine_id: str):
    r = _run(engine_id, CLEAN, role="Backend Engineer", mode="role_match")
    assert r["overallScore"] > 0
    assert r["scores"]["keywordCoverage"] is not None


def test_year_only_dates_hurt_greenhouse_not_lever():
    """Greenhouse stores start_date/end_date as month + year; Lever's parser stores no role dates."""
    year_only = CLEAN.replace("Mar 2023 - Present", "2023 - Present").replace(
        "Jun 2022 - Dec 2022", "2022 - 2022"
    )
    gh_full = _run("greenhouse_ats", CLEAN, mode="resume_only")["overallScore"]
    gh_year = _run("greenhouse_ats", year_only, mode="resume_only")["overallScore"]
    lever_full = _run("lever_ats", CLEAN, mode="resume_only")["overallScore"]
    lever_year = _run("lever_ats", year_only, mode="resume_only")["overallScore"]
    assert gh_year < gh_full - 5
    assert lever_year == lever_full


def test_missing_location_hurts_icims_and_lever_most():
    """Location leads the iCIMS profile and is one of Lever's seven parsed fields."""
    no_location = CLEAN.replace("Pune, Maharashtra | ", "")
    drops = {
        engine_id: _run(engine_id, CLEAN, mode="resume_only")["overallScore"]
        - _run(engine_id, no_location, mode="resume_only")["overallScore"]
        for engine_id in ENGINE_IDS
    }
    assert drops["icims_ats"] > drops["greenhouse_ats"]
    assert drops["lever_ats"] > drops["greenhouse_ats"]


def test_degree_without_discipline_is_reported():
    r = _run(
        "workable_ats",
        CLEAN.replace("B.Tech in Computer Science, 2019 - 2023", "B.Tech, 2019 - 2023"),
        mode="resume_only",
    )
    assert any(f["id"] == "field.education_field" for f in r["findings"])


@pytest.mark.parametrize("engine_id", ENGINE_IDS)
def test_limitations_are_honest(engine_id: str):
    r = _run(engine_id, CLEAN, mode="resume_only")
    joined = " ".join(r["limitations"]).lower()
    assert "not affiliated" in joined
    assert "aavedak estimate" in joined
    assert "heuristic" in joined


@pytest.mark.parametrize("engine_id", ENGINE_IDS)
def test_recommendations_never_ask_for_keywords(engine_id: str):
    r = _run(engine_id, MESSY, jd_text=JD, role="Backend Engineer", mode="job_match")
    for imp in r["improvements"]:
        low = imp["text"].lower()
        assert "add keywords" not in low
        assert "keyword stuff" not in low


@pytest.mark.parametrize("engine_id", ENGINE_IDS)
def test_stages_in_order_for_job_match(engine_id: str):
    seen: list[str] = []
    run_engine_staged(
        engine_id=engine_id,
        resume_text=CLEAN,
        jd_text=JD,
        role="Backend Engineer",
        mode="job_match",
        emit=lambda stage, message=None: seen.append(stage),
    )
    assert seen[0] == "validating_input"
    assert seen[1] == "parsing_resume"
    assert "parsing_job_description" in seen
    assert seen.index("calculating_score") < seen.index("generating_report")


@pytest.mark.parametrize("engine_id", ENGINE_IDS)
def test_too_little_text_is_a_typed_failure(engine_id: str):
    with pytest.raises(EngineFailure) as exc:
        run_engine_staged(engine_id=engine_id, resume_text="hi", mode="resume_only")
    assert exc.value.kind == "parsing_failure"


def test_deterministic():
    a = _run("greenhouse_ats", CLEAN, jd_text=JD, role="Backend Engineer", mode="job_match")
    b = _run("greenhouse_ats", CLEAN, jd_text=JD, role="Backend Engineer", mode="job_match")
    assert a["overallScore"] == b["overallScore"]
    assert a["textFingerprint"] == b["textFingerprint"]


def test_record_extraction_details():
    rec = extract_record(CLEAN)
    assert rec.name and rec.email and rec.phone and rec.linkedin and rec.github
    assert rec.location and rec.location.startswith("Pune")
    assert len(rec.roles) == 2
    assert all(r.has_title and r.has_company and r.has_month_year for r in rec.roles)
    assert sum(1 for r in rec.roles if r.is_current) == 1
    assert rec.school and rec.degree_level == 1 and rec.field_of_study
    assert rec.skills_section and "python" in rec.skills


def test_education_dates_are_not_employment_entries():
    """A degree's "2019 - 2023" must not become a third employment entry."""
    rec = extract_record(CLEAN)
    assert len(rec.roles) == 2
