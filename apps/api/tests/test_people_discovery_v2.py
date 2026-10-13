"""People discovery v2: pure parsing / inference helpers (no network, no DB)."""

from __future__ import annotations

import pytest

from app.discovery.people import emails
from app.discovery.people.classify import clean_name, department, seniority
from app.discovery.people.fetch import Fetcher
from app.discovery.people.sources.search import parse_result
from app.discovery.people.sources.site import github_org, parse_people, published_emails, team_links


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Jane Doe", "Jane Doe"),
        ("  Rahul  Sharma ", "Rahul Sharma"),
        ("Our Team", None),
        ("Meet the Leadership", None),
        ("Senior Engineer", None),
        ("Acme Technologies Pvt Ltd", None),
        ("jane doe", None),
        ("Jane", None),
        ("José Álvarez", "José Álvarez"),
        ("ACCU Bristol", None),
        ("JJUC Meetup Tokyo DevOps", None),
        ("OM SHEGOKAR", "Om Shegokar"),
    ],
)
def test_clean_name(raw, expected):
    assert clean_name(raw) == expected


def test_seniority_and_department():
    assert seniority("Co-founder & CEO") == "c_level"
    assert seniority("VP Engineering") == "vp"
    assert seniority("Head of Talent") == "director"
    assert seniority("Engineering Manager") == "manager"
    assert seniority("Senior Software Engineer") == "senior"
    assert seniority("Software Engineer") == "individual"
    assert department("Senior Technical Recruiter") == "recruiting"
    assert department("Head of Talent Acquisition") == "recruiting"
    assert department("Staff Backend Engineer") == "engineering"
    assert department("Data Scientist") == "data"
    assert department(None) is None


def test_render_and_infer_pattern():
    assert emails.render("first.last", "Jane Q. Doe", "acme.com") == "jane.doe@acme.com"
    assert emails.render("flast", "José Álvarez", "acme.com") == "jalvarez@acme.com"
    assert emails.render("first.last", "Cher", "acme.com") is None
    pattern = emails.infer_pattern(
        [("Jane Doe", "jane.doe@acme.com"), ("Raj Iyer", "raj.iyer@acme.com"), ("X Y", "x@other.com")], "acme.com"
    )
    assert pattern == ("first.last", 2, 70)
    # One address that fits several patterns equally is not enough to infer anything.
    assert emails.infer_pattern([("Jo Do", "jd@acme.com")], "acme.com") is None
    assert emails.infer_pattern([], "acme.com") is None


def test_inferred_confidence_is_capped_and_penalised_without_mx():
    assert emails.inferred_confidence(85, True) == 70
    assert emails.inferred_confidence(60, None) == 30
    assert emails.inferred_confidence(60, False) == 12


def test_hunter_pattern_mapping():
    assert emails.from_hunter("{first}.{last}") == "first.last"
    assert emails.from_hunter("{f}{last}") == "flast"
    assert emails.from_hunter("weird") is None


TEAM_HTML = """
<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Acme",
 "employee":[{"@type":"Person","name":"Jane Doe","jobTitle":"Head of Talent",
   "email":"mailto:jane.doe@acme.com","sameAs":["https://www.linkedin.com/in/janedoe/"]},
  {"@type":"Person","name":"Our Team"}]}
</script></head><body>
<h2>Leadership</h2>
<div class="card"><h3>Raj Iyer</h3><p>Co-founder &amp; CTO</p>
  <a href="https://twitter.com/rajiyer">tw</a><a href="https://github.com/rajiyer">gh</a>
  <a href="mailto:raj@acme.com">mail</a></div>
<div class="card"><h3>Priya Nair</h3><p>Loves hiking</p></div>
<a href="mailto:careers@acme.com">Careers</a> <a href="mailto:someone@gmail.com">x</a>
<a href="https://github.com/acme-labs">GitHub</a>
<a href="/about/team">Team</a><a href="/blog?page=2">Blog</a><a href="https://other.com/team">x</a>
</body></html>
"""


def test_parse_people_reads_jsonld_and_cards():
    people, evidence = parse_people(TEAM_HTML, "https://acme.com/about", "acme.com")
    by_name = {p.name: p for p in people}
    assert set(by_name) == {"Jane Doe", "Raj Iyer"}  # no title near Priya → skipped
    jane = by_name["Jane Doe"]
    assert jane.title == "Head of Talent" and jane.email == "jane.doe@acme.com"
    assert jane.email_status == "published" and jane.linkedin
    raj = by_name["Raj Iyer"]
    assert raj.title == "Co-founder & CTO"
    assert raj.github_login == "rajiyer" and raj.twitter == "https://twitter.com/rajiyer"
    assert raj.email == "raj@acme.com"
    assert ("Jane Doe", "jane.doe@acme.com") in evidence


def test_site_helpers():
    assert github_org(TEAM_HTML) in {"rajiyer", "acme-labs"}
    assert team_links(TEAM_HTML, "https://acme.com/") == ["https://acme.com/about/team"]
    found = published_emails(TEAM_HTML, "acme.com")
    assert "careers@acme.com" in found and "someone@gmail.com" not in found


@pytest.mark.parametrize(
    "title,url,snippet,name,role",
    [
        ("Jane Doe - Senior Recruiter - Acme | LinkedIn", "https://in.linkedin.com/in/jane-doe-123", "", "Jane Doe", "Senior Recruiter"),
        ("Raj Iyer – Acme | LinkedIn", "https://www.linkedin.com/in/rajiyer", "Engineering Manager at Acme", "Raj Iyer", None),
        ("Priya Nair - Talent Acquisition at Acme | LinkedIn", "https://linkedin.com/in/pnair", "", "Priya Nair", "Talent Acquisition"),
    ],
)
def test_parse_search_result(title, url, snippet, name, role):
    cand = parse_result(title, url, snippet, "Acme")
    assert cand is not None and cand.name == name and cand.title == role
    assert cand.linkedin and cand.linkedin.startswith("https://www.linkedin.com/in/")


def test_parse_search_result_rejects_non_profiles_and_other_companies():
    assert parse_result("Acme | LinkedIn", "https://www.linkedin.com/company/acme", "", "Acme") is None
    assert parse_result("Jane Doe - Recruiter - Globex | LinkedIn", "https://linkedin.com/in/jd", "", "Acme") is None


def test_fetcher_budget_stops_requests():
    with Fetcher(user_agent="test", budget=0) as f:
        assert f.page("https://example.com/") is None
        assert f.api("GET", "https://api.github.com/orgs/x") is None
        assert f.exhausted


def test_merge_never_writes_verified():
    from app.discovery.people.merge import add_contact

    with pytest.raises(ValueError):
        add_contact(None, "p", "email", "a@b.com", "a@b.com", source="x", url=None,  # type: ignore[arg-type]
                    verification="verified", confidence=1, now="t")


def test_looks_like_title_rejects_markup_and_sentences():
    from app.discovery.people.classify import looks_like_title

    assert looks_like_title("Head of Talent Acquisition")
    assert not looks_like_title('<a class="event-link btn btn-arrow" hr')
    assert not looks_like_title("We are hiring engineers to build the future of payments.")
    assert not looks_like_title("DevOpsは開発(Development)担当者と運用(Operations) 担当者が連携")


def test_pacific_day_follows_google_reset():
    from datetime import datetime, timezone

    from app.discovery.people.quota import pacific_day

    # 07:30 UTC on 13 Oct = 00:30 PDT 13 Oct; 06:30 UTC is still 12 Oct in California.
    assert pacific_day(datetime(2026, 10, 13, 7, 30, tzinfo=timezone.utc)) == "2026-10-13"
    assert pacific_day(datetime(2026, 10, 13, 6, 30, tzinfo=timezone.utc)) == "2026-10-12"
    # Winter (PST, UTC-8).
    assert pacific_day(datetime(2026, 12, 1, 7, 59, tzinfo=timezone.utc)) == "2026-11-30"


def test_search_skips_cse_when_quota_denies():
    from app.discovery.people.sources import search

    class NoNetwork:
        def api(self, *a, **k):  # pragma: no cover - must not be called
            raise AssertionError("CSE called despite exhausted quota")

    provider, hits = search.discover(
        NoNetwork(), {"google_key": "k", "google_cx": "c"}, "Acme", cse_allowed=lambda: False  # type: ignore[arg-type]
    )
    assert provider is None and hits == []
    assert search.query_for("Acme").startswith("site:linkedin.com/in ")


def test_cse_quota_stops_after_first_denial():
    from app.discovery.people import quota

    calls = []

    class FakeConn:
        def execute(self, sql, params=None):
            calls.append(params)

            class R:
                def fetchone(self_inner):
                    return None  # cap reached

            return R()

    gate = quota.CseQuota(FakeConn(), cap=90)  # type: ignore[arg-type]
    assert gate() is False and gate() is False
    assert len(calls) == 1 and gate.denied
    assert quota.CseQuota(FakeConn(), cap=0)() is False  # type: ignore[arg-type]
