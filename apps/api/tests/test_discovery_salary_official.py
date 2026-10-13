"""Salary / stipend extraction and official careers page tracking (pure parts)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from app.discovery.jobs import registry, salary
from app.discovery.jobs.models import RawPosting, SourceTarget
from app.discovery.jobs.normalize import normalize_postings
from app.discovery.jobs.providers import ashby, greenhouse, jsonld, lever
from app.discovery.jobs.scan import official_target
from app.discovery.timeutil import iso_minus, now_iso

TARGET = SourceTarget(id="s1", company_name="Acme", provider="greenhouse", token="acme", careers_url="")


# --- formatting --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("low", "high", "currency", "interval", "expected"),
    [
        (221_000, 332_000, "USD", "Annual Salary", "$221K – $332K / year"),
        (600_000, 800_000, "INR", "per-year-salary", "₹6 L – ₹8 L / year"),
        (25_000, 25_000, "INR", "per-month-salary", "₹25,000 / month"),
        (12_000_000, None, "INR", None, "₹1.2 Cr"),
        (46_000, 54_000, "GBP", "United Kingdom Annual Pay Range", "£46K – £54K / year"),
        (None, None, "USD", None, None),
        (0, 0, "USD", None, None),
    ],
)
def test_format_range(low, high, currency, interval, expected):
    assert salary.format_range(low, high, currency, interval) == expected


# --- providers ---------------------------------------------------------------------------


def test_greenhouse_prefers_india_range_and_reads_cents():
    ranges = [
        {"min_cents": 4600000, "max_cents": 5400000, "currency_type": "GBP", "title": "UK Annual Pay Range"},
        {"min_cents": 120000000, "max_cents": 160000000, "currency_type": "INR", "title": "India Annual"},
    ]
    info = salary.from_greenhouse(ranges)
    assert info == salary.SalaryInfo("₹12 L – ₹16 L / year", "INR", "India Annual")
    assert salary.from_greenhouse([]) is None
    assert salary.from_greenhouse(None) is None


def test_greenhouse_parse_reads_pay_and_detects_company_site():
    payload = {
        "jobs": [
            {
                "id": i,
                "title": "Software Engineer",
                "absolute_url": f"https://careers.acme.com/positions/{i}?gh_jid={i}",
                "location": {"name": "Remote"},
                "pay_input_ranges": [
                    {"min_cents": 9000000, "max_cents": 11000000, "currency_type": "USD", "title": "Annual"}
                ],
            }
            for i in range(5)
        ]
    }
    postings = greenhouse.parse(payload, TARGET)
    assert postings[0].salary and postings[0].salary.text == "$90K – $110K / year"
    assert greenhouse.official_url_hint(postings) == "https://careers.acme.com/"


def test_greenhouse_hint_needs_a_clear_majority_off_greenhouse():
    def posting(url: str) -> RawPosting:
        return RawPosting(external_id=url, title="t", company_name="Acme", url=url)

    on_board = [posting(f"https://job-boards.greenhouse.io/acme/jobs/{i}") for i in range(5)]
    assert greenhouse.official_url_hint(on_board) is None
    mixed = on_board[:3] + [posting("https://acme.com/jobs/1"), posting("https://acme.com/jobs/2")]
    assert greenhouse.official_url_hint(mixed) is None
    assert greenhouse.official_url_hint([]) is None


def test_lever_salary_range_and_description():
    assert salary.from_lever(
        {"currency": "INR", "interval": "per-year-salary", "min": 500000, "max": 700000}
    ) == salary.SalaryInfo("₹5 L – ₹7 L / year", "INR")
    assert salary.from_lever(None, "Stipend of INR 30,000 per month").text == "INR 30,000 per month"
    assert salary.from_lever(None, "Great benefits") is None
    payload = [
        {
            "id": "x1",
            "text": "Backend Engineer",
            "hostedUrl": "https://jobs.lever.co/acme/x1",
            "categories": {"location": "Bengaluru"},
            "salaryRange": {"currency": "INR", "interval": "per-month-salary", "min": 40000, "max": 40000},
        }
    ]
    assert lever.parse(payload, TARGET)[0].salary.text == "₹40,000 / month"


def test_ashby_compensation_summary():
    comp = {"compensationTierSummary": "$221K – $332K • Offers Equity • Offers Bonus"}
    assert salary.from_ashby(comp) == salary.SalaryInfo("$221K – $332K", "USD")
    assert salary.from_ashby({"compensationTierSummary": "Offers Equity"}) is None
    payload = {
        "jobs": [
            {
                "id": "a1",
                "title": "SDE",
                "jobUrl": "https://jobs.ashbyhq.com/acme/a1",
                "location": "Bengaluru",
                "compensation": {"scrapeableCompensationSalarySummary": "₹18L - ₹24L"},
            }
        ]
    }
    assert ashby.parse(payload, TARGET)[0].salary == salary.SalaryInfo("₹18L - ₹24L", "INR")


def test_jsonld_base_salary():
    html = """<script type="application/ld+json">{"@type": "JobPosting", "title": "Data Analyst",
      "url": "/jobs/9", "jobLocation": {"address": {"addressLocality": "Pune", "addressCountry": "IN"}},
      "baseSalary": {"@type": "MonetaryAmount", "currency": "INR",
        "value": {"@type": "QuantitativeValue", "minValue": 400000, "maxValue": 600000, "unitText": "YEAR"}}}
    </script>"""
    posting = jsonld.parse_html(html, TARGET, "https://acme.com/careers")[0]
    assert posting.salary == salary.SalaryInfo("₹4 L – ₹6 L / year", "INR")
    assert salary.from_jsonld({"currency": "USD", "value": 50000}).text == "$50K"
    assert salary.from_jsonld("n/a") is None


# --- posting text ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Stipend: ₹25,000/month for 6 months", "Stipend ₹25,000/month"),
        ("CTC - 6 to 8 LPA, plus benefits", "6 to 8 LPA"),
        ("Salary range: $90K – $110K per year", "$90K – $110K per year"),
        ("Compensation (INR): 12,00,000 per annum", "12,00,000 per annum"),
        ("The stipend offered is Rs. 15000 per month.", "Stipend Rs. 15000 per month"),
        ("Package: 4.5 LPA", "4.5 LPA"),
    ],
)
def test_text_salary_found(text, expected):
    info = salary.from_text(text)
    assert info is not None and info.text == expected


@pytest.mark.parametrize(
    "text",
    [
        "Competitive salary and great benefits.",
        "Salary as per industry standards.",
        "We raised $50M in Series B and have 200 employees.",
        "2+ years of experience; CTC is negotiable.",
        "Compensation: 3 rounds of interviews",
        "",
    ],
)
def test_text_salary_never_guessed(text):
    assert salary.from_text(text) is None


def test_foreign_band_on_india_job_is_dropped():
    usd = salary.SalaryInfo("$221K – $332K / year", "USD", "US Annual")
    assert not salary.applies_to_location(usd, india_located=True)
    assert salary.applies_to_location(usd, india_located=False)  # e.g. remote, open to India
    labelled = salary.SalaryInfo("$40K – $50K / year", "USD", "India Annual Range (USD)")
    assert salary.applies_to_location(labelled, india_located=True)
    inr = salary.SalaryInfo("₹6 L / year", "INR")
    assert salary.applies_to_location(inr, india_located=True)


def _raw(**overrides) -> RawPosting:
    fields = dict(
        external_id="acme:1",
        title="Software Engineer",
        company_name="Acme",
        url="https://acme.com/jobs/1",
        locations=["Bengaluru, India"],
        description="Build services in Python. 0-2 years of experience.",
    )
    fields.update(overrides)
    return RawPosting(**fields)


def _normalize(postings):
    return normalize_postings(postings, max_min_years=10, include_internships=False)


def test_normalize_uses_structured_then_text_and_respects_location():
    structured = _raw(salary=salary.SalaryInfo("₹6 L – ₹8 L / year", "INR"))
    assert _normalize([structured]).jobs[0].salary == "₹6 L – ₹8 L / year"

    # A US band on a Bengaluru job is not shown; the posting text's own figure is used.
    us_band = _raw(
        salary=salary.SalaryInfo("$221K – $332K / year", "USD", "US"),
        description="Build services in Python. 0-2 years of experience. CTC: 10-12 LPA.",
    )
    assert _normalize([us_band]).jobs[0].salary == "10-12 LPA"

    assert _normalize([_raw()]).jobs[0].salary is None


def test_salary_is_part_of_the_content_hash():
    without = _normalize([_raw()]).jobs[0]
    with_pay = _normalize([_raw(salary=salary.SalaryInfo("₹6 L / year", "INR"))]).jobs[0]
    assert without.content_hash != with_pay.content_hash


# --- official careers page ---------------------------------------------------------------


def _target(**overrides) -> SourceTarget:
    fields = dict(
        id="s1",
        company_name="Acme",
        provider="greenhouse",
        token="acme",
        careers_url="https://job-boards.greenhouse.io/acme",
        official_careers_url="https://acme.com/careers",
    )
    fields.update(overrides)
    return SourceTarget(**fields)


def test_official_page_due():
    assert registry.official_page_due(_target())
    assert not registry.official_page_due(_target(official_careers_url=None))
    # A career-page source already is the official page.
    assert not registry.official_page_due(_target(provider="jsonld"))
    # Pages without job data (or blocked) are re-checked weekly, not every scan.
    assert not registry.official_page_due(_target(official_status="no_job_data", official_checked_at=now_iso()))
    assert registry.official_page_due(
        _target(official_status="blocked", official_checked_at=iso_minus(8 * 86_400))
    )
    assert registry.official_page_due(_target(official_status="ok", official_checked_at=now_iso()))


def test_official_target_is_a_career_page_source_of_the_same_company_source():
    page = official_target(_target())
    assert (page.id, page.provider, page.careers_url) == ("s1", "jsonld", "https://acme.com/careers")
    assert page.token == "official-acme"  # posting ids never collide with the board's


def test_clean_official_url():
    assert registry.clean_official_url(" https://acme.com/careers ") == "https://acme.com/careers"
    assert registry.clean_official_url("") is None
    assert registry.clean_official_url(None) is None
    with pytest.raises(ValueError):
        registry.clean_official_url("acme.com/careers")


def test_export_carries_official_careers_url():
    path = Path(__file__).resolve().parents[1] / "scripts" / "export_admin_sources.py"
    spec = importlib.util.spec_from_file_location("export_admin_sources", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    rows = [
        {
            "company_name": "Acme",
            "provider": "lever",
            "token": "acme",
            "careers_url": "https://jobs.lever.co/acme",
            "official_careers_url": "https://acme.com/careers",
        }
    ]
    _, added = module.merge_sources([], rows)
    assert added[0]["officialCareersUrl"] == "https://acme.com/careers"
