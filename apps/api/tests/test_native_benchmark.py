from app.ats.analyze import analyze_resume
from app.ats.benchmark import QUALITY_WEIGHTS, education_cert_match, quality_criteria
from app.ats.reference_profiles import run_enhancv_style, run_resume_worded_style, run_teal_style

GOOD = """Asha Rao
asha@example.com | +91 98765 43210
SUMMARY
Backend engineer.
EXPERIENCE
Software Engineer, Acme | Jan 2022 - Present
- Built a FastAPI service handling 2M requests per day with Python and PostgreSQL
- Reduced p95 latency by 40% in 3 months by adding Redis caching
- Led migration of 12 services to Kubernetes with zero downtime
- Automated deploys with Docker and GitHub Actions, cutting release time from 2 days to 1 hour
EDUCATION
B.Tech Computer Science, 2021
SKILLS
Python, FastAPI, PostgreSQL, Redis, Kubernetes, Docker
"""

WEAK = """Ravi
EXPERIENCE
- Helped with various tasks
- Assisted the team on things
- Responsible for managing recieve process
- I was involved in meetings
"""


def _crit(text, **kw):
    return {c.key: c for c in quality_criteria(text, parse_score=80, skills_in_experience=3, skills_total=5, **kw)}


def test_weights_sum_to_one():
    assert abs(sum(QUALITY_WEIGHTS.values()) - 1.0) < 1e-9


def test_good_resume_beats_weak_on_every_writing_criterion():
    g, w = _crit(GOOD), _crit(WEAK)
    for key in ("quantifiedImpact", "actionVerbs", "writingHygiene", "repetitionSpelling", "sectionsContact"):
        assert g[key].score > w[key].score, key


def test_weak_openers_and_typos_are_flagged():
    w = _crit(WEAK)
    assert "weak openers" in w["actionVerbs"].detail
    assert w["repetitionSpelling"].score < 100


def test_years_switch_length_to_seniority():
    assert _crit(GOOD)["lengthSeniority"].label == "Length"
    assert _crit(GOOD, years_experience=2)["lengthSeniority"].label == "Length & seniority fit"


def test_gap_detection():
    gappy = GOOD + "\nIntern, Beta | Jan 2015 - Dec 2016\n"
    assert _crit(gappy)["datesGaps"].score < _crit(GOOD)["datesGaps"].score


def test_education_and_cert_match():
    assert education_cert_match(GOOD, "We need a team player.") is None
    assert education_cert_match(GOOD, "Bachelor's degree required.") == 100
    assert education_cert_match(GOOD, "Master's degree and AWS certification required.") < 50


def test_native_returns_explained_breakdown_and_blends_match():
    only = analyze_resume(GOOD)
    assert len(only["breakdown"]) == len(QUALITY_WEIGHTS)
    job = analyze_resume(GOOD, jd_text="Backend engineer with Python, FastAPI, PostgreSQL and Kubernetes. " * 3)
    assert job["mode"] == "job_match"
    assert any(k in job["weighting"] for k in ("requiredSkills", "evidenceQuality"))
    assert analyze_resume(WEAK)["overallScore"] < only["overallScore"]


def test_reference_engines_follow_docs():
    rw = run_resume_worded_style("r", WEAK, "", "")
    assert any("weak verb" in i["text"].lower() for i in rw["improvements"]) or rw["overallScore"] < 60
    teal = run_teal_style("t", GOOD, "", "")
    assert "issue cards" in teal["notes"][0]
    teal_job = run_teal_style("t", GOOD, "", "Python FastAPI Kubernetes communication", mode="job_match")
    assert "surfaced keywords" in teal_job["notes"][0]
    env = run_enhancv_style("e", GOOD, "", "")
    assert any(b["key"] == "bullet_length" for b in env["breakdown"])
