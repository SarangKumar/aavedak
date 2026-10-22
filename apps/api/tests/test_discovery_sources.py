"""Pure-layer tests for the ATS adapters added for broader coverage, the cross-company
index, the ingest outage guard, and company discovery.

Every provider test uses a payload trimmed from a real response of that platform's public
endpoint (Rippling `ats.rippling.com/api/v2/board/rippling`, Breezy `breezy.breezy.hr`,
Personio `personio.jobs.personio.de`, Teamtailor `career.teamtailor.com`, Workable's index
`jobs.workable.com`), so the shapes are the live ones. HTTP-level behaviour (pagination,
partial failures, timeouts, non-retryable 404s) runs against `httpx.MockTransport`.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.discovery.jobs import board_probe, company_discovery, health
from app.discovery.jobs.careers_crawl import detect_embeds
from app.discovery.jobs.models import SourceTarget
from app.discovery.jobs.normalize import normalize_postings
from app.discovery.jobs.providers import BOARD_URLS, ProviderError, detect_source, get_provider
from app.discovery.jobs.providers import breezy, personio, rippling, teamtailor, workable_index


def target(provider: str, token: str, name: str = "Acme") -> SourceTarget:
    return SourceTarget(id="cs1", company_name=name, provider=provider, token=token, careers_url="")


def client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)


# --- Rippling -----------------------------------------------------------------------------

RIPPLING_PAGE = {
    "items": [
        {
            "id": "dd867687",
            "name": "Software Engineer II - Monetization",
            "url": "https://ats.rippling.com/acme/jobs/dd867687",
            "department": {"name": "Engineering"},
            "locations": [
                {"name": "Bengaluru, India", "country": "India", "countryCode": "IN",
                 "state": "Karnataka", "city": "Bengaluru", "workplaceType": "ONSITE"}
            ],
        },
        {"id": "", "name": "No id"},
        {"id": "x2", "name": ""},
    ],
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1,
}
RIPPLING_DETAIL = {
    "uuid": "dd867687",
    "name": "Software Engineer II - Monetization",
    "description": {"company": "<p>About Acme</p>", "role": "<p>2+ years with Python</p>"},
    "workLocations": ["Bengaluru, India"],
    "employmentType": {"label": "SALARIED_FT", "id": "Salaried, full-time"},
    "createdOn": "2026-10-19T07:51:47.340000+00:00",
    "companyName": "Acme Systems",
    "payRangeDetails": [
        {"currency": "INR", "payRangeLowerBound": 1800000, "payRangeUpperBound": 2400000,
         "payFrequency": "Per Year"}
    ],
}


def test_rippling_list_detail_and_pay():
    postings = rippling.parse_list(RIPPLING_PAGE, target("rippling", "acme"))
    assert len(postings) == 1  # rows without an id or a title are dropped
    posting = postings[0]
    assert posting.external_id == "acme:dd867687"
    assert posting.locations == ["Bengaluru, India"] and posting.country_code == "IN"
    # The list has no description, so it must not take part in the content hash.
    assert posting.hash_description is False and posting.description == ""

    rippling.apply_detail(posting, RIPPLING_DETAIL)
    assert "About Acme" in posting.description and "2+ years" in posting.description
    assert posting.hash_description is True
    assert posting.posted_at == "2026-10-19T07:51:47.340000+00:00"
    assert posting.company_name == "Acme Systems"
    assert posting.salary is not None and posting.salary.currency == "INR"
    assert "₹18 L" in posting.salary.text and "/ year" in posting.salary.text


def test_rippling_pages_until_total_pages_and_survives_a_failed_detail():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if "/jobs/" in request.url.path:
            return httpx.Response(500)  # a detail call fails: the list posting is still kept
        page = int(request.url.params.get("page", 1))
        return httpx.Response(
            200,
            json={
                "items": [
                    {"id": f"j{page}", "name": "Backend Engineer",
                     "url": f"https://ats.rippling.com/acme/jobs/j{page}",
                     "locations": [{"name": "Pune, India", "countryCode": "IN"}]}
                ],
                "totalPages": 2,
            },
        )

    with client(handler) as http:
        result = rippling.RipplingProvider().fetch(http, target("rippling", "acme"))
    assert [p.external_id for p in result.postings] == ["acme:j1", "acme:j2"]
    assert result.complete is True
    assert sum(1 for u in seen if "/jobs/j" in u) == 2  # one detail attempt per in-scope role


def test_rippling_page_cap_marks_the_fetch_incomplete():
    def handler(request: httpx.Request) -> httpx.Response:
        if "/jobs/" in request.url.path:
            return httpx.Response(404)
        return httpx.Response(
            200,
            json={
                "items": [{"id": "j", "name": "Ops Lead", "url": "https://ats.rippling.com/acme/jobs/j",
                           "locations": []}],
                "totalPages": 99,
            },
        )

    with client(handler) as http:
        result = rippling.RipplingProvider().fetch(http, target("rippling", "acme"))
    # More pages than the cap: the missing postings may never be treated as closed.
    assert result.complete is False and len(result.postings) == rippling.MAX_PAGES


# --- Breezy -------------------------------------------------------------------------------

BREEZY_FEED = [
    {
        "id": "98323abf2296",
        "name": "Platform Engineer",
        "url": "https://acme.breezy.hr/p/98323abf2296-platform-engineer",
        "published_date": "2026-10-15T14:37:22.684Z",
        "type": {"id": "full_time", "name": "Full-Time"},
        "location": {"country": {"name": "India", "id": "IN"}, "state": {"id": "KA", "name": "Karnataka"},
                     "city": "Bengaluru", "is_remote": False, "name": "Bengaluru, KA"},
        "salary": "₹12,00,000 – ₹18,00,000 / year",
        "company": {"name": "Acme Labs", "friendly_id": "acme"},
        "locations": [{"country": {"name": "India", "id": "IN"}, "city": "Bengaluru",
                       "is_remote": False, "name": "Bengaluru, KA", "id": "2007f9c3168b"}],
    }
]


def test_breezy_parse_has_no_description_and_keeps_stated_pay():
    postings = breezy.parse(BREEZY_FEED, target("breezy", "acme"))
    assert len(postings) == 1
    posting = postings[0]
    assert posting.external_id == "acme:98323abf2296"
    assert posting.company_name == "Acme Labs" and posting.country_code == "IN"
    assert posting.locations == ["Bengaluru, KA"]
    # The public feed carries no description, so it must be excluded from the hash.
    assert posting.description == "" and posting.hash_description is False
    # Breezy's `salary` is free text the company typed; it is kept verbatim, never re-derived.
    assert posting.salary is not None and posting.salary.text == "₹12,00,000 – ₹18,00,000 / year"


def test_breezy_rejects_a_non_list_payload():
    with client(lambda r: httpx.Response(200, json={"jobs": []})) as http:
        with pytest.raises(ProviderError):
            breezy.BreezyProvider().fetch(http, target("breezy", "acme"))


# --- Personio -----------------------------------------------------------------------------

PERSONIO_XML = """<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
<position>
  <id>1834171</id>
  <subcompany>Acme SE &amp; Co. KG</subcompany>
  <office>Bengaluru</office>
  <additionalOffices><office>Pune</office></additionalOffices>
  <department>Product and Tech</department>
  <name>Software Engineer, Data Platform</name>
  <jobDescriptions>
    <jobDescription><name>The Role</name><value><![CDATA[<p>Build pipelines</p>]]></value></jobDescription>
    <jobDescription><name>Requirements</name><value><![CDATA[<ul><li>2+ years</li></ul>]]></value></jobDescription>
  </jobDescriptions>
  <employmentType>permanent</employmentType>
  <seniority>entry-level</seniority>
  <schedule>full-time</schedule>
  <createdAt>2026-10-13T14:10:41+00:00</createdAt>
</position>
<position><id></id><name>Broken</name></position>
</workzag-jobs>"""


def test_personio_xml_parse():
    postings = personio.parse(
        PERSONIO_XML, target("personio", "acme"), base="https://acme.jobs.personio.de"
    )
    assert len(postings) == 1  # the position without an id is dropped
    posting = postings[0]
    assert posting.external_id == "acme:1834171"
    assert posting.url == "https://acme.jobs.personio.de/job/1834171"
    assert posting.locations == ["Bengaluru", "Pune"]
    assert "The Role" in posting.description and "Build pipelines" in posting.description
    assert posting.posted_at == "2026-10-13T14:10:41+00:00"
    assert posting.company_name == "Acme SE & Co. KG"


def test_personio_falls_back_to_the_com_host_and_rejects_other_pages():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.host)
        if request.url.host.endswith("personio.de"):
            return httpx.Response(404)
        return httpx.Response(200, text=PERSONIO_XML)

    with client(handler) as http:
        result = personio.PersonioProvider().fetch(http, target("personio", "acme"))
    assert calls == ["acme.jobs.personio.de", "acme.jobs.personio.com"]
    assert result.postings[0].url.startswith("https://acme.jobs.personio.com/job/")

    with client(lambda r: httpx.Response(200, text="<html>not a feed</html>")) as http:
        with pytest.raises(ProviderError):
            personio.PersonioProvider().fetch(http, target("personio", "acme"))


def test_personio_invalid_xml_is_a_provider_error():
    with pytest.raises(ProviderError):
        personio.parse("<workzag-jobs><position>", target("personio", "acme"), base="https://x.example")


# --- Teamtailor ---------------------------------------------------------------------------

TEAMTAILOR_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:tt="https://teamtailor.com/locations">
  <channel>
    <title>Acme</title>
    <item>
      <title>Backend Engineer</title>
      <description>&lt;p&gt;Go and Postgres&lt;/p&gt;</description>
      <pubDate>Fri, 24 Jul 2026 09:05:16 +0200</pubDate>
      <link>https://career.acme.com/jobs/8118064-backend-engineer</link>
      <remoteStatus>hybrid</remoteStatus>
      <guid>4ff07fd5</guid>
      <tt:locations>
        <tt:location><tt:name>Bengaluru</tt:name><tt:city>Bengaluru</tt:city><tt:country>India</tt:country></tt:location>
      </tt:locations>
      <tt:department>Engineering</tt:department>
    </item>
    <item><title>No link or guid</title></item>
  </channel>
</rss>"""


def test_teamtailor_rss_parse():
    postings = teamtailor.parse(TEAMTAILOR_RSS, target("teamtailor", "career.acme.com"))
    assert len(postings) == 1
    posting = postings[0]
    assert posting.external_id == "career.acme.com:4ff07fd5"
    assert posting.locations == ["Bengaluru, India"]
    assert posting.url == "https://career.acme.com/jobs/8118064-backend-engineer"
    assert posting.posted_at == "Fri, 24 Jul 2026 09:05:16 +0200"
    assert "Go and Postgres" in posting.description


@pytest.mark.parametrize(
    "token,expected",
    [
        ("career.acme.com", "career.acme.com"),
        ("https://career.acme.com/jobs", "career.acme.com"),
        ("www.Career.Acme.com", "career.acme.com"),
    ],
)
def test_teamtailor_feed_host(token, expected):
    assert teamtailor.feed_host(token) == expected


def test_teamtailor_rejects_a_token_that_is_not_a_host():
    with pytest.raises(ProviderError):
        teamtailor.feed_host("acme")


# --- Workable cross-company index ----------------------------------------------------------

INDEX_PAGE = {
    "title": "Workable",
    "totalSize": 2,
    "nextPageToken": "tok2",
    "jobs": [
        {
            "id": "d2139d5a",
            "title": "Software Engineer (Full Stack)",
            "state": "published",
            "employmentType": "Full-time",
            "description": "<p>About us</p>",
            "requirementsSection": "<ul><li>1+ years</li></ul>",
            "benefitsSection": "",
            "url": "https://jobs.workable.com/view/abc/software-engineer",
            "locations": ["TELECOMMUTE", "India"],
            "location": {"city": "", "subregion": None, "countryName": "India"},
            "created": "2026-10-22T05:23:11.297Z",
            "company": {"id": "0e437", "title": "ThoughtFull World", "website": "https://www.thoughtfull.world/"},
            "workplace": "remote",
        },
        {
            "id": "unlisted",
            "title": "Draft role",
            "state": "draft",
            "url": "https://jobs.workable.com/view/x/draft",
            "location": {"countryName": "India"},
            "company": {"title": "Acme", "website": "https://acme.example/"},
        },
        {"id": "nourl", "title": "No link", "state": "published", "company": {"title": "Acme"}},
    ],
}


def test_workable_index_parse_keeps_published_jobs_with_links():
    postings = workable_index.parse(INDEX_PAGE, target("workable_index", "india:software engineer"))
    assert len(postings) == 1  # drafts and link-less rows are dropped
    posting = postings[0]
    # Keyed on the posting alone: the same job found through two index specs is one ref.
    assert posting.external_id == "workable-index:d2139d5a"
    assert posting.company_name == "ThoughtFull World"
    assert posting.locations == ["Remote - India"]
    assert "About us" in posting.description and "1+ years" in posting.description


def test_workable_index_token_and_company_hints():
    assert workable_index.split_token("india:software engineer") == ("india", "software engineer")
    assert workable_index.split_token("india:") == ("india", "")
    with pytest.raises(ProviderError):
        workable_index.split_token(":engineer")
    assert workable_index.company_candidates(INDEX_PAGE) == [
        ("ThoughtFull World", "https://www.thoughtfull.world/"),
        ("Acme", "https://acme.example/"),
    ]


def test_workable_index_pages_with_tokens_and_is_never_complete():
    requests: list[dict[str, str]] = []

    # A full page (PAGE_SIZE rows) is what makes the provider follow `nextPageToken`.
    full_page = {
        **INDEX_PAGE,
        "jobs": INDEX_PAGE["jobs"]
        + [
            {"id": f"pad{i}", "title": "Backend Engineer", "state": "published",
             "url": f"https://jobs.workable.com/view/pad{i}/backend-engineer",
             "location": {"countryName": "India"}, "company": {"title": "Acme"}}
            for i in range(workable_index.PAGE_SIZE - len(INDEX_PAGE["jobs"]))
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(dict(request.url.params))
        if request.url.params.get("pageToken") == "tok2":
            return httpx.Response(200, json={"jobs": [], "nextPageToken": None})
        return httpx.Response(200, json=full_page)

    with client(handler) as http:
        result = workable_index.WorkableIndexProvider().fetch(
            http, target("workable_index", "india:software engineer")
        )
    assert requests[0] == {"location": "india", "query": "software engineer"}
    assert requests[1]["pageToken"] == "tok2"
    # A query view over many companies may never close a job.
    assert result.complete is False
    assert result.company_hints == [("ThoughtFull World", "https://www.thoughtfull.world/"),
                                    ("Acme", "https://acme.example/")]


def test_index_postings_normalize_into_the_shared_job_model():
    postings = workable_index.parse(INDEX_PAGE, target("workable_index", "india:software engineer"))
    result = normalize_postings(postings, max_min_years=10, include_internships=False)
    assert len(result.jobs) == 1
    job = result.jobs[0]
    assert job.company_name == "ThoughtFull World" and job.region == "india"
    assert job.url == "https://jobs.workable.com/view/abc/software-engineer"
    assert job.dedupe_key.startswith("thoughtfull world|software engineer")
    assert job.content_hash and job.posted_at == "2026-10-22T05:23:11.297Z"


def test_index_tokens_are_unique_and_parse():
    assert len(set(workable_index.INDEX_TOKENS)) == len(workable_index.INDEX_TOKENS)
    for token in workable_index.INDEX_TOKENS:
        location, query = workable_index.split_token(token)
        assert location and query


# --- source detection ----------------------------------------------------------------------


@pytest.mark.parametrize(
    "url,provider,token",
    [
        ("https://ats.rippling.com/acme/jobs", "rippling", "acme"),
        ("https://acme.breezy.hr/", "breezy", "acme"),
        ("https://acme.jobs.personio.de/xml", "personio", "acme"),
        ("https://acme.jobs.personio.com/", "personio", "acme"),
        ("https://acme.wd3.myworkdayjobs.com/en-US/AcmeCareers", "workday", "acme.wd3/AcmeCareers"),
        ("https://acme.wd3.myworkdayjobs.com/AcmeCareers", "workday", "acme.wd3/AcmeCareers"),
        ("https://acme.teamtailor.com/jobs", "teamtailor", "acme.teamtailor.com"),
    ],
)
def test_detect_source_for_the_new_platforms(url, provider, token):
    detected = detect_source(url)
    assert (detected.provider, detected.token) == (provider, token)
    assert provider in BOARD_URLS and get_provider(provider).key == provider


@pytest.mark.parametrize(
    "html,page_url,expected",
    [
        ('<script src="https://ats.rippling.com/api/v2/board/acme/jobs"></script>', "https://acme.com/careers",
         ("rippling", "acme")),
        ('<iframe src="https://acme.breezy.hr/"></iframe>', "https://acme.com/careers", ("breezy", "acme")),
        ('<a href="https://acme.jobs.personio.de/">roles</a>', "https://acme.com/careers", ("personio", "acme")),
        ('<script src="https://cdn.teamtailor.com/app.js"></script>', "https://career.acme.com/jobs",
         ("teamtailor", "career.acme.com")),
    ],
)
def test_careers_pages_on_the_new_platforms_are_detected(html, page_url, expected):
    embeds = detect_embeds(html, page_url)
    assert (embeds[0].provider, embeds[0].token) == expected


# --- outage guard --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "complete,fetched,previous,expect_complete,expect_guarded",
    [
        (True, 50, 48, True, False),      # normal scan
        (True, 1, 60, False, True),       # collapsed: almost certainly a broken source
        (True, 25, 60, True, False),      # a real round of hiring closing, above the ratio
        (True, 0, 60, False, True),       # empty answer from a board that had 60 roles
        (True, 1, 4, True, False),        # tiny board: 4 → 1 is ordinary, not an outage
        (True, 0, None, True, False),     # first ever scan: nothing to compare against
        (False, 0, 60, False, False),     # already incomplete; the guard changes nothing
    ],
)
def test_guard_complete(complete, fetched, previous, expect_complete, expect_guarded):
    guard = health.guard_complete(complete=complete, fetched=fetched, previous=previous)
    assert (guard.complete, guard.guarded) == (expect_complete, expect_guarded)


# --- company discovery (pure parts) ---------------------------------------------------------


@pytest.mark.parametrize(
    "website,expected",
    [
        ("https://www.thoughtfull.world/", "thoughtfull.world"),
        ("acme.co.in", "acme.co.in"),
        ("https://careers.acme.com/jobs", "acme.com"),
        ("https://acme.workable.com/", None),       # a hiring platform, not the company site
        ("https://www.linkedin.com/company/acme", None),
        ("mailto:jobs@acme.com", None),
        ("", None),
        (None, None),
    ],
)
def test_candidate_domain(website, expected):
    assert company_discovery.candidate_domain(website) == expected


def test_careers_url_candidates_are_bounded_and_https():
    urls = company_discovery.careers_url_candidates("acme.com")
    assert urls[0] == "https://acme.com/careers" and len(urls) <= 4
    assert all(u.startswith("https://") for u in urls)


@pytest.mark.parametrize(
    "url,html,expected",
    [
        ("https://acme.com/careers", "<title>Careers at Acme</title>", True),
        ("https://acme.com/open-roles", "<title>Join us</title>", True),
        ("https://acme.com/", "<title>Acme — Home</title>", False),       # redirected to the home page
        ("https://acme.com/careers", "<title>404 Not Found</title>", False),
        ("https://acme.com/x", "<html></html>", False),
    ],
)
def test_looks_like_careers_page(url, html, expected):
    assert company_discovery.looks_like_careers_page(url, html) is expected


def test_token_variants_and_find_board_stay_inside_their_budget():
    assert board_probe.token_variants("Tata 1mg")[:3] == ["tata1mg", "tata-1mg", "tata"]
    assert board_probe.token_variants("") == []

    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(404)

    with client(handler) as http:
        found, used = board_probe.find_board(http, "Acme Corp", max_requests=5)
    assert found is None and used == 5 and len(calls) == 5

    def hit(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if "boards-api.greenhouse.io/v1/boards/acmecorp/jobs" in str(request.url):
            return httpx.Response(200, json={"jobs": [
                {"id": 1, "title": "Backend Engineer", "absolute_url": "https://x.example/1",
                 "location": {"name": "Bengaluru, India"}, "content": ""}
            ]})
        return httpx.Response(404)

    calls.clear()
    with client(hit) as http:
        found, used = board_probe.find_board(http, "Acme Corp", max_requests=20)
    assert found is not None
    assert (found.provider, found.token, found.india, found.engineering) == ("greenhouse", "acmecorp", 1, 1)
    assert used == 1  # the first (token, platform) attempt hit


def test_probe_board_rejects_an_empty_or_unparseable_board():
    with client(lambda r: httpx.Response(200, json={"jobs": []})) as http:
        assert board_probe.probe_board(http, "greenhouse", "acme", "Acme") is None
    with client(lambda r: httpx.Response(200, text="not json")) as http:
        assert board_probe.probe_board(http, "greenhouse", "acme", "Acme") is None
    with client(lambda r: httpx.Response(200, json={"jobs": []})) as http:
        assert board_probe.probe_board(http, "nosuchats", "acme", "Acme") is None


def test_probe_order_only_names_platforms_findable_from_a_token():
    assert set(board_probe.PROBE_ORDER) == set(board_probe.PROBE_SPECS)
    # Personio (XML) and Teamtailor (token = the company's own host) cannot be probed.
    assert "personio" not in board_probe.PROBE_SPECS
    assert "teamtailor" not in board_probe.PROBE_SPECS


def test_resolution_prefers_a_board_embedded_in_the_careers_page():
    pages = {
        "https://acme.com/careers": (200, "<title>Careers at Acme</title>"
                                          '<script src="https://boards.greenhouse.io/embed/job_board/js?for=acmehq"></script>'),
    }

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        status, html = pages.get(url, (404, ""))
        return httpx.Response(status, text=html, headers={"content-type": "text/html"})

    from app.discovery.jobs.careers_crawl import PoliteFetcher

    with client(handler) as http:
        fetcher = PoliteFetcher(http, max_requests=20, deadline_seconds=20, host_delay=0)
        result = company_discovery.resolve(
            fetcher, company_discovery.Candidate("d1", "Acme", "acme.com", "workable_index")
        )
    assert result.status == "board"
    assert (result.ats, result.ats_token) == ("greenhouse", "acmehq")
    assert result.careers_url == "https://acme.com/careers"


def test_resolution_falls_back_to_the_careers_page_then_to_nothing():
    def careers_only(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        if url == "https://acme.com/careers":
            return httpx.Response(200, text="<title>Careers</title><div id=app></div>",
                                  headers={"content-type": "text/html"})
        return httpx.Response(404)

    from app.discovery.jobs.careers_crawl import PoliteFetcher

    with client(careers_only) as http:
        fetcher = PoliteFetcher(http, max_requests=30, deadline_seconds=20, host_delay=0)
        result = company_discovery.resolve(
            fetcher, company_discovery.Candidate("d1", "Acme", "acme.com", "workable_index")
        )
    assert result.status == "careers_page" and result.careers_url == "https://acme.com/careers"

    def nothing(request: httpx.Request) -> httpx.Response:
        if str(request.url).endswith("/robots.txt"):
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        return httpx.Response(404)

    with client(nothing) as http:
        fetcher = PoliteFetcher(http, max_requests=30, deadline_seconds=20, host_delay=0)
        result = company_discovery.resolve(
            fetcher, company_discovery.Candidate("d2", "Nope Ltd", "nope.example", "applications")
        )
    assert result.status == "none" and result.ats is None


def test_resolution_respects_robots_disallow():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/robots.txt"):
            return httpx.Response(200, text="User-agent: AavedakJobsBot\nDisallow: /")
        seen.append(url)
        return httpx.Response(200, text="<title>Careers</title>", headers={"content-type": "text/html"})

    from app.discovery.jobs.careers_crawl import PoliteFetcher

    with client(handler) as http:
        fetcher = PoliteFetcher(http, max_requests=30, deadline_seconds=20, host_delay=0)
        result = company_discovery.resolve(
            fetcher, company_discovery.Candidate("d3", "Acme", "acme.com", "workable_index")
        )
    # No careers page was ever fetched, so nothing can be registered from one.
    assert not [u for u in seen if "/careers" in u]
    assert result.status in ("none", "board")


def test_discovery_constants_are_consistent():
    assert set(company_discovery.STATUSES) >= {"pending", "board", "careers_page", "none", "error"}
    assert "workable_index" in company_discovery.SOURCES
    assert json.dumps(list(company_discovery.SOURCES))
