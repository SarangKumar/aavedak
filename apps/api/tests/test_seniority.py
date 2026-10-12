from app.ats.analyze import analyze_resume
from app.ats.seniority import level_band, seniority_fit

RESUME = """Jane Doe
jane@example.com | +91 98765 43210
EXPERIENCE
Software Engineer, Acme (2021 - 2024)
- Built a Python FastAPI service handling 2M requests per day
- Reduced p95 latency by 40% by adding Redis caching
- Led migration of 12 services to Kubernetes
- Mentored 3 junior engineers on code review practices
EDUCATION
B.Tech Computer Science
SKILLS
Python, FastAPI, PostgreSQL, Redis, Kubernetes, Docker
"""


def test_level_bands_are_monotonic():
    assert level_band(0).key == "entry"
    assert level_band(2).key == "junior"
    assert level_band(4).key == "mid"
    assert level_band(7).key == "senior"
    assert level_band(15).key == "staff"


def test_leadership_only_required_from_mid_level():
    junior = seniority_fit(2, word_count=500, bullets=8, metric_bullets=4, leadership_bullets=0)
    mid = seniority_fit(4, word_count=500, bullets=8, metric_bullets=4, leadership_bullets=0)
    assert junior.score == 100
    assert mid.score < 100


def test_no_years_leaves_native_score_unchanged():
    base = analyze_resume(RESUME)
    assert base["scores"].get("seniorityFit") is None
    with_years = analyze_resume(RESUME, years_experience=3)
    assert isinstance(with_years["scores"]["seniorityFit"], int)
    assert any("Calibrated for 3 years" in n for n in with_years["notes"])
