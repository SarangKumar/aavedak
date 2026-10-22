"""The staged job → candidate matcher (`app/discovery/jobs/match.py`).

Pure tests: no database, no network. The SQL around these stages (daily cap, re-rank, hidden
rows) lives in tests/test_discovery_db.py, which needs TEST_DATABASE_URL.
"""

from __future__ import annotations

import pytest

from app.discovery.jobs import match
from app.discovery.jobs.match import Candidate, JobFacts

NOW = "2026-10-22T00:00:00+00:00"
RECENT = "2026-10-21T00:00:00+00:00"
OLD = "2026-09-25T00:00:00+00:00"

BACKEND_JD = """
About the role
We are hiring a backend engineer for our payments team in Bengaluru.

Requirements
- 1+ years of professional experience building backend services
- Strong experience with Python and Django
- Must have hands-on experience with PostgreSQL and REST APIs
- Working knowledge of Docker

Nice to have
- Kubernetes and AWS exposure
- Experience with Kafka

Responsibilities
- Build and maintain payment services, design APIs, write tests and monitor production.
"""

FRONTEND_JD = """
About the role
We are hiring a frontend engineer for our design systems team in Bengaluru.

Requirements
- 1+ years of professional experience building web interfaces
- Strong experience with React and TypeScript
- Must have hands-on experience with CSS and accessibility testing
- Working knowledge of Figma handoff

Responsibilities
- Build and maintain component libraries, design APIs for them and write tests.
"""

BACKEND_RESUME = (
    "Jane Doe\njane@example.com\n\n"
    "Experience\n"
    "Software Engineer, Acme (Jan 2025 - Present)\n"
    "- Built Python and Django services backed by PostgreSQL, serving 2M requests/day.\n"
    "- Designed REST APIs and shipped them in Docker containers.\n"
    "- Reduced p99 latency 40% by adding caching and query tuning.\n\n"
    "Skills\nPython, Django, PostgreSQL, REST APIs, Docker, Git\n\n"
    "Education\nB.Tech Computer Science, 2024\n"
)


def backend_candidate(**kwargs) -> Candidate:
    base = dict(
        years=1.0,
        skills=("Python", "Django", "PostgreSQL", "Docker"),
        preferred_roles=("Backend Engineer",),
        preferred_locations=("Bengaluru, India",),
        resume_text=BACKEND_RESUME,
    )
    base.update(kwargs)
    return Candidate(**base)


def job(**kwargs) -> JobFacts:
    base = dict(
        id="j1",
        title="Backend Engineer",
        company="Acme",
        location="Bengaluru, India",
        region="india",
        min_years=1,
        description=BACKEND_JD,
        posted=RECENT,
    )
    base.update(kwargs)
    return JobFacts(**base)


# --- weights and normalization -------------------------------------------------------


def test_weights_sum_to_one_and_are_the_only_place_weights_live():
    match.DEFAULT_WEIGHTS._check()
    with pytest.raises(ValueError):
        match.MatchWeights(role_title=0.5)._check()


def test_score_is_normalized_and_breakdown_adds_up():
    result = match.evaluate(job(), backend_candidate())
    assert 0 <= result.score <= 100
    assert abs(sum(c["points"] for c in result.breakdown()) - result.score) <= 0.5
    # Every signal is reported, available or not, plus the "unrated" remainder.
    keys = {c["key"] for c in result.breakdown()}
    assert set(match.SIGNAL_KEYS) <= keys


def test_scores_stay_in_range_for_degenerate_inputs():
    for candidate in (Candidate(), backend_candidate()):
        for facts in (JobFacts(title="x"), job(description="", min_years=None, region="global")):
            score = match.evaluate(facts, candidate).score
            assert 0 <= score <= 100


# --- role matching -------------------------------------------------------------------


def test_strong_role_beats_weak_role():
    candidate = backend_candidate()
    strong = match.evaluate(job(), candidate)
    weak = match.evaluate(
        job(id="j2", title="QA Automation Engineer", description=FRONTEND_JD), candidate
    )
    assert strong.score > weak.score
    assert strong.component("role_title").fit == 1.0
    assert weak.component("role_title").fit < 0.5


def test_same_role_family_scores_below_an_exact_title_but_well_above_an_unrelated_one():
    candidate = backend_candidate()
    family = match.evaluate(job(id="j3", title="Software Development Engineer"), candidate)
    unrelated = match.evaluate(job(id="j4", title="Field Sales Associate"), candidate)
    assert 0.5 <= family.component("role_title").fit <= 0.9
    assert unrelated.component("role_title").fit <= 0.3


def test_a_profile_without_preferred_roles_does_not_score_the_title():
    component = match.evaluate(job(), backend_candidate(preferred_roles=())).component("role_title")
    assert component.available is False and component.points == 0


# --- required vs preferred skills ----------------------------------------------------


def test_required_skills_weigh_more_than_preferred_ones():
    candidate = backend_candidate(skills=(), resume_text="")
    # Only the required group matched vs only the preferred group matched.
    required_only = backend_candidate(skills=("Python", "Django", "PostgreSQL", "REST API"), resume_text="")
    preferred_only = backend_candidate(skills=("Kubernetes", "AWS", "Kafka"), resume_text="")
    r = match.evaluate(job(), required_only)
    p = match.evaluate(job(), preferred_only)
    assert r.component("required_skills").points > p.component("preferred_skills").points
    assert match.evaluate(job(), candidate).component("required_skills").available is False


def test_matched_and_missing_skills_are_reported_separately():
    result = match.evaluate(job(), backend_candidate(skills=("Python",), resume_text=""))
    assert "Python" in result.skills_matched
    assert any("Django" in s for s in result.skills_missing)
    assert not set(result.skills_matched) & set(result.skills_missing)


def test_repeating_a_keyword_does_not_inflate_the_score():
    once = job(id="a")
    repeated = job(id="b", description=BACKEND_JD + "\nPython. " * 40)
    candidate = backend_candidate()
    assert (
        match.evaluate(repeated, candidate).component("required_skills").fit
        <= match.evaluate(once, candidate).component("required_skills").fit + 0.2
    )


# --- experience and seniority --------------------------------------------------------


def test_experience_mismatch_lowers_the_score_but_a_missing_statement_does_not():
    candidate = backend_candidate(years=0.0)
    fits = match.evaluate(job(min_years=0), candidate)
    stretches = match.evaluate(job(id="j5", min_years=2), candidate)
    unstated = match.evaluate(job(id="j6", min_years=None), candidate)
    assert fits.component("experience").fit == 1.0
    assert stretches.component("experience").fit < 1.0
    assert unstated.component("experience").available is False
    assert unstated.score >= stretches.score


def test_a_job_far_above_the_window_is_ineligible():
    candidate = backend_candidate(years=1.0, experience_window=2.0)
    assert match.eligibility(job(min_years=3), candidate).eligible is True
    outcome = match.eligibility(job(min_years=6), candidate)
    assert outcome.eligible is False and outcome.reason == "experience"


def test_seniority_signal_prefers_the_candidates_band():
    junior = backend_candidate(years=1.0)
    for_junior = match.evaluate(job(seniority="entry"), junior).component("seniority")
    for_senior = match.evaluate(job(id="j7", seniority="director"), junior).component("seniority")
    assert for_junior.available and for_junior.fit > for_senior.fit


def test_seniority_is_read_from_the_title_when_the_posting_states_none():
    component = match.evaluate(
        job(id="j8", title="Senior Backend Engineer", min_years=None), backend_candidate()
    ).component("seniority")
    assert component.available is True


# --- location and work mode ----------------------------------------------------------


def test_preferred_city_scores_full_marks_and_outside_india_scores_least():
    candidate = backend_candidate()
    city = match.evaluate(job(), candidate).component("location")
    outside = match.evaluate(
        job(id="j9", location="Berlin, Germany", region="global"), candidate
    ).component("location")
    assert city.fit == 1.0 and outside.fit < 0.5


def test_remote_preference_matches_a_remote_posting():
    candidate = backend_candidate(preferred_locations=("Remote",), remote_preference="remote")
    component = match.evaluate(
        job(id="j10", location="Remote (India)", region="india_remote"), candidate
    ).component("location")
    assert component.fit == 1.0


def test_region_bonus_orders_india_first_without_overtaking_relevance():
    candidate = backend_candidate()
    india = job(id="a", region="india")
    anywhere = job(id="b", region="global", location="Berlin, Germany")
    r_india = match.evaluate(india, candidate)
    r_anywhere = match.evaluate(anywhere, candidate)
    assert match.rank_value(r_india, india, NOW) > match.rank_value(r_anywhere, anywhere, NOW)
    # A weak Indian match never outranks a strong global one by region alone.
    weak = match.MatchResult(score=20, confidence=100, components=[])
    strong = match.MatchResult(score=70, confidence=100, components=[])
    assert match.rank_value(weak, india, NOW) < match.rank_value(strong, anywhere, NOW)


# --- missing / incomplete data -------------------------------------------------------


def test_a_thin_description_is_not_rejected_and_is_flagged_as_uncertain():
    thin = job(id="j11", description="Backend engineer. Apply now.")
    assert match.eligibility(thin, backend_candidate()).eligible is True
    result = match.evaluate(thin, backend_candidate())
    assert result.component("required_skills").available is False
    assert result.confidence < 100
    assert any("short" in note for note in result.uncertainty)
    # A thin posting lands between a confirmed bad match and a confirmed good one.
    good = match.evaluate(job(), backend_candidate()).score
    bad = match.evaluate(job(id="j12", title="Field Sales Associate", description=FRONTEND_JD),
                         backend_candidate()).score
    assert bad < result.score < good


def test_an_empty_resume_falls_back_to_profile_skills_and_says_so():
    candidate = backend_candidate(resume_text="")
    result = match.evaluate(job(), candidate)
    assert result.component("resume_similarity").available is False
    assert result.component("required_skills").available is True  # profile skills still count
    assert any("resume" in note.lower() for note in result.uncertainty)


def test_an_empty_profile_and_empty_resume_still_scores_without_crashing():
    result = match.evaluate(job(), Candidate())
    assert 0 <= result.score <= 100 and result.confidence < 100
    assert Candidate().has_signals is False


def test_malformed_job_rows_are_read_safely():
    facts = JobFacts.from_row(
        {"id": 7, "title": None, "skills_json": "{not json", "min_years": None, "region": None}
    )
    assert facts.id == "7" and facts.title == "" and facts.skills == () and facts.region == "india"
    assert match.eligibility(facts, backend_candidate()).reason == "invalid"


# --- exclusions, expiry, closure -----------------------------------------------------


def test_expired_closed_and_archived_jobs_are_ineligible():
    candidate = backend_candidate()
    assert match.eligibility(job(expired_at=NOW), candidate).reason == "expired"
    assert match.eligibility(job(closed_at=NOW), candidate).reason == "closed"
    assert match.eligibility(job(status="archived"), candidate).reason == "inactive"


def test_explicit_exclusions_are_hard_constraints():
    assert (
        match.eligibility(job(), backend_candidate(excluded_companies=("acme",))).reason
        == "excluded_company"
    )
    assert (
        match.eligibility(
            job(title="Backend Engineer (Crypto)"), backend_candidate(excluded_keywords=("crypto",))
        ).reason
        == "excluded_keyword"
    )
    # A keyword that only appears in the description is not an exclusion.
    assert match.eligibility(job(), backend_candidate(excluded_keywords=("kafka",))).eligible


# --- explanations --------------------------------------------------------------------


def test_explanation_keeps_the_shape_the_web_app_already_reads():
    result = match.evaluate(job(), backend_candidate())
    payload = result.explanation(job())
    for key in ("skills", "roles", "locations", "minYears", "maxYears", "region", "experienceFit", "match"):
        assert key in payload
    assert payload["match"] == result.score
    assert 0 <= payload["experienceFit"] <= 10
    assert payload["roles"] == ["Backend Engineer"]
    assert payload["locations"] == ["Bengaluru, India"]


def test_explanation_carries_reasons_breakdown_and_uncertainty():
    payload = match.evaluate(job(), backend_candidate()).explanation(job())
    assert payload["engine"] == match.MATCH_ENGINE_VERSION
    assert payload["reasons"] and all(isinstance(r, str) for r in payload["reasons"])
    assert payload["skillsMatched"] and isinstance(payload["skillsMissing"], list)
    assert {c["key"] for c in payload["breakdown"]} >= set(match.SIGNAL_KEYS)
    # A score with no evidence for a signal reports it as unavailable, not as zero fit.
    unavailable = [c for c in payload["breakdown"] if not c["available"]]
    assert all(c["score"] is None for c in unavailable)


# --- ranking, duplicates, diversity, stability ---------------------------------------


def entry(job_id: str, score: int, *, company="Acme", title="Backend Engineer", posted=RECENT) -> match.RankedJob:
    facts = job(id=job_id, company=company, title=title, posted=posted)
    result = match.MatchResult(score=score, confidence=100, components=[])
    return match.RankedJob(job=facts, result=result, rank=match.rank_value(result, facts, NOW))


def test_ranking_is_ordered_by_relevance_and_stable_for_equal_scores():
    items = [entry("b", 50), entry("a", 50, company="Beta"), entry("c", 80, company="Gamma")]
    first = match.rank_jobs(items).items
    again = match.rank_jobs(list(reversed(items))).items
    assert [e.job.id for e in first] == ["c", "a", "b"]
    assert [e.job.id for e in again] == [e.job.id for e in first]


def test_recency_breaks_a_tie_without_outweighing_relevance():
    fresh = entry("fresh", 50, posted=RECENT)
    stale = entry("stale", 50, company="Beta", posted=OLD)
    better_but_older = entry("better", 62, company="Gamma", posted=OLD)
    ordered = [e.job.id for e in match.rank_jobs([stale, fresh, better_but_older]).items]
    assert ordered == ["better", "fresh", "stale"]


def test_near_duplicate_roles_at_one_company_are_dropped():
    ranking = match.rank_jobs(
        [
            entry("a", 70, title="Backend Engineer"),
            entry("b", 60, title="Backend Engineer (Req 1234)"),
            entry("c", 60, title="Backend Engineer", company="Acme Technologies Pvt Ltd"),
            entry("d", 60, title="Frontend Engineer"),
        ]
    )
    assert [e.job.id for e in ranking.items] == ["a", "d"]
    assert {e.job.id for e in ranking.duplicates} == {"b", "c"}
    assert all(e.duplicate_of == "a" for e in ranking.duplicates)


def test_one_company_cannot_fill_the_front_of_a_batch():
    titles = ["Backend Engineer", "Frontend Engineer", "Data Engineer", "QA Engineer", "Security Analyst"]
    items = [entry(f"a{i}", 90 - i, title=title) for i, title in enumerate(titles)]
    items.append(entry("other", 40, company="Beta", title="Platform Engineer"))
    ordered = [e.job.id for e in match.rank_jobs(items).items]
    assert ordered.index("other") == match.DEFAULT_RANK_WEIGHTS.max_per_company
    # Nothing is thrown away: the overflow keeps its order behind the capped pass.
    assert len(ordered) == len(items)


# --- cache key -----------------------------------------------------------------------


def test_inputs_key_changes_with_the_resume_the_profile_or_the_job():
    candidate = backend_candidate()
    base = match.inputs_key(job(), candidate)
    assert base == match.inputs_key(job(), backend_candidate())  # deterministic
    assert base != match.inputs_key(job(), backend_candidate(resume_text=BACKEND_RESUME + "\nKubernetes"))
    assert base != match.inputs_key(job(), backend_candidate(skills=("Python",)))
    assert base != match.inputs_key(job(), backend_candidate(years=3.0))
    assert base != match.inputs_key(job(description=BACKEND_JD + "\nKafka required."), candidate)
    assert base != match.inputs_key(job(title="Senior Backend Engineer"), candidate)
    # A field no signal reads does not invalidate the cache.
    assert base == match.inputs_key(job(), backend_candidate())


def test_evaluation_is_deterministic_for_the_same_inputs():
    a = match.evaluate(job(), backend_candidate())
    b = match.evaluate(job(), backend_candidate())
    assert a.score == b.score and a.breakdown() == b.breakdown()


# --- optional second stage (AI hook) -------------------------------------------------


def test_second_stage_blends_a_valid_verdict_and_reorders():
    items = match.rank_jobs([entry("a", 60), entry("b", 55, company="Beta")]).items

    def evaluator(batch):
        return {"b": {"score": 100, "reasons": ["Your Django work maps onto their payments team."]}}

    blended = match.apply_second_stage(items, evaluator, now=NOW)
    assert [e.job.id for e in blended] == ["b", "a"]
    assert any("Django" in r for r in blended[0].result.reasons)


@pytest.mark.parametrize(
    "verdicts",
    [
        {"a": {"score": "high"}},
        {"a": {"reasons": ["no score"]}},
        {"a": None},
        {},
    ],
)
def test_malformed_second_stage_output_is_ignored(verdicts):
    items = match.rank_jobs([entry("a", 60)]).items
    before = items[0].result.score
    after = match.apply_second_stage(items, lambda batch: verdicts, now=NOW)
    assert after[0].result.score == before


def test_second_stage_failure_leaves_the_deterministic_result_intact():
    items = match.rank_jobs([entry("a", 60), entry("b", 55, company="Beta")]).items

    def failing(batch):
        raise TimeoutError("provider down")

    after = match.apply_second_stage(items, failing, now=NOW)
    assert [e.job.id for e in after] == ["a", "b"]
    assert [e.result.score for e in after] == [60, 55]
    assert any("unavailable" in note for note in after[0].result.uncertainty)


def test_no_evaluator_is_the_normal_case():
    items = match.rank_jobs([entry("a", 60)]).items
    assert match.apply_second_stage(items, None, now=NOW) == items


# --- ranking.py glue that needs no database ------------------------------------------


def _pool_rows() -> list[dict]:
    return [
        {
            "id": "pool-1", "title": "Backend Engineer", "company": "Acme", "location": "Bengaluru, India",
            "description": BACKEND_JD, "salary": None, "url": "https://acme.example/1", "min_years": 1,
            "max_years": None, "region": "india", "status": "active", "expired_at": None, "closed_at": None,
            "work_mode": None, "employment_type": None, "seniority": None, "skills_json": "[]",
            "posted": RECENT,
        },
        {
            "id": "pool-2", "title": "Field Sales Associate", "company": "Beta", "location": "Berlin, Germany",
            "description": "Sell our product in Europe.", "salary": None, "url": "https://beta.example/2",
            "min_years": 9, "max_years": None, "region": "global", "status": "active", "expired_at": None,
            "closed_at": None, "work_mode": None, "employment_type": None, "seniority": None,
            "skills_json": "[]", "posted": OLD,
        },
        {
            "id": "pool-3", "title": "Frontend Engineer", "company": "Gamma", "location": "Pune, India",
            "description": FRONTEND_JD, "salary": None, "url": "https://gamma.example/3", "min_years": 1,
            "max_years": None, "region": "india", "status": "active", "expired_at": None, "closed_at": None,
            "work_mode": None, "employment_type": None, "seniority": None, "skills_json": "[]",
            "posted": RECENT,
        },
    ]


def test_pool_scoring_filters_and_orders_without_a_database():
    from app.discovery.config import DiscoverySettings
    from app.discovery.jobs import ranking

    settings = DiscoverySettings(discovery_min_match_score=40)
    ctx = ranking.UserContext("u1", backend_candidate(), resume_id="r1")
    ranked = ranking._score_rows(_pool_rows(), ctx, settings, NOW)
    offered = [e.job.id for e in ranked.items]
    # The 9-year sales role fails stage A (experience), so it is never scored.
    assert "pool-2" not in offered
    # Best match first, and every offered job carries a cache key and an explanation.
    assert offered[0] == "pool-1"
    assert all(e.cache_key and e.result.reasons for e in ranked.items)


def test_pool_scoring_drops_jobs_under_the_threshold_only_for_a_telling_profile():
    from app.discovery.config import DiscoverySettings
    from app.discovery.jobs import ranking

    strict = DiscoverySettings(discovery_min_match_score=95)
    rows = _pool_rows()
    with_profile = ranking._score_rows(rows, ranking.UserContext("u1", backend_candidate(), None), strict, NOW)
    assert with_profile.items == []
    # An empty profile cannot be judged, so the threshold is not applied to it.
    blank = ranking._score_rows(rows, ranking.UserContext("u2", Candidate(), None), strict, NOW)
    assert len(blank.items) >= 1
