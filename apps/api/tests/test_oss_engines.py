"""Open-source-adapted ATS engines, shared pipeline, TF-IDF, and stage streaming."""

from __future__ import annotations

import dataclasses
import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.ats.engine_runner import VALID_ENGINES, run_engine_profile, run_engine_staged
from app.ats.oss_profiles import OSS_ENGINES
from app.ats.pipeline import (
    MISSING_INPUT,
    PARSING_FAILURE,
    UNSUPPORTED_MODE,
    EngineFailure,
    parse_jd_shared,
    parse_resume_shared,
)
from app.ats.reference_weights import (
    ATS_CHECKER_WEIGHTS,
    HYBRID_COMBINE_WEIGHTS,
    OPEN_ATS_CATEGORY_WEIGHTS,
    OPEN_ATS_KEYWORD_WEIGHTS,
    SKILLS_EXTRACTOR_WEIGHTS,
)
from app.ats.text_similarity import tfidf_cosine
from app.main import app

RESUME = """Jane Doe
jane@example.com | +1 555 0100 | linkedin.com/in/janedoe | github.com/janedoe
SUMMARY
Backend engineer focused on reliable APIs.
EXPERIENCE
Backend Engineer, Acme — Jan 2020 – Present
- Built FastAPI services in Python with PostgreSQL, cutting p95 latency 30%.
- Led migration of 12 services to Docker and Kubernetes (k8s).
- Reduced cloud spend 18% by consolidating workloads on AWS.
SKILLS
Python, FastAPI, PostgreSQL, SQL, Docker, Kubernetes, AWS
EDUCATION
Bachelor of Science in Computer Science, 2019
"""

JD = """Backend Engineer
Requirements: Python, FastAPI, PostgreSQL, Docker, Kubernetes, Kafka.
Python experience is essential. Strong communication and collaboration.
Education: Bachelor's degree.
"""

NEW = ("open_ats", "ats_resume_checker", "resume_skills_extractor", "hybrid_resume_analyzer")


def _run(engine_id: str, **kw):
    stages: list[str] = []
    args = {"resume_text": RESUME, "jd_text": JD, "role": "Backend Engineer", **kw}
    result = run_engine_staged(engine_id=engine_id, emit=lambda s, m=None: stages.append(s), **args)
    return result, stages


# ── Registry & contracts ────────────────────────────────────────────────────


def test_registry_has_four_new_unique_engines():
    assert set(NEW) <= VALID_ENGINES
    assert set(OSS_ENGINES) == set(NEW)
    assert len(VALID_ENGINES) == 10
    assert len({name for name, _c, _f in OSS_ENGINES.values()}) == 4


@pytest.mark.parametrize(
    "engine_id,modes",
    [
        ("open_ats", ("resume_only", "role_match", "job_match")),
        ("ats_resume_checker", ("resume_only", "role_match", "job_match")),
        ("resume_skills_extractor", ("role_match", "job_match")),
        ("hybrid_resume_analyzer", ("resume_only", "role_match", "job_match")),
    ],
)
def test_supported_modes(engine_id, modes):
    assert OSS_ENGINES[engine_id][1].modes == modes


@pytest.mark.parametrize(
    "engine_id,expected",
    [
        ("open_ats", {"resume_only": "resume_quality", "role_match": "ats_scan", "job_match": "ats_scan"}),
        ("ats_resume_checker", {"resume_only": "resume_quality", "role_match": "ats_readiness", "job_match": "ats_readiness"}),
        ("resume_skills_extractor", {"role_match": "role_match", "job_match": "skill_similarity_match"}),
        ("hybrid_resume_analyzer", {"resume_only": "resume_validation", "role_match": "role_match", "job_match": "hybrid_match"}),
    ],
)
def test_runs_without_jd_or_role_where_supported(engine_id, expected):
    inputs = {"resume_only": ("", ""), "role_match": ("Backend Engineer", ""), "job_match": ("Backend Engineer", JD)}
    for mode, score_type in expected.items():
        role, jd = inputs[mode]
        r, _ = _run(engine_id, role=role, jd_text=jd)
        assert (r["mode"], r["scoreType"]) == (mode, score_type), (engine_id, mode)
        assert 0 <= r["overallScore"] <= 100


def test_skills_extractor_has_no_resume_only_score():
    with pytest.raises(EngineFailure) as exc:
        run_engine_staged(engine_id="resume_skills_extractor", resume_text=RESUME)
    assert exc.value.kind == UNSUPPORTED_MODE


@pytest.mark.parametrize("engine_id", ["open_ats", "resume_skills_extractor", "hybrid_resume_analyzer"])
def test_unknown_title_without_jd_is_missing_input(engine_id):
    with pytest.raises(EngineFailure) as exc:
        run_engine_staged(engine_id=engine_id, resume_text=RESUME, role="Pastry Chef")
    assert exc.value.kind == MISSING_INPUT and "Pastry Chef" in exc.value.message


def test_checker_unknown_title_completes_with_warning():
    r, _ = _run("ats_resume_checker", role="Pastry Chef", jd_text="")
    assert r["warnings"] and "keywordMatch" not in {b["key"] for b in r["breakdown"]}


def test_unsupported_mode_is_explicit():
    with pytest.raises(EngineFailure) as exc:
        run_engine_staged(engine_id="resume_skills_extractor", resume_text=RESUME, jd_text=JD, mode="resume_only")
    assert exc.value.kind == UNSUPPORTED_MODE


def test_hybrid_requires_more_than_20_jd_chars():
    with pytest.raises(EngineFailure) as exc:
        run_engine_staged(engine_id="hybrid_resume_analyzer", resume_text=RESUME, jd_text="Python dev")
    assert exc.value.kind == MISSING_INPUT


@pytest.mark.parametrize("engine_id", NEW)
@pytest.mark.parametrize("text", ["", "   ", "@@@ ### !!!", "short"])
def test_empty_or_malformed_resume_is_parsing_failure(engine_id, text):
    if not text.strip():
        with pytest.raises(HTTPException):
            run_engine_profile(engine_id=engine_id, resume_text=text, jd_text=JD)
        return
    with pytest.raises(EngineFailure) as exc:
        run_engine_staged(engine_id=engine_id, resume_text=text, jd_text=JD, role="Backend Engineer")
    assert exc.value.kind == PARSING_FAILURE


def test_sync_endpoint_maps_failure_to_422_with_kind():
    with pytest.raises(HTTPException) as exc:
        run_engine_profile(engine_id="open_ats", resume_text=RESUME, role="Pastry Chef")
    assert exc.value.status_code == 422
    assert exc.value.detail["failureKind"] == MISSING_INPUT


# ── Result schema & formulas ────────────────────────────────────────────────


@pytest.mark.parametrize("engine_id", NEW)
def test_result_schema_is_explainable(engine_id):
    r, _ = _run(engine_id)
    for key in ("engineId", "engineName", "scoreType", "scoreScale", "methodology", "breakdown", "findings", "limitations"):
        assert key in r, key
    assert r["engineId"] == engine_id
    assert 0 <= r["overallScore"] <= 100
    assert r["methodology"]["version"] and r["methodology"]["formula"]
    assert all(f["severity"] in ("critical", "high", "medium", "low", "info") for f in r["findings"])
    ids = {f["id"] for f in r["findings"]}
    assert all(i.get("findingId") in ids for i in r["improvements"] if "findingId" in i)


def test_scores_are_distinct_and_score_types_differ():
    results = {e: _run(e)[0] for e in NEW}
    assert len({r["scoreType"] for r in results.values()}) == 4
    assert len({r["overallScore"] for r in results.values()}) >= 3


def test_deterministic():
    assert _run("ats_resume_checker")[0] == _run("ats_resume_checker")[0]


def test_open_ats_formula():
    r, _ = _run("open_ats")
    b = {row["key"]: row for row in r["breakdown"]}
    kw = sum(OPEN_ATS_KEYWORD_WEIGHTS[k] * b[f"keyword.{k}"]["score"] for k in OPEN_ATS_KEYWORD_WEIGHTS)
    assert math.isclose(kw, b["keyword"]["score"], abs_tol=0.3)
    overall = sum(OPEN_ATS_CATEGORY_WEIGHTS[k] * b[k]["score"] for k in OPEN_ATS_CATEGORY_WEIGHTS)
    assert abs(round(overall) - r["overallScore"]) <= 1
    # JD hard skills: python, fastapi, postgresql, docker, kubernetes, kafka → 5/6 matched
    assert math.isclose(b["keyword.hard"]["score"], 100 * 5 / 6, abs_tol=0.1)
    assert [m["canonical"] for m in r["missingSkills"]] == ["kafka"]


def test_open_ats_resume_only_reweights_formatting_and_content():
    r, _ = _run("open_ats", role="", jd_text="")
    b = {row["key"]: row for row in r["breakdown"]}
    assert set(b) == {"formatting", "content_quality"}
    assert b["formatting"]["weight"] == b["content_quality"]["weight"] == 0.5
    assert abs(round(0.5 * b["formatting"]["score"] + 0.5 * b["content_quality"]["score"]) - r["overallScore"]) <= 1


def test_open_ats_role_match_uses_hard_and_action_only():
    r, _ = _run("open_ats", jd_text="")
    subs = {row["key"] for row in r["breakdown"] if row.get("parent") == "keyword"}
    assert subs == {"keyword.hard", "keyword.action"}
    w = {row["key"]: row["weight"] for row in r["breakdown"] if row.get("parent") == "keyword"}
    assert math.isclose(w["keyword.hard"], 0.50 / 0.65, abs_tol=1e-3)


def test_skills_extractor_role_mode_has_no_similarity():
    r, _ = _run("resume_skills_extractor", jd_text="")
    assert [row["key"] for row in r["breakdown"]] == ["keyword"]
    assert not any(m["key"].startswith("tfidf") for m in r["metrics"])
    assert r["overallScore"] == r["breakdown"][0]["score"]


def test_hybrid_resume_only_is_rule_validation_score():
    r, stages = _run("hybrid_resume_analyzer", role="", jd_text="")
    assert r["overallScore"] == sum(row["points"] for row in r["breakdown"])
    assert "matching_keywords" not in stages and "parsing_job_description" not in stages
    assert any("not a quality or match score" in l for l in r["limitations"])


def test_hybrid_role_mode_rubric_out_of_60():
    r, _ = _run("hybrid_resume_analyzer", jd_text="")
    assert "keyword" not in {row["key"] for row in r["breakdown"]}
    assert any("max 60" in m["label"] for m in r["metrics"])


def test_open_ats_present_is_not_a_date_inconsistency():
    r, _ = _run("open_ats")
    assert not any(f["id"] == "formatting.date_inconsistency" for f in r["findings"])
    mixed = RESUME.replace("Jan 2020 – Present", "2018-03 – Dec 2019\nAcme — Jan 2020 – Present")
    r2, _ = _run("open_ats", resume_text=mixed)
    assert any(f["id"] == "formatting.date_inconsistency" for f in r2["findings"])


def test_ats_checker_weights_and_resume_only_separation():
    assert math.isclose(sum(ATS_CHECKER_WEIGHTS.values()), 1.0)
    job, _ = _run("ats_resume_checker")
    assert job["scoreType"] == "ats_readiness"
    assert abs(sum(row["contribution"] for row in job["breakdown"]) - job["overallScore"]) <= 1
    only, _ = _run("ats_resume_checker", jd_text="", role="")
    assert only["mode"] == "resume_only" and only["scoreType"] == "resume_quality"
    assert "keywordMatch" not in {row["key"] for row in only["breakdown"]}
    assert only["scores"]["keywordCoverage"] is None
    assert math.isclose(sum(row["weight"] for row in only["breakdown"]), 1.0, abs_tol=1e-3)


def test_ats_checker_role_match_uses_role_skills():
    r, _ = _run("ats_resume_checker", jd_text="")
    assert r["mode"] == "role_match"
    assert any(m["key"] == "keyword_match" for m in r["metrics"])


def test_skills_extractor_formula_and_categories():
    r, _ = _run("resume_skills_extractor")
    b = {row["key"]: row for row in r["breakdown"]}
    w = SKILLS_EXTRACTOR_WEIGHTS
    assert r["overallScore"] == round(b["tfidf"]["score"] * w["tfidf"] + b["keyword"]["score"] * w["keyword"])
    assert b["keyword"]["score"] == round(100 * 5 / 6)
    raw = next(m for m in r["metrics"] if m["key"] == "tfidf_raw")
    assert raw["unit"] == "%"  # similarity reported separately from the blended score
    cats = {c["category"]: c for c in r["skillCategories"]}
    assert "Kafka" in cats["Data / ML"]["missing"]


def test_hybrid_formula_and_no_ml_claim():
    r, _ = _run("hybrid_resume_analyzer")
    b = {row["key"]: row for row in r["breakdown"]}
    w = HYBRID_COMBINE_WEIGHTS
    expected = w["rubric"] * b["rubric"]["score"] + w["similarity"] * b["similarity"]["score"]
    assert abs(round(expected) - r["overallScore"]) <= 1
    assert b["penalty"]["points"] == -2  # one missing skill (kafka)
    assert any("No machine-learning model" in l for l in r["limitations"])


def test_synonym_and_duplicate_keywords():
    jd = "Requirements: k8s, Kubernetes, kubernetes, Postgres, python, Python"
    r, _ = _run("resume_skills_extractor", jd_text=jd)
    matched = sorted(m["canonical"] for m in r["matchedSkills"])
    assert matched == ["kubernetes", "postgresql", "python"]  # synonyms collapse, duplicates count once
    assert r["missingSkills"] == []


def test_flattened_pdf_text_still_parses():
    flattened = " ".join(RESUME.split())  # PDF extraction often loses newlines
    for e in NEW:
        r, _ = _run(e, resume_text=flattened)
        assert 0 <= r["overallScore"] <= 100


# ── Shared parsing isolation ────────────────────────────────────────────────


def test_shared_parse_is_cached_and_immutable():
    a = parse_resume_shared(RESUME)
    assert parse_resume_shared(RESUME) is a
    with pytest.raises(dataclasses.FrozenInstanceError):
        a.hard_skills = ()  # type: ignore[misc]
    assert isinstance(a.hard_skills, tuple) and isinstance(a.bullets, tuple)
    before = dataclasses.asdict(a)
    jd_before = dataclasses.asdict(parse_jd_shared(JD, "Backend Engineer"))
    for e in NEW:
        _run(e)
    assert dataclasses.asdict(parse_resume_shared(RESUME)) == before
    assert dataclasses.asdict(parse_jd_shared(JD, "Backend Engineer")) == jd_before


# ── Stages ──────────────────────────────────────────────────────────────────


def test_stage_paths_follow_real_work():
    _, open_ats = _run("open_ats")
    assert open_ats[0] == "validating_input" and open_ats[-1] == "generating_report"
    assert open_ats.index("parsing_resume") < open_ats.index("matching_keywords") < open_ats.index("calculating_score")
    _, only = _run("ats_resume_checker", jd_text="", role="")
    assert "parsing_job_description" not in only and "matching_keywords" not in only
    _, legacy = _run("jobscan_style")
    assert legacy == ["validating_input", "calculating_score"]


def _stream(payload):
    client = TestClient(app)
    with client.stream("POST", "/svc/v1/ats/score-engine/stream", json=payload) as res:
        assert res.status_code == 200
        return [json.loads(line) for line in res.iter_lines() if line]


def test_stream_events_are_ordered_tagged_and_terminal_last():
    events = _stream({"engineId": "open_ats", "resumeId": "r1", "runId": "run-7", "resumeText": RESUME, "jdText": JD})
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
    assert all(e["resumeId"] == "r1" and e["engineId"] == "open_ats" and e["runId"] == "run-7" and e["at"] for e in events)
    assert events[-1]["type"] == "result" and events[-1]["stage"] == "completed"
    assert sum(1 for e in events if e["type"] in ("result", "failed")) == 1
    assert [e["stage"] for e in events[:2]] == ["validating_input", "parsing_resume"]


def test_stream_reports_failure_kind():
    events = _stream({"engineId": "resume_skills_extractor", "resumeId": "r1", "runId": "x", "resumeText": RESUME, "jdText": ""})
    assert events[-1]["type"] == "failed" and events[-1]["failureKind"] == UNSUPPORTED_MODE


def test_stream_completed_with_warnings():
    jd = "Hiring now at our company"  # ≤30 chars and no role → no keyword list
    events = _stream({"engineId": "ats_resume_checker", "resumeId": "r", "runId": "w", "resumeText": RESUME, "jdText": jd})
    assert events[-1]["stage"] == "completed_with_warnings"


def test_stream_legacy_engine_regression():
    events = _stream({"engineId": "skillsyncer_style", "resumeId": "r", "runId": "l", "resumeText": RESUME,
                      "jdText": JD, "role": "Backend Engineer"})
    assert events[-1]["type"] == "result"
    assert events[-1]["result"]["scoreName"] == "Weighted Job Match Score"


# ── TF-IDF ──────────────────────────────────────────────────────────────────


def test_tfidf_known_values():
    assert math.isclose(tfidf_cosine("apple banana", "apple banana"), 1.0)
    assert tfidf_cosine("apple banana", "cherry grape") == 0.0
    # smooth idf: shared term 1.0, unique terms ln(3/2)+1 → cos = 1 / (1 + idf²)
    idf = math.log(1.5) + 1
    assert math.isclose(tfidf_cosine("apple banana", "apple cherry"), 1 / (1 + idf * idf), rel_tol=1e-9)
    assert tfidf_cosine("", "apple") == 0.0


def test_tfidf_stop_words_are_scikit_learn_list():
    from app.ats.text_similarity import ENGLISH_STOP_WORDS

    assert len(ENGLISH_STOP_WORDS) == 318  # sklearn 1.6.1 ENGLISH_STOP_WORDS


def test_js_round_half_up_for_ats_checker():
    from app.ats.oss_profiles import _js_round

    assert [_js_round(x) for x in (62.5, 63.5, 0.5, 2.4)] == [63, 64, 1, 2]
