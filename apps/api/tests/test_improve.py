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


# ---------- regressions: document check rejected every change on real PDF text

WRAPPED = """Jane Doe
jane@example.com
EXPERIENCE
Engineer, Acme    Jan 2023 – Present
• Responsible for building the billing service used by 10
customers across 3 regions in 2025
• Worked on dashboards in React
SKILLS
Programming: Java, SQL, Python
Software Development: Git, Docker
"""


def test_merging_wrapped_line_after_number_passes_document_check():
    # "10\\n" vs "10 " used to tokenize as different numbers → whole revision discarded.
    r = improve(WRAPPED, role="Backend Engineer", years_experience=3)
    assert r["documentProblems"] == [] and r["dropped"] == []
    assert r["revisedText"] != r["originalText"]
    assert all(c["accepted"] for c in r["changes"])


def test_number_tokens_ignore_line_breaks():
    assert guards.token_classes("used by 10\ncustomers")["numbers"] == guards.token_classes("used by 10 customers")["numbers"]


def test_user_skill_labels_are_kept():
    r = improve(WRAPPED, role="Backend Engineer", years_experience=3)
    skills = [c for c in r["changes"] if c["kind"] == "skills"]
    assert not r["rejected"]
    for c in skills:
        assert {ln.split(":")[0] for ln in c["after"]} == {"Programming", "Software Development"}


def test_document_check_drops_only_the_offending_change(monkeypatch):
    from app.improve import service

    real = service.guards.check_document
    calls = {"n": 0}

    def fake(before, after, **kw):
        # Pretend any revision containing "Contributed" is a fabrication.
        return ["adds entities: X"] if "Contributed" in after else real(before, after, **kw)

    monkeypatch.setattr(service.guards, "check_document", fake)
    r = improve(WRAPPED, role="Backend Engineer", years_experience=3)
    assert len(r["dropped"]) == 1 and "would add entities" in r["dropped"][0]["reasons"][0]
    assert any(c["accepted"] for c in r["changes"])
    assert "Contributed" not in r["revisedText"]
