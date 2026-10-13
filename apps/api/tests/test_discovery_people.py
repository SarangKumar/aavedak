"""People import parsing + schema mirror consistency."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.discovery.people.normalize import (
    job_relevance,
    normalize_email,
    normalize_linkedin,
    parse_people_csv,
    person_dedupe_key,
)
from app.discovery.schema import SHARED_STATEMENTS

APP_DB_TS = Path(__file__).resolve().parents[2] / "web" / "lib" / "app-db.ts"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("https://in.linkedin.com/in/Jane-Doe/?utm=1", "linkedin.com/in/jane-doe"),
        ("linkedin.com/in/jdoe", "linkedin.com/in/jdoe"),
        ("https://www.linkedin.com/company/acme", None),
        ("https://example.com/in/jdoe", None),
        (None, None),
    ],
)
def test_normalize_linkedin(raw, expected):
    assert normalize_linkedin(raw) == expected


def test_normalize_email():
    assert normalize_email("  Jane@Acme.COM ") == "jane@acme.com"
    assert normalize_email("not-an-email") is None


def test_dedupe_key_is_case_and_space_insensitive():
    assert person_dedupe_key("Jane  Doe", "Acme Inc") == person_dedupe_key("jane doe", " acme inc ")


def test_parse_people_csv():
    csv_text = (
        "Full Name,Company,Designation,Email,LinkedIn,Phone,Source\n"
        "Jane Doe,Acme,Talent Partner,jane@acme.com,linkedin.com/in/jane,+91 99999,https://acme.com/team\n"
        ",Acme,Engineer,,,,\n"
        "\n"
        "Raj K,Acme,SDE II,,,,\n"
    )
    parsed = parse_people_csv(csv_text)
    assert parsed.header_error is None
    assert [r.name for r in parsed.rows] == ["Jane Doe", "Raj K"]
    assert parsed.rows[0].role_title == "Talent Partner" and parsed.rows[0].source_url == "https://acme.com/team"
    assert len(parsed.invalid) == 1
    assert parsed.phones_ignored == 1  # phones are never imported


def test_parse_people_csv_requires_name_column():
    assert parse_people_csv("email\nx@y.com").header_error


def test_job_relevance_orders_roles():
    recruiter, _ = job_relevance("Senior Technical Recruiter", "Backend Engineer")
    lead, _ = job_relevance("Engineering Manager", "Backend Engineer")
    similar, _ = job_relevance("Backend Engineer II", "Backend Engineer")
    other, _ = job_relevance("Finance Analyst", "Backend Engineer")
    assert recruiter > lead > similar > other


def test_shared_schema_is_mirrored_in_web_app_db():
    """Every web-owned column/table the pipeline relies on must also be declared in
    apps/web/lib/app-db.ts (the web app owns those tables)."""
    web = APP_DB_TS.read_text(encoding="utf-8")
    for stmt in SHARED_STATEMENTS:
        name = re.search(r"(?:COLUMN IF NOT EXISTS|TABLE IF NOT EXISTS|INDEX IF NOT EXISTS)\s+(\w+)", stmt)
        assert name, stmt
        assert name.group(1) in web, f"{name.group(1)} missing from app-db.ts"


# --- People discovery: company site --------------------------------------------------

from app.discovery.people.discover import (  # noqa: E402
    company_site_hint,
    follow_link,
    registrable_domain,
    site_inbox,
)


def test_registrable_domain():
    assert registrable_domain("careers.withwaymo.com") == "withwaymo.com"
    assert registrable_domain("www.zeta.co.in") == "zeta.co.in"
    assert registrable_domain("meesho.io") == "meesho.io"


def test_company_site_hint_prefers_where_postings_live():
    urls = ["https://careers.acme.com/jobs/1", "https://careers.acme.com/jobs/2"]
    assert company_site_hint(board_html=None, job_urls=urls, descriptions=[]) == (
        "https://careers.acme.com/"
    )


def test_company_site_hint_from_board_skips_platforms_and_trackers():
    board = (
        '<a href="https://www.greenhouse.com/privacy">Privacy</a>'
        '<a href="https://www.linkedin.com/company/acme">in</a>'
        '<a href="https://acme.com">Acme</a><a href="https://acme.com/about">About</a>'
    )
    urls = ["https://job-boards.greenhouse.io/acme/jobs/1"]
    assert company_site_hint(board_html=board, job_urls=urls, descriptions=[]) == (
        "https://acme.com/"
    )


def test_company_site_hint_ignores_meta_urls_on_board():
    board = '<meta property="og:type" content="https://ogp.me/ns#">'
    assert company_site_hint(board_html=board, job_urls=[], descriptions=[]) is None


def test_company_site_hint_is_none_without_evidence():
    assert company_site_hint(board_html="<p>No links</p>", job_urls=[], descriptions=[]) is None


def test_follow_link_prefers_careers_then_contact_on_same_site():
    html = (
        '<a href="/contact">Contact us</a>'
        '<a href="https://other.com/careers">Partner careers</a>'
        '<a href="/company/join-us">Join us</a>'
    )
    assert follow_link(html, "https://acme.com/") == "https://acme.com/company/join-us"
    assert follow_link('<a href="/contact">Contact</a>', "https://acme.com/") == (
        "https://acme.com/contact"
    )
    assert follow_link('<a href="https://other.com/jobs">x</a>', "https://acme.com/") is None


def test_site_inbox_reads_mailto_and_requires_company_domain():
    html = '<p>Write to us</p><a href="mailto:careers@acme.com?subject=CV">Email</a>'
    assert site_inbox(html, "https://www.acme.com/careers") == "careers@acme.com"
    # A personal address is never captured, nor an inbox on someone else's domain.
    assert site_inbox("<p>priya@acme.com</p>", "https://acme.com/") is None
    assert site_inbox("<p>jobs@recruitco.com</p>", "https://acme.com/") is None


def test_person_location_parts_and_snippet_location():
    from app.discovery.people.merge import location_parts
    from app.discovery.people.sources.search import snippet_location

    assert location_parts("Bangalore") == ("Bengaluru, India", "IN")
    assert location_parts("Berlin, Germany") == ("Berlin, Germany", "DE")
    assert location_parts("Germany") == (None, "DE")
    assert location_parts("Remote") == (None, None)
    assert location_parts(None) == (None, None)
    assert snippet_location("Bengaluru, Karnataka, India · 500+ connections on LinkedIn") is not None
    assert snippet_location("Location: Pune · Experience: Example Inc") == "Pune"
    assert snippet_location("Experienced engineer who loves building things") is None
