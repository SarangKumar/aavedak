"""Relevance filters applied *before* anything is written: India-only, engineering roles
(any discipline), junior (stated minimum experience below the configured cap).

All functions are pure so they can be tuned and tested without a database. Postings that
fail are only counted (by reason) in the run stats.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.discovery.jobs.models import RawPosting

# --- India -------------------------------------------------------------------------

_INDIA_PLACES = (
    "india|bharat|bengaluru|bangalore|mumbai|bombay|navi mumbai|thane|pune|hyderabad|secunderabad|"
    "chennai|madras|gurugram|gurgaon|noida|greater noida|delhi|new delhi|delhi ncr|ncr|faridabad|"
    "ghaziabad|kolkata|calcutta|ahmedabad|gandhinagar|vadodara|surat|rajkot|jaipur|udaipur|kochi|"
    "cochin|thiruvananthapuram|trivandrum|kozhikode|calicut|coimbatore|madurai|tiruchirappalli|"
    "trichy|salem|hosur|mysuru|mysore|mangaluru|mangalore|hubli|belagavi|belgaum|indore|bhopal|"
    "nagpur|nashik|aurangabad|chandigarh|mohali|panchkula|ludhiana|amritsar|dehradun|lucknow|"
    "kanpur|varanasi|prayagraj|patna|ranchi|jamshedpur|bhubaneswar|cuttack|visakhapatnam|vizag|"
    "vijayawada|guntur|tirupati|warangal|goa|panaji|guwahati|raipur|jodhpur|"
    "karnataka|maharashtra|tamil nadu|telangana|andhra pradesh|kerala|gujarat|rajasthan|"
    "uttar pradesh|haryana|punjab|west bengal|odisha|madhya pradesh|bihar|jharkhand|assam|"
    "uttarakhand|chhattisgarh|himachal pradesh"
)
_INDIA_RE = re.compile(rf"\b(?:{_INDIA_PLACES})\b", re.I)
_INDIA_CODES = {"in", "ind", "india"}


def is_india(locations: list[str], country_code: str | None = None) -> bool:
    """True when a location or country code is explicitly Indian. A bare "Remote" or
    "Anywhere" is not treated as India."""
    if country_code and country_code.strip().lower() in _INDIA_CODES:
        return True
    return any(_INDIA_RE.search(loc or "") for loc in locations)


# --- Role ----------------------------------------------------------------------------

_ENGINEERING_RE = re.compile(
    r"\b(?:engineer|engineers|engineering|developer|developers|programmer|sde|swe|sdet|"
    r"devops|devsecops|sre|firmware|technologist|graduate engineer(?:ing)? trainee)\b",
    re.I,
)
# "GET" is the standard Indian abbreviation for Graduate Engineer Trainee (case-sensitive).
_GET_RE = re.compile(r"\bGET\b")
# Titles that borrow the word but are not engineering jobs.
_NON_ENGINEERING_RE = re.compile(
    r"\b(?:sales|pre-?sales|presales|solutions? engineer|solutions? consultant|account|"
    r"marketing|recruit\w*|talent|customer success|business development|"
    r"engineering manager|manager,? engineering|engineering program manager|"
    r"engineering operations|technical writer)\b",
    re.I,
)
_SENIOR_RE = re.compile(
    r"\b(?:senior|sr|snr|staff|principal|lead|leader|manager|mgr|director|head|architect|"
    r"vp|vice president|chief|cto|distinguished|fellow)\b",
    re.I,
)
# Level III+ (e.g. "Engineer III", "SDE-3", "L5", "IC4").
_HIGH_LEVEL_RE = re.compile(
    r"\b(?:engineer|developer|sde|swe|sdet|level|grade)\s*[-–]?\s*(?:iii|iv|v|vi|[3-9])\b"
    r"|\b(?:l[5-9]|e[5-9]|ic[4-9])\b",
    re.I,
)
_INTERN_RE = re.compile(r"\b(?:intern|interns|internship|apprentice|apprenticeship|co-?op)\b", re.I)

# Normalized provider seniority labels (see `normalize_seniority`). "mid_senior" is
# deliberately *not* treated as senior: some boards label every role that way, so the
# title and stated years decide instead.
_SENIOR_HINTS = {"director", "executive"}
_INTERN_HINTS = {"internship"}


def normalize_seniority(label: str | None) -> str | None:
    """Map provider labels (SmartRecruiters `mid_senior_level`, Workable "Entry level", …)
    onto: internship | entry | associate | mid_senior | director | executive."""
    if not label:
        return None
    key = re.sub(r"[^a-z]+", "_", label.lower()).strip("_")
    if "intern" in key:
        return "internship"
    if "entry" in key or "graduate" in key:
        return "entry"
    if "associate" in key:
        return "associate"
    if "mid" in key or "senior" in key:
        return "mid_senior"
    if "director" in key:
        return "director"
    if "executive" in key:
        return "executive"
    return None


def _title_words(title: str) -> str:
    """Treat `_` and `/` as separators: ATS titles like "IN_RBAI_Sr.Engineer/Asst.Manager"
    otherwise hide words from `\\b` boundaries."""
    return re.sub(r"[_/]+", " ", title)


def is_engineering_title(title: str) -> bool:
    title = _title_words(title)
    if _NON_ENGINEERING_RE.search(title):
        return False
    return bool(_ENGINEERING_RE.search(title) or _GET_RE.search(title))


def is_senior_title(title: str) -> bool:
    title = _title_words(title)
    return bool(_SENIOR_RE.search(title) or _HIGH_LEVEL_RE.search(title))


def is_internship(title: str, employment_type: str | None, seniority_hint: str | None) -> bool:
    if _INTERN_RE.search(_title_words(title)):
        return True
    if employment_type and _INTERN_RE.search(employment_type):
        return True
    return bool(seniority_hint and seniority_hint.lower() in _INTERN_HINTS)


# --- Experience ----------------------------------------------------------------------

_YEARS = r"(?:years?|yrs?)"
_RANGE_RE = re.compile(rf"(\d{{1,2}}(?:\.\d)?)\s*\+?\s*(?:-|–|—|to)\s*(\d{{1,2}})\s*\+?\s*{_YEARS}", re.I)
_MIN_RE = re.compile(rf"(?:minimum|min\.?|at\s*least|atleast)\s*(?:of\s*)?(\d{{1,2}})\s*\+?\s*{_YEARS}", re.I)
_PLAIN_RE = re.compile(rf"(\d{{1,2}}(?:\.\d)?)\s*\+?\s*(?:plus\s*)?{_YEARS}", re.I)
_EXPERIENCE_CONTEXT_RE = re.compile(r"\b(?:experience|exp|experienced|industry|professional|hands-on|work(?:ing)?)\b", re.I)
_OPTIONAL_CONTEXT_RE = re.compile(r"\b(?:preferred|nice[- ]to[- ]have|good[- ]to[- ]have|bonus|ideally|desirable)\b", re.I)
_FRESHER_RE = re.compile(
    r"\b(?:fresher|freshers|new grad|new graduates?|recent graduates?|graduate program|"
    r"campus hire|entry[- ]level|early[- ]career|0\s*(?:-|–|to)\s*\d\s*years?)\b",
    re.I,
)
_SPLIT_RE = re.compile(r"(?<=[.!?;•\n])\s+|\n")


def min_years_required(text: str) -> int | None:
    """Minimum years of experience a posting requires, or None when it states none.

    Only clauses that mention experience count, and "preferred / nice to have" clauses are
    ignored. When several requirements are stated, the strictest (largest) minimum wins.
    Fresher / new-grad wording with no number means 0.
    """
    if not text:
        return None
    found: list[float] = []
    for clause in _SPLIT_RE.split(text):
        if not clause or not _EXPERIENCE_CONTEXT_RE.search(clause):
            continue
        if _OPTIONAL_CONTEXT_RE.search(clause):
            continue
        consumed: list[tuple[int, int]] = []
        for match in _RANGE_RE.finditer(clause):
            found.append(float(match.group(1)))
            consumed.append(match.span())
        for regex in (_MIN_RE, _PLAIN_RE):
            for match in regex.finditer(clause):
                if any(s <= match.start() < e for s, e in consumed):
                    continue
                found.append(float(match.group(1)))
                consumed.append(match.span())
    found = [v for v in found if v < 25]
    if found:
        return int(max(found))
    if _FRESHER_RE.search(text):
        return 0
    return None


# --- Combined ------------------------------------------------------------------------


@dataclass(frozen=True)
class FilterOutcome:
    keep: bool
    reason: str  # "kept" or a skip reason
    min_years: int | None = None


def classify(
    posting: RawPosting,
    description_text: str,
    *,
    max_years_exclusive: int,
    include_internships: bool,
) -> FilterOutcome:
    title = (posting.title or "").strip()
    if not title:
        return FilterOutcome(False, "invalid")
    if not is_india(posting.locations, posting.country_code):
        return FilterOutcome(False, "not_india")
    if not is_engineering_title(title):
        return FilterOutcome(False, "not_engineering")
    if is_internship(title, posting.employment_type, posting.seniority_hint):
        if not include_internships:
            return FilterOutcome(False, "internship")
    if is_senior_title(title):
        return FilterOutcome(False, "senior_title")
    if posting.seniority_hint and posting.seniority_hint.lower() in _SENIOR_HINTS:
        return FilterOutcome(False, "senior_title")
    years = min_years_required(description_text)
    if years is not None and years >= max_years_exclusive:
        return FilterOutcome(False, "experience", years)
    return FilterOutcome(True, "kept", years)
