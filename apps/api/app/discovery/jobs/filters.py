"""Relevance filters applied *before* anything is written: jobs in India or remote roles open
to India, tech roles (engineering in any discipline plus data, ML/AI, QA, IT/infra,
security, design and junior product roles), junior (stated minimum experience below the
configured cap).

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
    "trichy|salem(?!,? (?:oregon|or|massachusetts|ma|new hampshire|nh|virginia|va)\\b)|hosur|"
    "mysuru|mysore|mangaluru|mangalore|hubli|belagavi|belgaum|indore|bhopal|"
    "nagpur|nashik|aurangabad|chandigarh|mohali|panchkula|ludhiana|amritsar|dehradun|lucknow|"
    "kanpur|varanasi|prayagraj|patna|ranchi|jamshedpur|bhubaneswar|cuttack|visakhapatnam|vizag|"
    "vijayawada|guntur|tirupati|warangal|goa|panaji|guwahati|raipur|jodhpur|"
    # Tech parks, industrial belts, and tier-2/3 cities with engineering employers.
    "whitefield|electronic city|manyata|hinjewadi|hinjawadi|pimpri|chinchwad|chakan|talegaon|"
    "ranjangaon|magarpatta|kharadi|powai|vikhroli|airoli|bhiwandi|kolhapur|sangli|satara|solapur|"
    "ahmednagar|amravati|amaravati|jalgaon|latur|nanded|manesar|bawal|dharuhera|rewari|neemrana|"
    "bhiwadi|alwar|kota(?! kinabalu)|ajmer|bikaner|sonipat|panipat|rohtak|karnal|ambala|hisar|"
    "kurukshetra|"
    "jalandhar|patiala|bathinda|zirakpur|rajpura|baddi|shimla|solan|jammu|srinagar|haridwar|"
    "roorkee|rudrapur|pantnagar|kashipur|haldwani|meerut|agra|aligarh|bareilly|moradabad|"
    "gorakhpur|jhansi|dhanbad|bokaro|durgapur|asansol|siliguri|haldia|kharagpur|howrah|"
    "rourkela|sambalpur|angul|jharsuguda|bhilai|bilaspur|korba|gwalior|jabalpur|ujjain|"
    "pithampur|dewas|vapi|bharuch|ankleshwar|dahej|sanand|halol|mehsana|jamnagar|bhavnagar|"
    "gandhidham|mundra|nellore|kakinada|rajahmundry|kurnool|anantapur|sri city|karimnagar|"
    "nizamabad|khammam|sriperumbudur|oragadam|chengalpattu|kanchipuram|vellore|ranipet|"
    "krishnagiri|tiruppur|erode|karur|namakkal|thanjavur|tirunelveli|thoothukudi|tuticorin|"
    "nagercoil|puducherry|pondicherry|thrissur|kollam|kannur|palakkad|technopark|infopark|"
    "manipal|udupi|dharwad|davangere|shivamogga|shimoga|kalaburagi|gulbarga|ballari|bellary|"
    "tumakuru|tumkur|shillong|imphal|agartala|aizawl|kohima|itanagar|gangtok|port blair|"
    "daman|silvassa|gift city|"
    # Common misspellings seen on job boards.
    "banglore|bengalore|hyderbad|gurgoan|chenai|"
    "karnataka|maharashtra|tamil nadu|telangana|andhra pradesh|kerala|gujarat|rajasthan|"
    "uttar pradesh|haryana|punjab|west bengal|odisha|orissa|madhya pradesh|bihar|jharkhand|"
    "assam|uttarakhand|chhattisgarh|himachal pradesh|jammu and kashmir|ladakh|sikkim|"
    "meghalaya|manipur|mizoram|nagaland|tripura|arunachal pradesh|andaman"
)
_INDIA_RE = re.compile(rf"\b(?:{_INDIA_PLACES})\b", re.I)
_INDIA_CODES = {"in", "ind", "india"}


def is_india(locations: list[str], country_code: str | None = None) -> bool:
    """True when a location or country code is explicitly Indian. A bare "Remote" or
    "Anywhere" is not treated as India."""
    if country_code and country_code.strip().lower() in _INDIA_CODES:
        return True
    return any(_INDIA_RE.search(loc or "") for loc in locations)


# Remote roles explicitly open to India: "Remote - APAC", "Remote (Worldwide)", "Anywhere".
# A bare "Remote" is usually tied to the employer's home country, so it is not enough.
_REMOTE_RE = re.compile(r"\b(?:remote|work from home|wfh|distributed|fully remote)\b", re.I)
_OPEN_REGION_RE = re.compile(
    r"\b(?:worldwide|world ?wide|global(?:ly)?|anywhere|international|apac|asia|asia[- ]pacific|"
    r"south asia|emea ?& ?apac|any (?:country|location|timezone))\b",
    re.I,
)
# Asian sub-regions that exclude India.
_OTHER_ASIA_RE = re.compile(r"\b(?:south[- ]?east|east|central|west(?:ern)?|north) asia\b", re.I)
_ANYWHERE_RE = re.compile(r"^\s*(?:anywhere|worldwide|anywhere in the world)\s*$", re.I)


def is_remote_open_to_india(locations: list[str], country_code: str | None = None) -> bool:
    """True for remote postings whose stated region includes India (worldwide / APAC / Asia).
    A non-Indian country code means the remote role is tied to that country."""
    if country_code and country_code.strip().lower() not in _INDIA_CODES:
        return False
    for loc in locations:
        loc = loc or ""
        if _ANYWHERE_RE.match(loc):
            return True
        if _REMOTE_RE.search(loc) and _OPEN_REGION_RE.search(_OTHER_ASIA_RE.sub(" ", loc)):
            return True
    return False


def is_india_eligible(locations: list[str], country_code: str | None = None) -> bool:
    """Location rule for discovery: an Indian location, or a remote role open to India."""
    return is_india(locations, country_code) or is_remote_open_to_india(locations, country_code)


# --- Role ----------------------------------------------------------------------------

_ENGINEERING_RE = re.compile(
    r"\b(?:engineer|engineers|engineering|developer|developers|programmer|sde|swe|sdet|"
    r"devops|devsecops|sre|firmware|technologist|graduate engineer(?:ing)? trainee)\b",
    re.I,
)
# Other tech roles that are open to juniors: data & analytics, ML/AI, QA/testing, IT &
# infrastructure, security, design, and entry-level product. Kept to explicit phrases so
# generic words ("analyst", "scientist", "designer") alone do not match.
_TECH_ROLE_RE = re.compile(
    r"\b(?:data (?:analyst|scientist|science|analytics)|"
    r"business intelligence|bi (?:analyst|developer)|power bi|analytics (?:analyst|associate)|"
    r"business analyst|product analyst|quantitative analyst|quant (?:analyst|researcher|developer)|"
    r"machine learning|ai\s*ml|ml\s*ai|mlops|deep learning|computer vision|nlp|generative ai|genai|"
    r"(?:applied|research|ml|ai|decision) scientist|(?:ai|ml) researcher|"
    r"qa|quality assurance|tester|testers|test analyst|automation test\w*|manual test\w*|"
    r"software test\w*|"
    r"system administrator|systems administrator|sysadmin|network administrator|"
    r"database administrator|dba|cloud administrator|it support|it analyst|it associate|"
    r"it administrator|desktop support|service desk|help ?desk|technical support|noc|"
    r"security analyst|soc analyst|cyber ?security|information security|penetration tester|"
    r"pentester|ui designer|ux designer|ui\s*ux|ux\s*ui|ux researcher|product designer|"
    r"interaction designer|associate product manager|apm|product management (?:associate|trainee))\b",
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
    """True for titles in discovery's role scope: engineering (any discipline) or one of the
    junior-friendly tech roles in `_TECH_ROLE_RE`."""
    title = _title_words(title)
    if _NON_ENGINEERING_RE.search(title):
        return False
    return bool(_ENGINEERING_RE.search(title) or _TECH_ROLE_RE.search(title) or _GET_RE.search(title))


# Entry-level product titles contain "manager" but are junior roles.
_JUNIOR_MANAGER_TITLE_RE = re.compile(r"\b(?:associate product manager|apm)\b", re.I)


def is_senior_title(title: str) -> bool:
    title = _JUNIOR_MANAGER_TITLE_RE.sub(" ", _title_words(title))
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
    if not is_india_eligible(posting.locations, posting.country_code):
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
