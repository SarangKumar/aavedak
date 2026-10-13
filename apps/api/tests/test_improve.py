"""Resume Improver: transformations, fact preservation, and identical before/after scoring."""

import pytest

from app.ats.benchmarks.fixtures import BACKEND_JD, ORDERING_CASES
from app.improve import guards
from app.improve.guards import token_classes
from app.improve.rules import rewrite_bullet
from app.improve.service import improve, score_pair, scoring_request
from app.improve.structure import parse, render

CASES = dict(ORDERING_CASES)


# ---------- transformations

@pytest.mark.parametrize("before,after", [
    ("Responsible for building REST APIs in Go.", "Built REST APIs in Go."),
    ("I built a cache layer in Redis.", "Built a cache layer in Redis."),
    ("Worked on backend tickets in Python.", "Contributed to backend tickets in Python."),
])
def test_bullet_rewrites(before, after):
    assert rewrite_bullet(before, current=False)[0] == after


def test_gerund_becomes_past_tense_only_for_past_roles():
    assert rewrite_bullet("Building data pipelines in Spark.", current=False)[0].startswith("Built")
    assert rewrite_bullet("Building data pipelines in Spark.", current=True)[0].startswith("Building")


def test_parse_render_roundtrip_is_stable():
    for text in CASES.values():
        once = render(parse(text))
        assert render(parse(once)) == once


# ---------- guards

@pytest.mark.parametrize("before,after", [
    ("Built APIs in Go.", "Built APIs in Go, cutting latency 40%."),   # new number
    ("Built APIs in Go.", "Built APIs in Go and Kubernetes."),          # new skill
    ("Built APIs in Go.", "Built APIs in Go for Google."),               # new entity
    ("Helped build APIs.", "Led the build of APIs."),                     # ownership claim
    ("Built APIs in 2021.", "Built APIs in 2022."),                       # changed date
])
def test_guard_rejects_new_facts(before, after):
    assert guards.check_bullet_rewrite(before, after)


def test_guard_accepts_safe_rewrite():
    assert guards.check_bullet_rewrite("Responsible for building REST APIs in Go.", "Built REST APIs in Go.") == []


@pytest.mark.parametrize("name", list(CASES))
@pytest.mark.parametrize("jd", ["", BACKEND_JD])
def test_revised_resume_adds_no_facts(name, jd):
    r = improve(CASES[name], role="Backend Engineer", jd_text=jd, years_experience=4)
    before, after = token_classes(r["originalText"]), token_classes(r["revisedText"])
    for cls in guards.FACT_CLASSES:
        added = after[cls] - before[cls]
        if cls == "entities":  # skill-group headings ("Cloud / DevOps:") are labels, not facts
            labels = {w for c in r["changes"] if c["kind"] == "skills" and c["accepted"]
                      for lab in c["target"]["labels"] for w in lab.replace("/", " ").split()}
            added = {k: v for k, v in added.items() if k not in labels}
        assert not added, (name, cls, added)
    assert r["documentProblems"] == []


def test_missing_requirements_are_gaps_not_insertions():
    r = improve(CASES["weak_fe"], role="Backend Engineer", jd_text=BACKEND_JD, years_experience=2)
    missing = r["alignment"]["missing"]
    assert missing
    low = r["revisedText"].lower()
    for item in missing:
        if item["label"].lower() not in r["originalText"].lower():
            assert item["label"].lower() not in low


def test_improve_is_deterministic_and_reject_all_is_identity():
    a = improve(CASES["moderate"], role="Backend Engineer", years_experience=4)
    b = improve(CASES["moderate"], role="Backend Engineer", years_experience=4)
    assert a == b
    none = improve(CASES["moderate"], role="Backend Engineer", years_experience=4, accepted=[])
    assert none["revisedText"] == none["originalText"]


def test_partial_accept_applies_only_chosen_change():
    full = improve(CASES["moderate"], role="Backend Engineer", years_experience=4)
    first = full["changes"][0]["id"]
    one = improve(CASES["moderate"], role="Backend Engineer", years_experience=4, accepted=[first])
    assert [c["id"] for c in one["changes"] if c["accepted"]] == [first]


# ---------- scoring

def test_scoring_uses_identical_request_and_real_engine_scores():
    r = improve(CASES["moderate"], role="Backend Engineer", jd_text=BACKEND_JD, years_experience=4)
    s = score_pair(r["originalText"], r["revisedText"], role="Backend Engineer",
                   jd_text=BACKEND_JD, years_experience=4, engines=("aavedak",))
    req = scoring_request(role="Backend Engineer", jd_text=BACKEND_JD, years_experience=4)
    assert s["snapshot"]["mode"] == req["mode"]
    # Re-scoring the original on its own gives the same number: nothing is hardcoded.
    again = score_pair(r["originalText"], r["originalText"], role="Backend Engineer",
                       jd_text=BACKEND_JD, years_experience=4, engines=("aavedak",))
    assert again["before"]["aavedak"]["score"] == again["after"]["aavedak"]["score"] == s["before"]["aavedak"]["score"]
