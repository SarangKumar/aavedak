"""Pasted job descriptions are cleaned before any ATS or Improve engine runs."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.ats import router as ats_router
from app.ats.jd_input import clean_jd_text
from app.improve import router as improve_router
from main import app

FIXTURE = (Path(__file__).parent / "fixtures" / "pasted_jd_with_boilerplate.txt").read_text(encoding="utf-8")
BOILERPLATE = ("equal opportunity", "gender identity", "privacy", "personal data", "gdpr", "cookies",
               "data protection", "all rights reserved", "share this job")
REQUIREMENTS = ("Python or Go", "PostgreSQL", "Kafka", "4+ years", "Kubernetes", "AWS, Docker")

client = TestClient(app)


def assert_clean(text: str) -> None:
    low = text.lower()
    assert not [b for b in BOILERPLATE if b in low], text
    assert all(r in text for r in REQUIREMENTS)


def test_cleaner_drops_boilerplate_and_keeps_requirements():
    assert_clean(clean_jd_text(FIXTURE))
    # Clean text and empty input pass through unchanged.
    once = clean_jd_text(FIXTURE)
    assert clean_jd_text(once) == once
    assert clean_jd_text("") == "" and clean_jd_text("   ") == "   "


def test_ats_engine_request_gets_the_cleaned_jd(monkeypatch):
    seen: dict[str, str] = {}

    def fake(**kwargs):
        seen["jd"] = kwargs["jd_text"]
        return {"score": 1}

    monkeypatch.setattr(ats_router, "run_engine_profile", fake)
    res = client.post("/svc/v1/ats/score-engine",
                      json={"engineId": "aavedak", "resumeText": "Python engineer", "jdText": FIXTURE})
    assert res.status_code == 200
    assert_clean(seen["jd"])


def test_ats_stream_request_gets_the_cleaned_jd(monkeypatch):
    seen: dict[str, str] = {}

    def fake(**kwargs):
        seen["jd"] = kwargs["jd_text"]
        return {"score": 1}

    monkeypatch.setattr(ats_router, "run_engine_staged", fake)
    res = client.post("/svc/v1/ats/score-engine/stream",
                      json={"engineId": "aavedak", "resumeText": "Python engineer", "jdText": FIXTURE})
    assert res.status_code == 200 and '"type": "result"' in res.text
    assert_clean(seen["jd"])


def test_improve_request_gets_the_cleaned_jd(monkeypatch):
    seen: dict[str, str] = {}

    def fake(resume_text, **kwargs):
        seen["jd"] = kwargs["jd_text"]
        return {"ok": True}

    monkeypatch.setattr(improve_router, "improve_and_score", fake)
    res = client.post("/svc/v1/improve",
                      json={"resumeText": "Jane\nPython engineer", "role": "Backend Engineer", "jdText": FIXTURE})
    assert res.status_code == 200
    assert_clean(seen["jd"])


RESUME = ("Jane Doe\nBackend Engineer\nExperience\nAcme, Backend Engineer, 2020 - 2025\n"
          "- Built Python and Go services on Kubernetes and AWS\n"
          "Skills\nPython, Go, PostgreSQL, Kafka, Kubernetes, AWS, Docker\n")


def _missing(result: dict) -> set[str]:
    out = set()
    for m in result.get("missingSkills") or []:
        out.add((m if isinstance(m, str) else str(m.get("name") or m.get("skill") or m)).lower())
    return out


def test_boilerplate_no_longer_counts_as_requirements():
    """Without cleaning, keyword engines read the privacy / EEO / cookie text as requirements."""
    from app.ats.engine_runner import run_engine_profile

    for engine in ("ats_resume_checker", "hybrid_resume_analyzer", "resume_skills_extractor"):
        body = {"engineId": engine, "resumeText": RESUME, "role": "Backend Engineer", "jdText": FIXTURE}
        res = client.post("/svc/v1/ats/score-engine", json=body)
        assert res.status_code == 200
        via_api = res.json()
        expected = run_engine_profile(engine_id=engine, resume_text=RESUME, jd_text=clean_jd_text(FIXTURE),
                                      role="Backend Engineer", mode=None, resume_id="", years_experience=None)
        uncleaned = run_engine_profile(engine_id=engine, resume_text=RESUME, jd_text=FIXTURE,
                                       role="Backend Engineer", mode=None, resume_id="", years_experience=None)
        assert via_api["overallScore"] == expected["overallScore"], engine
        assert _missing(via_api) == _missing(expected), engine
        assert (uncleaned["overallScore"], _missing(uncleaned)) != (via_api["overallScore"], _missing(via_api)), engine
        assert not {"privacy", "cookies", "gender", "accommodation"} & _missing(via_api), engine
