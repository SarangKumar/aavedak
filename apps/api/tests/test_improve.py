"""Resume Improver: transformations, fact preservation, and identical before/after scoring."""

import pytest

from app.ats.benchmarks.fixtures import BACKEND_JD, ORDERING_CASES
from app.improve import guards
from app.improve.guards import token_classes
from app.improve.rules import date_format_change, expand_months, rewrite_bullet
from app.improve.service import improve, improve_and_score, score_pair, scoring_request
from app.improve.structure import parse, render

CASES = dict(ORDERING_CASES)


# ---------- transformations

@pytest.mark.parametrize("before,after", [
    ("Responsible for building REST APIs in Go.", "Built REST APIs in Go."),
    ("I built a cache layer in Redis.", "Built a cache layer in Redis."),
    ("Worked on backend tickets in Python.", "Contributed to backend tickets in Python."),
    # "worked on" + the user's own verb: the verb leads, nothing is added.
    ("Worked on building the checkout flow.", "Built the checkout flow."),
    # A supporting role stays a supporting role, never sole credit.
    ("Helped with building the checkout flow.", "Contributed to building the checkout flow."),
    # Same-meaning verbs the ATS engines credit as strong.
    ("Wrote PostgreSQL migrations.", "Created PostgreSQL migrations."),
    ("Fixed 120 production bugs.", "Resolved 120 production bugs."),
    # "Used" has no stronger same-meaning verb, so it is left alone.
    ("Used Redis to cache listings.", "Used Redis to cache listings."),
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


# ---------- dates

def test_months_are_spelled_out_only_next_to_a_year():
    assert expand_months("Engineer, Acme — Jun 2020 – Sept. 2021") == "Engineer, Acme — June 2020 – September 2021"
    assert expand_months("Engineer — May 2020 – Present") == "Engineer — May 2020 – Present"
    assert expand_months("Ran a Mar-a-thon of Dec ideas") == "Ran a Mar-a-thon of Dec ideas"


def test_date_format_change_is_guarded_and_passes_the_document_check():
    text = "Ana\nana@x.com\n\nEXPERIENCE\nEngineer, Acme — Jun 2020 – Present\n- Built APIs in Go.\n"
    r = improve(text, role="Backend Engineer")
    dates = [c for c in r["changes"] if c["kind"] == "date_format"]
    assert dates and dates[0]["accepted"]
    assert "June 2020" in r["revisedText"] and not r["documentProblems"]
    assert guards.check_date_format(["Acme — Jun 2020"], ["Acme — June 2021"])  # a different year is refused


def test_resume_without_abbreviated_months_has_no_date_change():
    assert date_format_change(parse("Ana\n\nEXPERIENCE\nEngineer — May 2020 – Present\n")) is None


# ---------- score-aware defaults

def test_first_run_measures_each_change_and_unticks_ones_that_lower_scores(monkeypatch):
    import app.improve.service as service

    text = CASES["moderate"]
    plain = improve(text, role="Backend Engineer")
    victim = plain["changes"][0]["id"]
    real = service.change_impacts

    def fake(*args, **kwargs):
        out = real(*args, **kwargs)
        out[victim] = {"aavedak": -5}
        return out

    monkeypatch.setattr(service, "change_impacts", fake)
    r = improve_and_score(text, role="Backend Engineer", jd_text="", years_experience=2, accepted=None)
    by_id = {c["id"]: c for c in r["changes"]}
    assert by_id[victim]["accepted"] is False and by_id[victim]["impact"] == {"aavedak": -5}
    assert all(c["accepted"] for cid, c in by_id.items() if cid != victim)
    assert all(isinstance(c["impact"], dict) for c in r["changes"])


def test_toggle_runs_skip_impact_measurement():
    r = improve_and_score(CASES["moderate"], role="Backend Engineer", jd_text="", years_experience=2,
                          accepted=[])
    assert all("impact" not in c for c in r["changes"])
    assert r["revisedText"] == r["originalText"]



# ---------- separators

def test_separators_change_replaces_pipes_in_contact_line():
    from app.improve.rules import separators_change
    from app.improve.structure import parse
    resume = parse("Ana Lee\nana@x.com | +91 12345 | linkedin.com/in/ana | github.com/ana\n\nEXPERIENCE\nEngineer — June 2022 – Present\n- Built APIs.\n")
    ch = separators_change(resume)
    assert ch is not None and ch.kind == "separators"
    assert all("·" in a for a in ch.after)
    assert all("|" not in a for a in ch.after)


def test_separators_change_skips_lines_with_fewer_than_two_pipes():
    from app.improve.rules import separators_change
    from app.improve.structure import parse
    resume = parse("Ana Lee\nana@x.com | github.com/ana\n\nEXPERIENCE\nEngineer — June 2022 – Present\n- Built APIs.\n")
    ch = separators_change(resume)
    assert ch is None  # only 1 pipe — not flagged as a table


def test_separators_change_passes_document_check():
    from app.improve import guards
    text = "Ana Lee\nana@x.com | +91 12345 | linkedin.com/in/ana | github.com/ana\n\nEXPERIENCE\nEngineer — June 2022 – Present\n- Built APIs in Go.\n"
    r = improve(text, role="Backend Engineer")
    seps = [c for c in r["changes"] if c["kind"] == "separators"]
    assert seps and seps[0]["accepted"]
    assert "·" in r["revisedText"] and not r["documentProblems"]


def test_separators_guard_accepts_only_separator_swaps():
    from app.improve import guards
    ok = guards.check_separators(["a | b | c | d"], ["a · b · c · d"])
    assert ok == []
    bad = guards.check_separators(["a | b | c"], ["a · b · X"])
    assert bad  # text changed beyond separators
