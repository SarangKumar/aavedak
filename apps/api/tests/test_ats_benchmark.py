"""ATS engine v2 calibration & regression tests."""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python -m pytest` from apps/api without install.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.ats.analyze import analyze_resume
from app.ats.benchmarks.fixtures import BACKEND_JD, EXPECTED_ORDER, ORDERING_CASES, STUFFED, EXCELLENT_BE
from app.ats.evidence import evidence_strength
from app.ats.resume_profile import parse_resume
from app.ats.version import ENGINE_VERSION


def _score(text: str, jd: str = BACKEND_JD, role: str = "Backend Engineer") -> dict:
    return analyze_resume(text, jd_text=jd, role=role)


def test_engine_version_present():
    r = _score(EXCELLENT_BE)
    assert r["engineVersion"] == ENGINE_VERSION
    assert r["engine"] == "fastapi"


def test_backend_jd_ordering():
    """Excellent > strong > moderate > skills_only ≥ stuffed > weak_fe > unrelated."""
    scores = {name: _score(text)["overallScore"] for name, text in ORDERING_CASES}
    # Print-friendly assert message
    ordered = sorted(scores.items(), key=lambda kv: -kv[1])
    names = [n for n, _ in ordered]

    assert scores["excellent"] > scores["strong"], scores
    assert scores["strong"] > scores["moderate"], scores
    assert scores["moderate"] > scores["skills_only"], scores
    assert scores["skills_only"] >= scores["stuffed"] - 3, scores  # stuffing must not win
    assert scores["stuffed"] < scores["strong"], scores
    assert scores["weak_fe"] < scores["moderate"], scores
    assert scores["unrelated"] < scores["weak_fe"], scores
    assert scores["excellent"] >= 70, scores
    assert scores["unrelated"] <= 45, scores
    # Stuffed must not beat genuine strong experience
    assert scores["stuffed"] < scores["strong"], scores
    assert names[0] == "excellent", names


def test_skills_only_weaker_than_professional():
    only = _score(ORDERING_CASES[3][1])  # skills_only
    strong = _score(ORDERING_CASES[1][1])
    assert only["scores"]["requiredSkills"] < strong["scores"]["requiredSkills"]
    assert only["overallScore"] < strong["overallScore"]


def test_evidence_levels_distinguish_list_vs_bullets():
    listed = parse_resume("SKILLS\nPython, FastAPI\n")
    demonstrated = parse_resume(
        "EXPERIENCE\nEngineer\nBuilt production FastAPI services in Python reducing latency 30%.\n"
        "SKILLS\nPython, FastAPI\n"
    )
    _, _, _, lvl_list = evidence_strength(listed, "python")
    _, _, _, lvl_demo = evidence_strength(demonstrated, "python")
    assert lvl_list <= 1
    assert lvl_demo >= 3


def test_deterministic():
    a = _score(EXCELLENT_BE)
    b = _score(EXCELLENT_BE)
    assert a["overallScore"] == b["overallScore"]
    assert a["textFingerprint"] == b["textFingerprint"]


def test_critical_gap_caps_keyword_stuffing():
    stuffed = _score(STUFFED)
    # Must not land in "excellent" band despite keyword density
    assert stuffed["overallScore"] < 70
    assert stuffed["scores"]["evidenceQuality"] is not None
    assert stuffed["scores"]["evidenceQuality"] < 70


def test_resume_only_mode_not_job_match():
    r = analyze_resume(EXCELLENT_BE)
    assert r["mode"] == "resume_only"
    assert r["scoreName"] == "Resume Quality Score"
    assert r["scores"].get("requiredSkills") is None


def test_improvements_never_ask_to_invent():
    r = _score(ORDERING_CASES[6][1])  # unrelated
    assert r["improvements"], "expected gap recommendations"
    for imp in r["improvements"]:
        low = imp["text"].lower()
        assert "add keywords" not in low
        assert "invent" in low or "genuine" in low or "if you have" in low


if __name__ == "__main__":
    # Quick manual runner without pytest
    scores = {name: _score(text)["overallScore"] for name, text in ORDERING_CASES}
    print("engine", ENGINE_VERSION)
    for name in EXPECTED_ORDER:
        print(f"  {name:12} {scores[name]}")
    test_backend_jd_ordering()
    test_evidence_levels_distinguish_list_vs_bullets()
    test_deterministic()
    print("ok")
