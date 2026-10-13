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
        ("Data Engineer", True),
        ("Associate Data Engineer", True),
        ("Analytics Engineer", True),
        ("Big Data Engineer", True),
        ("Member of Technical Staff", True),
        ("MTS 1", True),
        ("Software Development Trainee", True),
        ("Technology Analyst", True),
        ("Full Stack Developer", True),
        ("Design Engineer - Mechanical", True),
        ("Process Engineer", True),
        ("Electrical Engineer", True),
        ("Field Service Engineer", True),
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
        ("Member of Technical Staff", False),
        ("Senior Member of Technical Staff", True),
        ("MTS 3", True),
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
    kw = {"max_min_years": 10, "include_internships": False}
    berlin = filters.classify(posting("Software Engineer", ["Berlin, Germany"]), "", **kw)
    assert berlin.keep and berlin.region == "global"
    assert filters.classify(posting("Software Engineer", ["Remote"]), "", **kw).region == "remote"
    assert filters.classify(posting("Data Analyst", ["Remote - APAC"]), "", **kw).region == "india_remote"
    assert filters.classify(posting("Backend Engineer"), "", **kw).region == "india"
    assert filters.classify(posting("Marketing Manager"), "", **kw).reason == "not_engineering"
    assert filters.classify(posting("Software Engineering Intern"), "", **kw).reason == "internship"
    assert filters.classify(posting("Head of Software Engineering"), "", **kw).reason == "senior_title"
    senior = filters.classify(posting("Senior Software Engineer"), "", **kw)
    assert senior.keep and senior.min_years == filters.SENIOR_TITLE_YEARS
    assert filters.classify(posting("Staff Engineer"), "", **kw).min_years == filters.STAFF_TITLE_YEARS
    assert filters.classify(posting("Backend Engineer"), "12+ years of experience", **kw).reason == "experience"
    kept = filters.classify(posting("Backend Engineer"), "2-4 years of experience", **kw)
    assert kept.keep and (kept.min_years, kept.max_years) == (2, 4)
    # A stated requirement beats the title inference.
    assert filters.classify(posting("Senior Engineer"), "3+ years of experience", **kw).min_years == 3
    # Director-level provider label rejects even a junior-looking title.
    assert filters.classify(posting("Engineer", seniority_hint="director"), "", **kw).reason == "senior_title"
    # Interns allowed when configured.
    assert filters.classify(posting("Software Engineering Intern"), "", max_min_years=10,
                            include_internships=True).keep


def test_years_required_range():
    assert filters.years_required("1 to 3 years of professional experience") == (1, 3)
    assert filters.years_required("3+ years of experience") == (3, None)
    assert filters.years_required("Freshers welcome") == (0, None)
    assert filters.years_required("") == (None, None)


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

    # Known cities also come out canonical, which merges the two spellings.
    assert display_location(["coimbatore, , India", "Coimbatore, India"]) == "Coimbatore, India"
    assert display_location(["Foo Town, , India"]) == "Foo Town, India"


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
    result = normalize_postings(raws, max_min_years=10, include_internships=False, now=NOW)
    assert [j.title for j in result.jobs] == ["Software Engineer I", "Senior Software Engineer", "Software Engineer I"]
    assert [j.region for j in result.jobs] == ["india", "india", "global"]
    assert result.jobs[2].country_code == "DE" and result.jobs[0].country_code == "IN"
    job = result.jobs[0]
    assert job.min_years == 0 and job.posted_at == "2026-10-01T00:00:00.000Z" and "<" not in job.description


def test_postings_without_original_link_are_never_stored():
    ok = posting("Software Engineer", description="0-1 years of experience")
    ok.url = "https://boards.example/jobs/1"
    missing = posting("Backend Engineer")
    missing.external_id, missing.url = "x:2", None
    relative = posting("Frontend Engineer")
    relative.external_id, relative.url = "x:3", "/careers/3"
    result = normalize_postings([ok, missing, relative], max_min_years=10, include_internships=False, now=NOW)
    assert [j.url for j in result.jobs] == ["https://boards.example/jobs/1"]
    assert result.skipped == {"missing_url": 2}


def test_hash_ignores_description_when_provider_says_so():
    a = posting("Software Engineer", description="long text", hash_description=False)
    b = posting("Software Engineer", description="", hash_description=False)
    ha = normalize_postings([a], max_min_years=10, include_internships=False, now=NOW).jobs[0].content_hash
    hb = normalize_postings([b], max_min_years=10, include_internships=False, now=NOW).jobs[0].content_hash
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


def test_verifier_token_variants_include_suffixes():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "scripts" / "verify_career_sources.py"
    spec = importlib.util.spec_from_file_location("verify_career_sources", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    variants = module.token_variants("Headout")
    assert variants[0] == "headout"
    assert "headoutcareers" in variants
    assert module.token_variants("Tata 1mg")[:3] == ["tata1mg", "tata-1mg", "tata"]
    assert module.token_variants("") == []


def test_export_admin_sources_merge_only_adds():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "scripts" / "export_admin_sources.py"
    spec = importlib.util.spec_from_file_location("export_admin_sources", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    existing = [{"name": "Acme", "provider": "greenhouse", "token": "acme",
                 "careersUrl": "https://job-boards.greenhouse.io/acme", "sector": "core",
                 "verifiedIndiaPostings": 3}]
    rows = [
        # Same board, different case: skipped, existing entry untouched.
        {"company_name": "Acme Renamed", "provider": "greenhouse", "token": "ACME",
         "careers_url": "https://job-boards.greenhouse.io/acme", "sector": None},
        {"company_name": "Headout", "provider": "greenhouse", "token": "headoutcareers",
         "careers_url": "https://job-boards.greenhouse.io/headoutcareers", "sector": "software"},
        # Invalid rows are ignored.
        {"company_name": "Bad", "provider": "jsonld", "token": "x", "careers_url": "ftp://x",
         "sector": None},
    ]
    merged, added = module.merge_sources(existing, rows)
    assert [a["token"] for a in added] == ["headoutcareers"]
    assert added[0]["origin"] == "admin"
    assert merged[0] == existing[0]
    assert [m["name"] for m in merged] == ["Acme", "Headout"]


# --- single job link (Add job from a link) ------------------------------------------------


@pytest.mark.parametrize(
    "provider,url,expected",
    [
        ("greenhouse", "https://job-boards.greenhouse.io/acme/jobs/123?gh_jid=123", "123"),
        ("greenhouse", "https://boards.greenhouse.io/acme?gh_jid=456", "456"),
        ("greenhouse", "https://job-boards.greenhouse.io/acme", None),
        ("lever", "https://jobs.lever.co/acme/0b1c-2d3e/apply", "0b1c-2d3e"),
        ("ashby", "https://jobs.ashbyhq.com/acme/9f8e", "9f8e"),
        ("workable", "https://apply.workable.com/acme/j/AB12CD/", "AB12CD"),
        ("smartrecruiters", "https://jobs.smartrecruiters.com/Acme/7445-backend-engineer", "7445"),
        ("smartrecruiters", "https://careers.smartrecruiters.com/Acme", None),
    ],
)
def test_single_posting_id(provider, url, expected):
    from app.discovery.jobs import single

    assert single.posting_id(provider, url) == expected


def test_single_blocked_sites_are_never_fetched():
    import httpx

    from app.discovery.jobs import single

    def fail(request):  # any network call would be a bug
        raise AssertionError(f"fetched {request.url}")

    with httpx.Client(transport=httpx.MockTransport(fail)) as client:
        for url, source in [
            ("https://in.indeed.com/viewjob?jk=1", "indeed"),
            ("https://www.naukri.com/job-listings-1", "other"),
        ]:
            with pytest.raises(single.JobLinkError) as err:
                single.fetch_job_from_url(client, url)
            assert err.value.source == source
        with pytest.raises(single.JobLinkError):
            single.fetch_job_from_url(client, "not a url")
        with pytest.raises(single.JobLinkError, match="careers board"):
            single.fetch_job_from_url(client, "https://job-boards.greenhouse.io/acme")


def test_single_greenhouse_and_jsonld_pages():
    import httpx

    from app.discovery.jobs import single

    page = """<html><head><script type="application/ld+json">
    {"@type": "JobPosting", "title": "Graduate Engineer Trainee", "datePosted": "2026-10-01",
     "hiringOrganization": {"name": "Acme Motors"},
     "jobLocation": {"address": {"addressLocality": "Pune", "addressCountry": "IN"}},
     "description": "<p>Freshers welcome.</p>", "url": "https://acme.in/careers/get"}
    </script></head></html>"""

    def handler(request):
        if request.url.host == "boards-api.greenhouse.io":
            return httpx.Response(200, json={
                "id": 123, "title": "Software Engineer", "company_name": "Acme",
                "absolute_url": "https://job-boards.greenhouse.io/acme/jobs/123",
                "location": {"name": "Bengaluru"}, "content": "&lt;p&gt;Build things.&lt;/p&gt;",
                "first_published": "2026-10-05T10:00:00Z",
            })
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, text=page)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        gh = single.fetch_job_from_url(client, "https://job-boards.greenhouse.io/acme/jobs/123")
        assert (gh.title, gh.company, gh.location, gh.source) == (
            "Software Engineer", "Acme", "Bengaluru", "careers")
        assert "Build things." in gh.description
        assert gh.postedAt and gh.postedAt.startswith("2026-10-05")

        page_job = single.fetch_job_from_url(client, "https://acme.in/careers/get")
        assert page_job.title == "Graduate Engineer Trainee"
        assert page_job.company == "Acme Motors"
        assert "Pune" in page_job.location
        assert page_job.description == "Freshers welcome."


def test_linkedin_job_ids():
    from app.discovery.jobs import linkedin

    for url in [
        "https://www.linkedin.com/jobs/view/senior-devops-engineer-at-arbor-4455725254?trk=x",
        "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4455725254",
        "https://in.linkedin.com/jobs/view/4455725254/",
        "https://www.linkedin.com/comm/jobs/view/4455725254",
        "https://m.linkedin.com/jobs/view/4455725254",
        "https://www.linkedin.com/jobs/search/?keywords=x&currentJobId=4455725254",
    ]:
        assert linkedin.job_id_from_url(url) == "4455725254", url
    assert linkedin.job_id_from_url("https://www.linkedin.com/feed/") is None


_LI_GUEST = """<section class="top-card-layout"><h2 class="top-card-layout__title topcard__title">
Senior DevOps Engineer</h2><span class="topcard__flavor"><a class="topcard__org-name-link">
Arbor Education</a></span><span class="topcard__flavor topcard__flavor--bullet">
Pune, Maharashtra, India (Hybrid)</span><span class="posted-time-ago__text">3 days ago</span>
<div class="compensation__salary">₹20,00,000/yr - ₹30,00,000/yr</div></section>
<div class="show-more-less-html__markup"><p>Run AWS with Terraform and Docker.</p>
<ul><li>CI/CD</li></ul><script>alert(1)</script></div>
<ul><li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">
Seniority level</h3><span class="description__job-criteria-text">Mid-Senior level</span></li>
<li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">
Employment type</h3><span class="description__job-criteria-text">Full-time</span></li></ul>
<code id="applyUrl" style="display: none"><!--"https://www.linkedin.com/jobs/view/externalApply/1?url=https%3A%2F%2Fjobs.acme.com%2F1&amp;urlHash=x"--></code>"""


def test_linkedin_guest_posting_parsed():
    from datetime import datetime, timezone

    import httpx

    from app.discovery.jobs import single

    seen = []

    def handler(request):
        seen.append(str(request.url))
        assert "Chrome" in request.headers["user-agent"]
        if "/jobs-guest/jobs/api/jobPosting/4455725254" in str(request.url):
            return httpx.Response(200, text=_LI_GUEST)
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        job = single.fetch_job_from_url(
            client, "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4455725254"
        )
    assert (job.title, job.company, job.source) == ("Senior DevOps Engineer", "Arbor Education", "linkedin")
    assert job.location.startswith("Pune") and job.workMode == "hybrid"
    assert (job.employmentType, job.seniority) == ("Full-time", "Mid-Senior level")
    assert job.salary and "20,00,000" in job.salary
    assert job.applyUrl == "https://jobs.acme.com/1"
    assert "alert" not in job.description and "• CI/CD" in job.description
    assert {"aws", "terraform", "docker"} <= set(job.skills)
    assert job.url == "https://www.linkedin.com/jobs/view/4455725254/"
    assert job.postedAt and job.postedAt <= datetime.now(timezone.utc).date().isoformat()


def test_linkedin_failures_are_friendly():
    import httpx

    from app.discovery.jobs import single

    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(429))) as client:
        with pytest.raises(single.JobLinkError, match="fill manually") as err:
            single.fetch_job_from_url(client, "https://www.linkedin.com/jobs/view/4455725254")
        assert err.value.source == "linkedin"
        with pytest.raises(single.JobLinkError, match="isn't a job posting"):
            single.fetch_job_from_url(client, "https://www.linkedin.com/in/someone")


def test_successfactors_and_generic_pages():
    import httpx

    from app.discovery.jobs import single

    sf = """<html><head><title>Campus-Beginner Job Details | HCLTech</title>
    <meta name="description" content="Campus-Beginner"/><script>var x=1;</script></head><body>
    <nav><a>Jobs</a><a>Login</a></nav>
    <span itemprop="title">Campus-Beginner </span>
    <span data-careersite-propertyid="location">Noida, IN</span>
    <span itemprop="datePosted">2026-10-01</span>
    <span itemprop="description"><div><h2>Job Summary</h2><p>Fresher with GCP and Kubernetes basics.</p></div></span>
    </body></html>"""
    generic = """<html><head><meta property="og:title" content="Data Engineer"/>
    <meta property="og:site_name" content="Acme"/></head><body><header>Menu</header><h1>Data Engineer</h1>
    <div class="content"><p>""" + "We build pipelines with Python and SQL. " * 10 + """</p></div></body></html>"""

    def handler(request):
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, text=sf if "hcltech" in request.url.host else generic)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        job = single.fetch_job_from_url(client, "https://careers.hcltech.com/job/Campus-Beginner/154180-en_US")
        assert (job.title, job.company, job.location) == ("Campus-Beginner", "HCLTech", "Noida, IN")
        assert job.provider == "successfactors" and job.postedAt.startswith("2026-10-01")
        assert "Fresher with GCP" in job.description and "var x" not in job.description
        other = single.fetch_job_from_url(client, "https://acme.example/careers/data-engineer")
        assert (other.title, other.company) == ("Data Engineer", "Acme")
        assert "pipelines" in other.description and "Menu" not in other.description
        assert "python" in other.skills


def test_canonical_locations_shared_file_and_aliases():
    import json
    from pathlib import Path

    from app.discovery.jobs import locations

    root = Path(__file__).resolve().parents[3]
    shared = root / "data/locations/canonical-locations.json"
    assert locations.DATA_PATH == shared
    # The web module imports the same file (no per-app copies).
    web_index = (root / "apps/web/lib/locations/index.ts").read_text(encoding="utf-8")
    assert '"../../../../data/locations/canonical-locations.json"' in web_index
    assert not list(root.glob("apps/**/canonical[-_]locations.json"))
    data = json.loads(shared.read_text(encoding="utf-8"))
    assert locations._data() == data
    assert len(data["cities"]) > 500
    for city in data["cities"]:
        assert -90 <= city["lat"] <= 90 and -180 <= city["lng"] <= 180
        assert len(city["countryCode"]) == 2
    cases = {
        "Bangalore": "Bengaluru, India",
        "Gurgaon, Haryana, India": "Gurugram, India",
        "Bombay": "Mumbai, India",
        "Pune (Hybrid)": "Pune, India",
        "Remote - India": "Remote",
        "Hyderabad": "Hyderabad, India",
        "Hyderabad, Pakistan": "Hyderabad, Pakistan",
        "Sao Paulo": "São Paulo, Brazil",
        "London, UK": "London, United Kingdom",
        "Bengaluru, Germany": None,
        "Bengaluru · Hyderabad": None,
        "India": None,
    }
    for raw, want in cases.items():
        assert locations.canonical_location(raw) == want, raw


def test_ingest_display_location_is_canonical():
    from app.discovery.jobs.normalize import display_location

    assert display_location(["Bangalore, Karnataka, India", "Gurgaon"]) == "Bengaluru, India · Gurugram, India"
    assert display_location(["Magrahat-II, West Bengal, India"]) == "Magrahat-II, West Bengal, India"


def test_jd_boilerplate_is_stripped_with_shared_patterns():
    from pathlib import Path

    from app.discovery.jobs import jd_clean

    root = Path(__file__).resolve().parents[3]
    assert jd_clean.DATA_PATH == root / "data/jd/boilerplate.json"
    sample = (root / "data/jd/fixtures/sample.txt").read_text(encoding="utf-8")
    expected = (root / "data/jd/fixtures/sample.expected.txt").read_text(encoding="utf-8")
    assert jd_clean.strip_boilerplate(sample) == expected.strip()
    # Over-stripping falls back to the original; plain JDs are unchanged.
    assert jd_clean.strip_boilerplate("Privacy Notice\nWe process personal data.") == (
        "Privacy Notice\nWe process personal data."
    )
    plain = "Responsibilities\n• Build APIs.\n\nRequirements\n• Python."
    assert jd_clean.strip_boilerplate(plain) == plain


def test_run_history_window_is_inclusive_ist_days():
    from datetime import date

    from app.discovery.runs.store import history_window

    today = date(2026, 10, 13)
    assert history_window(days=7, today=today) == (date(2026, 10, 7), today)
    assert history_window(months=1, today=today) == (date(2026, 9, 14), today)
    assert history_window(months=3, today=today) == (date(2026, 7, 14), today)
    assert history_window(months=1, today=date(2026, 3, 31)) == (date(2026, 3, 1), date(2026, 3, 31))


# --- experience window + India-first ranking -------------------------------------------------


def test_experience_window_and_closeness():
    from app.discovery.config import DiscoverySettings
    from app.discovery.jobs import ranking

    settings = DiscoverySettings()
    assert ranking.max_min_years(settings, 2) == 4  # 2 YOE → fresher through 4-year roles
    assert ranking.max_min_years(settings, 0) == 2
    assert ranking.experience_closeness(2, 2) == ranking.CLOSENESS_MAX
    assert ranking.experience_closeness(0, 2) < ranking.experience_closeness(2, 2)
    assert ranking.experience_closeness(None, 2) == ranking.CLOSENESS_MAX // 2


def test_rank_puts_india_first():
    from app.discovery.jobs import ranking

    india = ranking.rank_value(60, {"min_years": 1, "region": "india"}, 1)
    berlin = ranking.rank_value(60, {"min_years": 1, "region": "global"}, 1)
    remote_india = ranking.rank_value(60, {"min_years": 1, "region": "india_remote"}, 1)
    assert india > remote_india > berlin
