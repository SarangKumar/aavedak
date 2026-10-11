"""Salary / stipend the company states for a posting — never estimated or guessed.

Two sources, in order:
1. Structured pay data a provider publishes (Greenhouse `pay_input_ranges`, Lever
   `salaryRange`, Ashby compensation summary, schema.org `baseSalary` on career pages).
2. An explicit line in the posting text that labels a figure: "Stipend: ₹25,000/month",
   "CTC - 6 to 8 LPA", "Salary range: $90K – $110K". A bare number, or wording without a
   figure ("competitive", "as per industry standards"), yields nothing.

A non-INR range on an India-located job is dropped unless it is labelled for India: boards
often publish ranges for another country (e.g. a UK or US band), which would mislead here.
All functions are pure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

MAX_SALARY_TEXT = 80

_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}


@dataclass(frozen=True)
class SalaryInfo:
    """Display text plus what is needed to judge whether it applies to the job's location."""

    text: str
    currency: str | None = None  # ISO code when known
    label: str | None = None  # provider label, e.g. "India Annual Pay Range"


def _interval(raw: Any) -> str | None:
    text = str(raw or "").lower()
    if "hour" in text:
        return "hour"
    if "month" in text:
        return "month"
    if "year" in text or "annual" in text or "annum" in text:
        return "year"
    return None


def format_amount(value: float, currency: str | None) -> str:
    code = (currency or "").upper()
    symbol = _SYMBOLS.get(code, f"{code} " if code else "")

    def trim(n: float) -> str:
        return f"{n:.1f}".rstrip("0").rstrip(".")

    if code == "INR":
        if value >= 1e7:
            return f"₹{trim(value / 1e7)} Cr"
        if value >= 1e5:
            return f"₹{trim(value / 1e5)} L"
        return f"₹{value:,.0f}"
    if value >= 1e6:
        return f"{symbol}{trim(value / 1e6)}M"
    if value >= 1e4:
        return f"{symbol}{trim(value / 1e3)}K"
    return f"{symbol}{value:,.0f}"


def format_range(
    low: float | None, high: float | None, currency: str | None, interval: Any = None
) -> str | None:
    """"$221K – $332K / year", "₹6 L – ₹8 L / year", "₹25,000 / month"; None without a figure."""
    values = [v for v in (low, high) if isinstance(v, (int, float)) and v > 0]
    if not values:
        return None
    lo, hi = min(values), max(values)
    text = format_amount(lo, currency)
    if hi != lo:
        text += f" – {format_amount(hi, currency)}"
    unit = _interval(interval)
    return f"{text} / {unit}" if unit else text


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


# --- provider payloads -----------------------------------------------------------------


def from_greenhouse(pay_ranges: Any) -> SalaryInfo | None:
    """`pay_input_ranges`: [{min_cents, max_cents, currency_type, title}]. With several
    (one per country), prefer an INR or India-labelled range, else the first."""
    ranges = [r for r in pay_ranges if isinstance(r, dict)] if isinstance(pay_ranges, list) else []

    def india(r: dict[str, Any]) -> bool:
        return str(r.get("currency_type") or "").upper() == "INR" or "india" in str(r.get("title") or "").lower()

    for r in sorted(ranges, key=lambda r: not india(r)):
        low, high = _number(r.get("min_cents")), _number(r.get("max_cents"))
        currency = str(r.get("currency_type") or "").upper() or None
        text = format_range(
            low / 100 if low else None, high / 100 if high else None, currency, r.get("title")
        )
        if text:
            return SalaryInfo(text, currency, str(r.get("title") or "") or None)
    return None


def from_lever(salary_range: Any, salary_description: Any = None) -> SalaryInfo | None:
    """`salaryRange`: {currency, interval, min, max}; `salaryDescription` is free text."""
    if isinstance(salary_range, dict):
        currency = str(salary_range.get("currency") or "").upper() or None
        text = format_range(
            _number(salary_range.get("min")),
            _number(salary_range.get("max")),
            currency,
            salary_range.get("interval"),
        )
        if text:
            return SalaryInfo(text, currency)
    return from_text(str(salary_description or ""), require_label=False)


def from_ashby(compensation: Any) -> SalaryInfo | None:
    """Ashby (`includeCompensation=true`) already gives a display summary, e.g. "$221K – $332K"."""
    if not isinstance(compensation, dict):
        return None
    for key in ("scrapeableCompensationSalarySummary", "compensationTierSummary"):
        summary = str(compensation.get(key) or "").strip()
        if summary and re.search(r"\d", summary):
            # Drop extras like "• Offers Equity" — keep the pay figure.
            summary = summary.split("•")[0].strip()
            return SalaryInfo(summary[:MAX_SALARY_TEXT], _currency_in(summary))
    return None


def from_jsonld(base_salary: Any) -> SalaryInfo | None:
    """schema.org `baseSalary` (MonetaryAmount) on a career page."""
    if not isinstance(base_salary, dict):
        return None
    currency = str(base_salary.get("currency") or "").upper() or None
    value = base_salary.get("value")
    if isinstance(value, dict):
        low = _number(value.get("minValue")) or _number(value.get("value"))
        high = _number(value.get("maxValue")) or low
        unit = value.get("unitText")
    else:
        low = high = _number(value)
        unit = None
    text = format_range(low, high, currency, unit)
    return SalaryInfo(text, currency) if text else None


# --- posting text -----------------------------------------------------------------------

_LABEL = r"(?P<label>stipend|salary(?:\s+range)?|ctc|compensation(?:\s+range)?|pay\s+range|base\s+pay|package)"
_CURRENCY = r"(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)"
_AMOUNT = r"\d[\d,]*(?:\.\d+)?\s*(?:k|l|lakhs?|lacs?|lpa|cr|crores?|m)?"
_UNIT = r"(?:lpa|per\s+annum|p\.?\s?a\.?|per\s+(?:month|year|hour)|/\s*(?:month|year|hour|mo|yr|hr)|a\s+(?:month|year)|monthly|annually)"
_VALUE = (
    rf"(?P<value>(?:{_CURRENCY}\s*)?{_AMOUNT}"
    rf"(?:\s*(?:-|–|—|to)\s*(?:{_CURRENCY}\s*)?{_AMOUNT})?"
    rf"(?:\s*{_UNIT})?)"
)
_TEXT_RE = re.compile(
    rf"\b{_LABEL}\b(?:\s*\([^)]{{0,20}}\))?(?:\s*(?:offered|of|is|will\s+be|:|-|–)){{0,3}}\s*{_VALUE}",
    re.I,
)
# An unlabelled figure only counts when it carries a currency or a pay unit (used for a
# provider's own salary text field, which is already about pay).
_BARE_RE = re.compile(_VALUE, re.I)


def _currency_in(text: str) -> str | None:
    lower = text.lower()
    if "₹" in text or re.search(r"\b(?:inr|rs\.?|lpa|lakhs?|lacs?|crores?)\b", lower):
        return "INR"
    if "$" in text or "usd" in lower:
        return "USD"
    if "€" in text or "eur" in lower:
        return "EUR"
    if "£" in text or "gbp" in lower:
        return "GBP"
    return None


def _has_money_signal(value: str) -> bool:
    return bool(re.search(_CURRENCY, value, re.I) or re.search(_UNIT, value, re.I)) or bool(
        re.search(r"\d\s*(?:k|l|lakhs?|lacs?|cr|crores?)\b", value, re.I)
    )


def from_text(text: str, *, require_label: bool = True) -> SalaryInfo | None:
    """First explicitly stated pay figure in posting text, or None."""
    if not text:
        return None
    pattern = _TEXT_RE if require_label else _BARE_RE
    for match in pattern.finditer(text):
        # Trim spacing and trailing punctuation from the sentence ("… 10-12 LPA.").
        value = re.sub(r"\s+", " ", match.group("value")).strip(" -–—.,;")
        if not re.search(r"\d", value) or not _has_money_signal(value):
            continue
        label = (match.groupdict().get("label") or "").lower()
        display = f"Stipend {value}" if label == "stipend" else value
        return SalaryInfo(display[:MAX_SALARY_TEXT], _currency_in(value))
    return None


def applies_to_location(info: SalaryInfo, *, india_located: bool) -> bool:
    """A foreign-currency range on an India-located job is most likely another country's
    band (unless labelled for India), so it is not shown."""
    if not india_located or info.currency in (None, "INR"):
        return True
    return "india" in (info.label or "").lower()
