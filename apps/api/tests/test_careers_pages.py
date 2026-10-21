"""Careers-page crawler: detection and extraction (pure) and full crawls against a mocked
site (httpx.MockTransport), plus the seed registry file."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from app.discovery import schema
from app.discovery.jobs import career_pages, careers_crawl, registry
from app.discovery.jobs.careers_crawl import (
    CareerPage,
    CrawlResult,
    Embed,
    crawl,
    detect_embeds,
    extract_embedded_jobs,
    job_links,
    listing_links,
    registrable_domain,
    relative_posted,
    sitemap_job_urls,
)
from app.discovery.jobs.models import RawPosting
from app.discovery.jobs.normalize import normalize_postings
from app.discovery.jobs.providers import workday
from app.discovery.jobs.models import SourceTarget

PAGE = CareerPage(id="pg1", company_name="Acme", careers_url="https://acme.example/careers", domain="acme.example")


def jsonld_job(title: str, url: str, city: str = "Bengaluru", ident: str | None = None) -> str:
    job = {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": title,
        "url": url,
        "datePosted": "2026-10-18",
        "description": "<p>Build Python services. 0-2 years of experience.</p>",
        "hiringOrganization": {"@type": "Organization", "name": "Acme Corp Pvt Ltd"},
        "jobLocation": {"@type": "Place", "address": {"addressLocality": city, "addressCountry": "IN"}},
    }
    if ident:
        job["identifier"] = {"@type": "PropertyValue", "value": ident}
    return f'<script type="application/ld+json">{json.dumps(job)}</script>'


def site(routes: dict[str, tuple[int, str, str]]):
    """MockTransport serving `routes` {url: (status, content_type, body)}; 404 otherwise."""
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        seen.append(url)
        for key in (url, url.split("?")[0]):
            if key in routes:
                status, ctype, body = routes[key]
                return httpx.Response(status, headers={"content-type": ctype}, text=body)
        return httpx.Response(404, text="not found")

    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True), seen


def run(routes, page: CareerPage = PAGE):
    client, seen = site(routes)
    with client:
        return crawl(client, page, host_delay=0), seen


HTML = "text/html; charset=utf-8"


# --- pure helpers -------------------------------------------------------------------------


def test_registrable_domain():
    assert registrable_domain("https://careers.google.com/jobs") == "google.com"
    assert registrable_domain("https://www.tcs.com/careers") == "tcs.com"
    assert registrable_domain("jobs.example.co.in") == "example.co.in"
    assert registrable_domain("https://www.godigit.com/careers") == "godigit.com"


@pytest.mark.parametrize(
    "html, expected",
    [
        ('<script src="https://boards.greenhouse.io/embed/job_board/js?for=acmeinc"></script>', Embed("greenhouse", "acmeinc")),
        ('<iframe src="https://job-boards.greenhouse.io/embed/job_board?for=AcmeInc&amp;b=x">', Embed("greenhouse", "acmeinc")),
        ('<a href="https://job-boards.greenhouse.io/acme/jobs/123">', Embed("greenhouse", "acme")),
        ("Grnhse.Settings.boardToken = 'acme';", Embed("greenhouse", "acme")),
        ('<a href="https://jobs.lever.co/acme-labs">Jobs</a>', Embed("lever", "acme-labs")),
        ('fetch("https://api.lever.co/v0/postings/acme?mode=json")', Embed("lever", "acme")),
        ('<script src="https://jobs.ashbyhq.com/acme/embed?version=2"></script>', Embed("ashby", "acme")),
        ('<a href="https://careers.smartrecruiters.com/AcmeGroup">', Embed("smartrecruiters", "AcmeGroup")),
        ('<a href="https://apply.workable.com/acme-ai/">', Embed("workable", "acme-ai")),
        ('<a href="https://acme.wd5.myworkdayjobs.com/en-US/External_Careers">', Embed("workday", "acme.wd5/External_Careers")),
    ],
)
def test_detect_embeds(html, expected):
    assert detect_embeds(html)[0] == expected


def test_detect_embeds_ignores_platform_paths_and_uses_page_url():
    assert detect_embeds('<script src="https://boards.greenhouse.io/embed/job_board/js"></script>') == []
    assert detect_embeds('<link href="https://jobs.lever.co/static/app.css">') == []
    assert detect_embeds("", "https://jobs.lever.co/acme") == [Embed("lever", "acme")]
    # Most-referenced board first.
    html = 'jobs.lever.co/other ' + 'jobs.lever.co/acme ' * 3
    assert detect_embeds(html)[0] == Embed("lever", "acme")


def test_embedded_json_reads_job_lists_not_navigation():
    data = {
        "props": {
            "nav": [{"name": "About", "url": "/about"}, {"name": "Blog", "url": "/blog"}],
            "posts": [{"title": "Our culture", "url": "/blog/culture", "id": 4}],
            "jobs": [
                {"jobTitle": "Software Engineer", "location": {"city": "Pune", "country": "India"}, "jobId": "J-1", "applyUrl": "/jobs/J-1"},
                {"jobTitle": "Data Analyst", "city": "Remote", "jobId": "J-2", "applyUrl": "https://acme.example/jobs/J-2"},
            ],
        }
    }
    html = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script>'
    postings = extract_embedded_jobs(html, PAGE, "https://acme.example/careers")
    assert [p.title for p in postings] == ["Software Engineer", "Data Analyst"]
    assert postings[0].url == "https://acme.example/jobs/J-1"
    assert postings[0].locations == ["Pune, India"]
    assert postings[0].external_id == "pg1:J-1"


def test_embedded_json_from_script_assignment():
    ddo = {"eagerLoadRefineSearch": {"data": {"jobs": [{"title": "QA Engineer", "location": "Chennai, India", "jobSeqNo": "QA1"}]}}}
    html = f"<script>var x = 1; phApp.ddo = {json.dumps(ddo)}; phApp.other = 2;</script>"
    postings = extract_embedded_jobs(html, PAGE, PAGE.careers_url)
    assert len(postings) == 1 and postings[0].title == "QA Engineer" and postings[0].url is None


def test_job_and_listing_links():
    html = """
      <a href="/careers/life-at-acme">Life</a>
      <a href="/careers/software-engineer-backend-12345">SE</a>
      <a href="https://acme.example/jobs/data-engineer-ii-bengaluru">DE</a>
      <a href="https://other.example/jobs/12345">elsewhere</a>
      <a href="/careers/search"><span>View all open roles</span></a>
    """
    links = job_links(html, PAGE.careers_url, PAGE.domain)
    assert links == [
        "https://acme.example/careers/software-engineer-backend-12345",
        "https://acme.example/jobs/data-engineer-ii-bengaluru",
    ]
    assert listing_links(html, PAGE.careers_url) == ["https://acme.example/careers/search"]


def test_sitemap_job_urls_newest_first_and_same_site():
    xml = """<urlset>
      <url><loc>https://acme.example/jobs/old-role-1001</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>https://acme.example/jobs/new-role-2002</loc><lastmod>2026-10-01</lastmod></url>
      <url><loc>https://acme.example/about</loc></url>
      <url><loc>https://evil.example/jobs/x-3003</loc></url>
    </urlset>"""
    assert sitemap_job_urls(xml, "acme.example") == [
        "https://acme.example/jobs/new-role-2002",
        "https://acme.example/jobs/old-role-1001",
    ]


def test_relative_posted():
    assert relative_posted("Posted Today")[:10] == careers_crawl.to_iso(careers_crawl.utcnow())[:10]
    assert relative_posted("Posted 30+ Days Ago") < relative_posted("Posted 3 Days Ago")
    assert relative_posted("Posted sometime") is None


def test_workday_parse_list():
    target = SourceTarget(id="x", company_name="Acme", provider="workday", token="acme.wd5/External", careers_url="")
    payload = {
        "total": 2,
        "jobPostings": [
            {"title": "Software Engineer", "externalPath": "/job/Pune/Software-Engineer_R1", "locationsText": "Pune, India", "postedOn": "Posted Yesterday"},
            {"title": "Data Engineer", "externalPath": "/job/Multi/Data-Engineer_R2", "locationsText": "3 Locations", "postedOn": "Posted 5 Days Ago"},
        ],
    }
    postings = workday.parse_list(payload, target)
    assert postings[0].url == "https://acme.wd5.myworkdayjobs.com/External/job/Pune/Software-Engineer_R1"
    assert postings[0].locations == ["Pune, India"]
    assert postings[1].locations == []  # a count, not a place
    with pytest.raises(Exception):
        workday.split_token("not-a-token")


# --- full crawls ----------------------------------------------------------------------------

ROBOTS_OK = (200, "text/plain", "User-agent: *\nAllow: /\nSitemap: https://acme.example/sitemap.xml\n")


def test_crawl_page_jsonld():
    body = "<html>" + jsonld_job("Software Engineer", "/careers/se-1", ident="SE1") + "</html>"
    result, _ = run({"https://acme.example/robots.txt": ROBOTS_OK, "https://acme.example/careers": (200, HTML, body)})
    assert result.status == "ok" and result.strategy == "jsonld"
    posting = result.postings[0]
    assert posting.external_id == "pg1:jsonld:SE1"
    assert posting.company_name == "Acme"  # the registry name, not the legal entity
    assert posting.url == "https://acme.example/careers/se-1"
    assert result.complete is False  # a page read never closes jobs


def test_crawl_greenhouse_embed_links_back_to_company_page():
    page = '<div id="grnhse_app"></div><script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>'
    board = {"jobs": [{"id": 77, "title": "Backend Engineer", "absolute_url": "https://job-boards.greenhouse.io/acme/jobs/77",
                       "location": {"name": "Bengaluru, India"}, "content": "Python", "first_published": "2026-10-19T00:00:00Z"}]}
    result, seen = run({
        "https://acme.example/robots.txt": ROBOTS_OK,
        "https://acme.example/careers": (200, HTML, page),
        "https://boards-api.greenhouse.io/v1/boards/acme/jobs": (200, "application/json", json.dumps(board)),
    })
    assert result.strategy == "greenhouse" and result.embed == Embed("greenhouse", "acme")
    assert result.complete is True
    assert result.postings[0].url == "https://acme.example/careers?gh_jid=77"
    assert result.postings[0].external_id == "pg1:greenhouse:acme:77"


def test_crawl_follows_job_links_then_sitemap():
    landing = '<a href="/careers/platform-engineer-4242">Platform Engineer</a>'
    result, _ = run({
        "https://acme.example/robots.txt": ROBOTS_OK,
        "https://acme.example/careers": (200, HTML, landing),
        "https://acme.example/careers/platform-engineer-4242": (200, HTML, jsonld_job("Platform Engineer", "/careers/platform-engineer-4242")),
    })
    assert result.strategy == "jsonld_links" and len(result.postings) == 1

    sitemap = "<urlset><url><loc>https://acme.example/jobs/ml-engineer-5151</loc></url></urlset>"
    result, _ = run({
        "https://acme.example/robots.txt": ROBOTS_OK,
        "https://acme.example/careers": (200, HTML, "<div id=app></div>"),
        "https://acme.example/sitemap.xml": (200, "application/xml", sitemap),
        "https://acme.example/jobs/ml-engineer-5151": (200, HTML, jsonld_job("ML Engineer", "/jobs/ml-engineer-5151")),
    })
    assert result.strategy == "jsonld_sitemap" and result.postings[0].title == "ML Engineer"


def test_crawl_resolves_relative_sitemap_lines_in_robots():
    sitemap = "<urlset><url><loc>https://acme.example/jobs/sre-6161</loc></url></urlset>"
    robots = (200, "text/plain", "User-agent: *\nAllow: /\nSitemap: /jobs-sitemap.xml\nSitemap: ftp://acme.example/x\n")
    result, seen = run({
        "https://acme.example/robots.txt": robots,
        "https://acme.example/careers": (200, HTML, "<div id=app></div>"),
        "https://acme.example/jobs-sitemap.xml": (200, "application/xml", sitemap),
        "https://acme.example/jobs/sre-6161": (200, HTML, jsonld_job("SRE", "/jobs/sre-6161")),
    })
    assert result.strategy == "jsonld_sitemap" and "https://acme.example/jobs-sitemap.xml" in seen


def test_crawl_respects_robots_and_reports_blocks():
    result, seen = run({
        "https://acme.example/robots.txt": (200, "text/plain", "User-agent: AavedakJobsBot\nDisallow: /careers\n"),
        "https://acme.example/careers": (200, HTML, jsonld_job("SE", "/x")),
    })
    assert result.status == "blocked"
    assert "https://acme.example/careers" not in seen  # never fetched

    result, _ = run({"https://acme.example/robots.txt": ROBOTS_OK, "https://acme.example/careers": (403, HTML, "denied")})
    assert result.status == "blocked"

    result, _ = run({"https://acme.example/robots.txt": ROBOTS_OK, "https://acme.example/careers": (200, HTML, "<div id=root></div>")})
    assert result.status == "no_job_data" and result.postings == []


# --- dedupe ---------------------------------------------------------------------------------


def test_same_role_from_careers_page_and_board_shares_dedupe_key():
    """Store links a new posting to the canonical job with the same dedupe key, so the
    careers-page copy and the board copy of one role end up as one job."""
    common = dict(company_name="Acme", locations=["Bengaluru, India"], description="Python. 1+ years.", posted_at="2026-10-19")
    from_page = RawPosting(external_id="pg1:jsonld:SE1", title="Software Engineer", url="https://acme.example/careers/se-1", **common)
    from_board = RawPosting(external_id="acme:77", title="Software Engineer", url="https://job-boards.greenhouse.io/acme/jobs/77", **common)
    kwargs = dict(max_min_years=10, include_internships=False)
    page_job = normalize_postings([from_page], **kwargs).jobs[0]
    board_job = normalize_postings([from_board], **kwargs).jobs[0]
    assert page_job.dedupe_key == board_job.dedupe_key


def test_duplicate_postings_in_one_crawl_are_dropped():
    posting = RawPosting(external_id="pg1:jsonld:1", title="Software Engineer", company_name="Acme",
                         url="https://acme.example/j/1", locations=["Pune"], description="x")
    result = normalize_postings([posting, posting], max_min_years=10, include_internships=False)
    assert len(result.jobs) == 1 and result.skipped["duplicate_in_feed"] == 1


# --- registry -------------------------------------------------------------------------------


def test_seed_registry_file():
    rows = json.loads(career_pages.SEED_PATH.read_text(encoding="utf-8"))
    assert 500 <= len(rows) <= 650
    urls = [r["careersUrl"].lower().rstrip("/") for r in rows]
    assert len(set(urls)) == len(urls)
    assert all(u.startswith(("https://", "http://")) for u in urls)
    assert {r["countryFocus"] for r in rows} <= set(career_pages.FOCUSES)
    india = sum(r["countryFocus"] in ("india", "india_office") for r in rows)
    assert india / len(rows) > 0.6  # weighted to companies hiring in India
    assert all(r.get("verifiedAt") for r in rows)


def test_schema_and_scheduling_sql():
    ddl = "\n".join(schema.PIPELINE_STATEMENTS)
    assert "CREATE TABLE IF NOT EXISTS career_pages" in ddl
    assert "career_pages_url_uidx" in ddl
    assert "%(covered_after)s" in career_pages.BOARD_COVERED_SQL
    assert registry.scheduled_source_ids.__doc__ and "fallback" in registry.scheduled_source_ids.__doc__


def test_crawl_out_of_time_is_a_retryable_error_not_no_job_data():
    landing = "".join(f'<a href="/careers/role-{i}-9{i}0">Role {i}</a>' for i in range(8))
    routes = {"https://acme.example/robots.txt": ROBOTS_OK, "https://acme.example/careers": (200, HTML, landing)}
    client, _ = site(routes)
    with client:
        result = crawl(client, PAGE, deadline_seconds=4.5, host_delay=2.0)
    assert result.status == "error" and "time" in (result.error or "")


def test_careers_batch_is_hard_capped_by_the_tick_deadline(monkeypatch):
    import threading
    import time as _time

    from app.discovery.config import get_settings
    from app.discovery.jobs import careers_scan
    from app.discovery.runs.store import ClaimedItem

    release = threading.Event()
    recorded: list[str] = []
    page = CareerPage("p1", "Acme", "https://acme.example/careers", "acme.example")
    monkeypatch.setattr(career_pages, "load", lambda conn, ref: (page, None))
    monkeypatch.setattr(career_pages, "record", lambda conn, pid, *a, **k: recorded.append(pid))

    def stalled(client, p, *, deadline_seconds):
        release.wait(10)  # a socket that never answers
        return CrawlResult("no_job_data")

    monkeypatch.setattr(careers_scan, "crawl", stalled)
    item = ClaimedItem("i1", "r1", careers_scan.ITEM_KIND, "p1", {}, 1)
    started = _time.monotonic()
    outcomes = careers_scan.process_items(None, get_settings(), [item], deadline=started + 4.5)
    release.set()
    assert _time.monotonic() - started < 4
    assert outcomes["i1"].ok is False and outcomes["i1"].retryable is True
    assert recorded == []  # a stalled read is never recorded as a status
