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
