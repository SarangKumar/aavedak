"""Pure-layer tests for job discovery: filters, parsing, providers, normalization."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.discovery.jobs import filters
from app.discovery.jobs.models import RawPosting, SourceTarget
from app.discovery.jobs.normalize import normalize_postings
from app.discovery.jobs.providers import BOARD_URLS, detect_source
from app.discovery.jobs.providers import ashby, greenhouse, json_feed, jsonld, lever, smartrecruiters, workable
from app.discovery.jobs.registry import load_seed, parse_import_line, shard_seed
from app.discovery.jobs.scoring import Career, ats_score, compatibility_score
from app.discovery.jobs.text import dedupe_key, html_to_text
from app.discovery.timeutil import clamp_posted_at, ist_day_start_iso, parse_datetime, to_iso

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)


def target(provider: str = "greenhouse", token: str = "acme") -> SourceTarget:
    return SourceTarget(id="cs1", company_name="Acme", provider=provider, token=token, careers_url="")


def posting(title: str, locations=("Bengaluru, India",), description: str = "", **kw) -> RawPosting:
    return RawPosting(external_id="x:1", title=title, company_name="Acme", url="https://acme.example/jobs/1",
                      locations=list(locations), description=description, **kw)


# --- filters ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "locations,code,expected",
    [
        (["Bengaluru, Karnataka"], None, True),
        (["Remote - India"], None, True),
        (["Gurgaon"], None, True),
        (["Remote"], None, False),
        (["Indianapolis, Indiana"], None, False),
        (["London, UK"], "IN", True),
        (["Anywhere"], "US", False),
        (["Hinjewadi, Pune"], None, True),
        (["Manesar, Haryana"], None, True),
        (["Sri City"], None, True),
        (["Banglore"], None, True),
        (["Kota Kinabalu, Malaysia"], None, False),
        (["Salem, Oregon"], None, False),
        (["Salem, Tamil Nadu"], None, True),
    ],
)
def test_is_india(locations, code, expected):
    assert filters.is_india(locations, code) is expected


@pytest.mark.parametrize(
    "locations,code,expected",
    [
        (["Remote - APAC"], None, True),
        (["Remote (Worldwide)"], None, True),
        (["Anywhere"], None, True),
        (["Fully remote, Asia-Pacific"], None, True),
        (["Remote - India"], None, True),
        (["Remote"], None, False),
        (["Remote - EMEA"], None, False),
        (["Remote - Southeast Asia"], None, False),
        (["Remote, Global"], "US", False),
        (["Remote, Global"], "IN", True),
        (["Singapore"], None, False),
    ],
)
def test_is_india_eligible(locations, code, expected):
    assert filters.is_india_eligible(locations, code) is expected


@pytest.mark.parametrize(
    "title,expected",
    [
        ("Software Engineer", True),
        ("SDE I", True),
        ("Graduate Engineer Trainee - Mechanical", True),
        ("GET - Electrical", True),
        ("Civil Site Engineer", True),
        ("Associate DevOps Engineer", True),
        ("Sales Engineer", False),
        ("Solutions Engineer", False),
        ("Engineering Manager", False),
        ("Account Executive", False),
        ("Recruiter, Engineering", False),
        ("Product Designer", True),
        ("Data Analyst", True),
        ("Associate Data Scientist", True),
        ("Machine Learning Engineer", True),
        ("AI/ML Intern", True),
        ("QA Analyst", True),
        ("Manual Tester", True),
        ("IT Support Executive", True),
        ("Database Administrator", True),
        ("SOC Analyst L1", True),
        ("UI/UX Designer", True),
        ("Associate Product Manager", True),
        ("Business Analyst", True),
        ("AI Writing Evaluator", False),
        ("Data Entry Operator", False),
        ("Financial Analyst", False),
        ("Graphic Designer", False),
        ("Marketing Data Analyst", False),
    ],
)
def test_engineering_titles(title, expected):
    assert filters.is_engineering_title(title) is expected


@pytest.mark.parametrize(
    "title,expected",
    [
        ("Senior Software Engineer", True),
        ("Sr. Backend Developer", True),
        ("Staff Engineer", True),
        ("Software Engineer III", True),
        ("SDE-3", True),
        ("Tech Lead", True),
        ("Software Engineer II", False),
        ("SRE", False),
        ("Associate Software Engineer", False),
        ("Engineer - 5G RAN", False),
        ("IN_RBAI_Sr.Engineer/ Asst.Manager_Engineering", True),
        ("IN_ETAS_Cybersecurity Manager_IN", True),
        ("Associate Product Manager", False),
        ("APM - Payments", False),
        ("Product Manager", True),
    ],
)
def test_senior_titles(title, expected):
    assert filters.is_senior_title(title) is expected


@pytest.mark.parametrize(
    "text,expected",
    [
        ("We need 3+ years of experience in Java.", 3),
        ("Experience: 0-2 years in backend development", 0),
        ("1 to 3 years of professional experience", 1),
        ("Minimum 2 years experience with React. 5+ years preferred.", 2),
        ("4+ years experience with Go; 2 years of experience with AWS", 4),
        ("Freshers are welcome to apply!", 0),
        ("Our company was founded 12 years ago.", None),
        ("", None),
    ],
)
def test_min_years_required(text, expected):
    assert filters.min_years_required(text) == expected


def test_classify_reasons():
    kw = {"max_years_exclusive": 3, "include_internships": False}
    assert filters.classify(posting("Software Engineer", ["Austin, TX"]), "", **kw).reason == "not_india"
    assert filters.classify(posting("Marketing Manager"), "", **kw).reason == "not_engineering"
    assert filters.classify(posting("Software Engineer", ["Remote"]), "", **kw).reason == "not_india"
    assert filters.classify(posting("Data Analyst", ["Remote - APAC"]), "", **kw).keep
    assert filters.classify(posting("Software Engineering Intern"), "", **kw).reason == "internship"
    assert filters.classify(posting("Senior Software Engineer"), "", **kw).reason == "senior_title"
    assert filters.classify(posting("Backend Engineer"), "3+ years of experience", **kw).reason == "experience"
    kept = filters.classify(posting("Backend Engineer"), "1-2 years of experience", **kw)
    assert kept.keep and kept.min_years == 1
    # Director-level provider label rejects even a junior-looking title.
    assert filters.classify(posting("Engineer", seniority_hint="director"), "", **kw).reason == "senior_title"
    # Interns allowed when configured.
    assert filters.classify(posting("Software Engineering Intern"), "", max_years_exclusive=3,
                            include_internships=True).keep


def test_normalize_seniority():
    assert filters.normalize_seniority("mid_senior_level") == "mid_senior"
    assert filters.normalize_seniority("Entry level") == "entry"
    assert filters.normalize_seniority("Internship") == "internship"
    assert filters.normalize_seniority(None) is None


# --- text / time --------------------------------------------------------------------------


def test_html_to_text_handles_escaped_greenhouse_html():
    text = html_to_text("&lt;p&gt;Build APIs&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Python&lt;/li&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;")
    assert "Build APIs" in text and "• Python" in text and "<" not in text


def test_display_location_drops_empty_parts():
    from app.discovery.jobs.normalize import display_location

    assert display_location(["coimbatore, , India", "Coimbatore, India"]) == "coimbatore, India"


def test_dedupe_key_uses_first_location_token():
    assert dedupe_key("Acme Inc", "Software Engineer", "Bengaluru, India") == dedupe_key(
        "acme inc", "software  engineer", "Bengaluru · Hybrid"
    )


def test_time_helpers():
    assert to_iso(datetime(2026, 1, 2, 3, 4, 5, 678900, tzinfo=timezone.utc)) == "2026-01-02T03:04:05.678Z"
    assert parse_datetime(1757916149833).year == 2025  # epoch ms (Lever)
    assert clamp_posted_at("2027-01-01", NOW) is None  # future → unknown
    assert clamp_posted_at("garbage", NOW) is None
    assert clamp_posted_at("2026-10-01", NOW) == "2026-10-01T00:00:00.000Z"
    # 2026-10-09 12:00 UTC is 17:30 IST; IST midnight is 18:30 UTC the previous day.
    assert ist_day_start_iso(NOW) == "2026-10-08T18:30:00.000Z"


# --- providers (fixture payloads mirror each public API's documented shape) ---------------


def test_greenhouse_parse():
    payload = {"jobs": [{
        "id": 101, "title": "Software Engineer I", "absolute_url": "https://acme.com/jobs/101",
        "location": {"name": "Bengaluru, India"}, "first_published": "2026-10-01T10:00:00-04:00",
        "updated_at": "2026-10-08T10:00:00-04:00", "content": "&lt;p&gt;0-2 years of experience&lt;/p&gt;",
        "company_name": "Acme", "offices": [{"name": "Pune", "location": "Pune, India"}],
    }]}
    [p] = greenhouse.parse(payload, target())
    assert p.external_id == "acme:101" and p.posted_at == "2026-10-01T10:00:00-04:00"
    assert "Pune, India" in p.locations


def test_lever_parse():
    payload = [{"id": "abc", "text": "Backend Developer", "hostedUrl": "https://jobs.lever.co/acme/abc",
                "categories": {"location": "Bangalore, Karnataka", "commitment": "Full Time"},
                "country": "IN", "createdAt": 1759300000000, "descriptionPlain": "Build things",
                "lists": [{"text": "Requirements", "content": "<li>1+ years of experience</li>"}],
                "additionalPlain": "Benefits"}]
    [p] = lever.parse(payload, target("lever"))
    assert p.country_code == "IN" and "Requirements" in p.description and p.posted_at == 1759300000000


def test_ashby_parse_skips_unlisted():
    payload = {"jobs": [
        {"id": "1", "title": "ML Engineer", "location": "Bengaluru", "isListed": True,
         "publishedAt": "2026-10-01T00:00:00Z", "jobUrl": "https://jobs.ashbyhq.com/acme/1",
         "descriptionPlain": "x", "address": {"postalAddress": {"addressCountry": "India"}}},
        {"id": "2", "title": "Hidden", "isListed": False},
    ]}
    [p] = ashby.parse(payload, target("ashby"))
    assert p.country_code == "India"


def test_workable_parse_uses_experience_label():
    payload = {"jobs": [{"title": "QA Engineer", "shortcode": "AB12", "url": "https://apply.workable.com/j/AB12",
                         "published_on": "2026-09-30", "country": "India", "city": "Pune", "state": "Maharashtra",
                         "experience": "Entry level", "description": "<p>Test stuff</p>",
                         "locations": [{"countryCode": "IN", "city": "Pune"}]}]}
    [p] = workable.parse(payload, target("workable"))
    assert p.seniority_hint == "entry" and p.country_code == "IN"


def test_smartrecruiters_list_and_detail():
    payload = {"totalFound": 1, "content": [{
        "id": "744", "name": "Embedded Software Engineer", "releasedDate": "2026-10-05T10:00:00Z",
        "location": {"city": "Coimbatore", "country": "in"}, "company": {"name": "Acme Group"},
        "experienceLevel": {"id": "entry_level"}, "typeOfEmployment": {"label": "Full-time"},
    }]}
    [p] = smartrecruiters.parse_list(payload, target("smartrecruiters", "AcmeGroup"))
    assert p.hash_description is False and p.seniority_hint == "entry" and p.company_name == "Acme Group"
    text = smartrecruiters.parse_detail(
        {"jobAd": {"sections": {"jobDescription": {"text": "<p>Do</p>"}, "qualifications": {"text": "<p>B.E.</p>"}}}})
    assert "Do" in text and "B.E." in text
    # Stable URL form, never the slugged detail URL (keeps the content hash stable).
    assert p.url == "https://jobs.smartrecruiters.com/AcmeGroup/744"


def test_jsonld_parse_graph_and_location():
    html = """<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"JobPosting","title":"Graduate Engineer Trainee","datePosted":"2026-10-02",
       "url":"/careers/get-1","identifier":{"@type":"PropertyValue","value":"GET-1"},
       "hiringOrganization":{"name":"Acme Motors"},
       "jobLocation":{"@type":"Place","address":{"addressLocality":"Chennai","addressCountry":"IN"}},
       "description":"<p>Freshers welcome</p>"}]}</script></html>"""
    [p] = jsonld.parse_html(html, target("jsonld", "https://acme.example/careers"), "https://acme.example/careers")
    assert p.external_id.endswith(":GET-1") and p.url == "https://acme.example/careers/get-1"
    assert p.country_code == "IN" and p.company_name == "Acme Motors"


def test_json_feed_parse_requires_core_fields():
    rows = json_feed.parse({"jobs": [{"title": "Dev", "company": "X", "id": 1}, {"title": "No id"}]},
                           target("json_feed", "https://feed.example/jobs.json"))
    assert len(rows) == 1


@pytest.mark.parametrize(
    "url,provider,token",
    [
        ("https://boards.greenhouse.io/Databricks", "greenhouse", "databricks"),
        ("https://job-boards.greenhouse.io/stripe/jobs/123", "greenhouse", "stripe"),
        ("jobs.lever.co/meesho", "lever", "meesho"),
        ("https://jobs.ashbyhq.com/sarvam/abc", "ashby", "sarvam"),
        ("https://apply.workable.com/apna/", "workable", "apna"),
        ("https://acme.workable.com", "workable", "acme"),
        ("https://careers.smartrecruiters.com/BoschGroup", "smartrecruiters", "BoschGroup"),
        ("https://www.acme.com/careers#open", "jsonld", "https://www.acme.com/careers"),
    ],
)
def test_detect_source(url, provider, token):
    detected = detect_source(url)
    assert (detected.provider, detected.token) == (provider, token)


def test_detect_source_rejects_garbage():
    with pytest.raises(ValueError):
        detect_source("ftp://example.com/x")


# --- normalize ------------------------------------------------------------------------------


def test_normalize_filters_and_hashes():
    raws = [
        posting("Software Engineer I", description="<p>0-2 years of experience</p>", posted_at="2026-10-01"),
        posting("Senior Software Engineer"),
        posting("Software Engineer I", ["Berlin"]),
    ]
    raws[2].external_id = "x:3"
    raws[1].external_id = "x:2"
    result = normalize_postings(raws, max_years_exclusive=3, include_internships=False, now=NOW)
    assert [j.title for j in result.jobs] == ["Software Engineer I"]
    assert result.skipped == {"senior_title": 1, "not_india": 1}
    job = result.jobs[0]
    assert job.min_years == 0 and job.posted_at == "2026-10-01T00:00:00.000Z" and "<" not in job.description


def test_postings_without_original_link_are_never_stored():
    ok = posting("Software Engineer", description="0-1 years of experience")
    ok.url = "https://boards.example/jobs/1"
    missing = posting("Backend Engineer")
    missing.external_id, missing.url = "x:2", None
    relative = posting("Frontend Engineer")
    relative.external_id, relative.url = "x:3", "/careers/3"
    result = normalize_postings([ok, missing, relative], max_years_exclusive=3, include_internships=False, now=NOW)
    assert [j.url for j in result.jobs] == ["https://boards.example/jobs/1"]
    assert result.skipped == {"missing_url": 2}


def test_hash_ignores_description_when_provider_says_so():
    a = posting("Software Engineer", description="long text", hash_description=False)
    b = posting("Software Engineer", description="", hash_description=False)
    ha = normalize_postings([a], max_years_exclusive=3, include_internships=False, now=NOW).jobs[0].content_hash
    hb = normalize_postings([b], max_years_exclusive=3, include_internships=False, now=NOW).jobs[0].content_hash
    assert ha == hb


# --- scoring (port of apps/web/lib/job-scoring.ts) ------------------------------------------


def test_compatibility_rewards_skill_and_role_hits():
    job = {"title": "Backend Engineer", "company": "Acme", "location": "Bengaluru",
           "description": "Python, Postgres and FastAPI services. 1+ years experience."}
    empty, _ = compatibility_score(job, Career(), "")
    good, details = compatibility_score(
        job, Career(skills=["Python", "Postgres"], preferred_roles=["Backend Engineer"],
                    preferred_locations=["Bengaluru"], experience_level="1-3"), "python fastapi postgres")
    assert good > empty and details["skillHits"] == ["Python", "Postgres"]
    # Pinned: 12 + 38 (all skills) + 9 (one role) + 6 (one location) + resume 3/12*40=10 + 8 (exp) = 83
    assert good == 83


def test_ats_score_bounds():
    score, details = ats_score({"title": "T", "company": "C", "location": "L", "description": ""})
    assert 0 <= score <= 100 and details["wordCount"] == 0


# --- registry / seed ------------------------------------------------------------------------


def test_parse_import_line():
    assert parse_import_line("https://jobs.lever.co/acme") == (None, "https://jobs.lever.co/acme", None)
    assert parse_import_line("Acme, Inc, https://jobs.lever.co/acme, core") == (
        "Acme, Inc", "https://jobs.lever.co/acme", "core")
    with pytest.raises(ValueError):
        parse_import_line("just a name")


def test_shard_seed_is_stable_and_bounded():
    assert shard_seed("lever", "meesho") == shard_seed("lever", "meesho")
    assert 0 <= shard_seed("greenhouse", "x") < 10_000


def test_seed_file_is_consistent():
    seed = load_seed()
    assert len(seed) >= 50
    keys = {(r["provider"], r["token"].lower()) for r in seed}
    assert len(keys) == len(seed), "duplicate (provider, token) in seed"
    for row in seed:
        assert row["provider"] in BOARD_URLS
        assert row["sector"] in ("software", "core", "mixed")
        detected = detect_source(row["careersUrl"])
        assert (detected.provider, detected.token.lower()) == (row["provider"], row["token"].lower())
    json.dumps(seed)
