"""ATS platform profiles — how completely a real applicant-tracking system can fill its own
candidate record from this resume.

These engines are not resume graders. Each of these platforms stores an application as a set of
structured fields, and recruiters search and filter on those fields rather than on the file: what
the parser cannot fill is what the recruiter cannot find. Each engine therefore scores the share of
*that platform's own documented fields* this resume's plain text can populate, and — when a title or
job description is given — how findable the resume is in that platform's keyword search.

Field models come from each vendor's own public documentation (read 2026-10-22):

- **Greenhouse** — Job Board API, "Submit an application": `first_name`, `last_name`, `email`,
  `phone`, `resume`, `cover_letter`, `location` (+ `latitude`/`longitude`),
  `educations[school_name_id, degree_id, discipline_id, start_date{month,year}, end_date]`,
  `employments[company_name, title, start_date{month,year}, end_date, current]`, and `question_{id}`
  custom questions (how a LinkedIn URL is collected). <https://docs.greenhouse.io/job-board.html>
- **Lever** — "Create an opportunity" with `parse=true` populates `name`, `headline` (previous
  companies), `emails`, `phones`, `location`, `company` (current employer) and `links`; the contact
  object documents `location` as `{name, city, region, postalCode, country}`.
  <https://hire.lever.co/developer/documentation>
- **Workable** — `POST /jobs/{shortcode}/candidates`: `name` / `firstname` + `lastname`, `email`,
  `phone`, `address`, `summary`, `education_entries[school (required), degree, field_of_study,
  start_date, end_date]`, `experience_entries[title (required), company, industry, current,
  start_date, end_date, summary]`, `skills`, `answers[question_key]`, `resume_url`, `cover_letter`,
  `social_profiles`. <https://workable.readme.io>
- **iCIMS** — the candidate profile: basic information (location, email, phone) plus Employment,
  Education, Skills and Links blocks, where skills come from a static list of industry skills and
  are extracted from the uploaded resume. <https://community.icims.com>

Deliberately not implemented: **Workday**, whose candidate schema is behind the Workday Community
login — a field model would be guesswork, and this engine family only scores fields a vendor
publishes; and **Ashby**, whose public candidate object (`name`, `emailAddresses`, `phoneNumbers`,
`socialLinks`, `tags`, `source`, `resumeFileHandle`) measures nothing the Lever profile does not
already cover. See ENGINES.md → "ATS platform profiles".

What a platform documents are its fields, never their relative importance, so the per-field weights
in `reference_weights.PLATFORM_FIELD_WEIGHTS` are Aavedak estimates (required fields and the ones
recruiters filter on weigh most), as is the 60 / 40 split between field coverage and search
coverage. Every result says so in `limitations`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable

from app.ats.engine_result import EngineInput, engine_result
from app.ats.pipeline import (
    ANALYZING_CONTENT,
    CALCULATING_SCORE,
    DATE_RANGE_RE,
    EXTRACTING_SKILLS,
    GENERATING_REPORT,
    MATCHING_KEYWORDS,
    PARSING_JOB_DESCRIPTION,
    PARSING_RESUME,
    Emit,
    EngineContract,
    ParsedResume,
    parse_jd_shared,
    parse_resume_shared,
    require_parsable,
    role_expected_skills,
)
from app.ats.reference_signals import (
    detect_degree_level,
    education_block,
    jd_keywords,
    resume_stems,
    without_education,
)
from app.ats.reference_weights import PLATFORM_FIELD_WEIGHTS, PLATFORM_SEARCH_SHARE
from app.ats.skill_taxonomy import display_name

PLATFORM_PROFILE_VERSION = "1.0"

PLATFORM_CONTRACT = EngineContract(
    modes=("resume_only", "role_match", "job_match"), jd="optional", title="optional"
)

# ── Record extraction ───────────────────────────────────────────────────────────────────────────
# Employer names are not a closed list, so company and title are text heuristics (documented in
# every result's `limitations`). Everything else is a literal pattern: an address, a month + year,
# a degree, a school, a link.

_ROLE_WORD = re.compile(
    r"\b(?:engineer|developer|programmer|analyst|scientist|designer|architect|administrator|"
    r"consultant|manager|lead|specialist|associate|assistant|intern|internship|trainee|executive|"
    r"officer|researcher|tester|technician|founder|freelancer|strategist|coordinator)s?\b",
    re.I,
)
_ORG_SUFFIX = re.compile(
    r"\b(?:inc|llc|ltd|limited|pvt|private|plc|gmbh|corp|corporation|company|technologies|"
    r"technology|labs|laboratories|solutions|systems|services|software|consulting|consultancy|"
    r"group|studio|studios|ventures|industries|infotech|analytics|media|networks|digital|bank)\b\.?",
    re.I,
)
_AT_COMPANY = re.compile(r"\bat\s+[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3}")
_SEGMENT_SPLIT = re.compile(r"\s*[|•·⁞]\s*|\s+[–—]\s+|,\s+|\s{3,}|\t+")
_CURRENT_END = re.compile(r"\b(?:present|current|now|till date|to date)\b", re.I)
_MONTH_NAME = re.compile(
    r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b|\b(?:19|20)\d{2}-\d{1,2}\b",
    re.I,
)
# Words that look like a company in a "Title | X | dates" line but are not one.
_NOT_A_COMPANY = frozenset(
    """remote hybrid onsite on-site india bharat usa uk full-time fulltime part-time parttime
    contract contractual freelance internship intern permanent temporary present current now
    summer winter promoted""".split()
)
_SCHOOL_RE = re.compile(
    r"\b(?:university|universidad|institute|institution|college|school|academy|polytechnic|"
    r"vidyalaya|vidyapeeth|iit|nit|iiit|bits|vit|srm|manipal)\b",
    re.I,
)
_FIELD_OF_STUDY = re.compile(
    r"\b(?:computer science(?:\s*(?:and|&)\s*engineering)?|information technology|information "
    r"science|information systems|software engineering|electronics(?:\s*(?:and|&)\s*communication)?|"
    r"electrical(?:\s*(?:and|&)\s*electronics)?|mechanical|civil|chemical|instrumentation|"
    r"aeronautical|data science|artificial intelligence|machine learning|cyber\s?security|"
    r"statistics|mathematics|physics|chemistry|economics|commerce|accounting|finance|"
    r"business administration|management studies|biotechnology|bioinformatics|design|cse|ece|eee)\b",
    re.I,
)
_DEGREE_IN = re.compile(r"\b(?:in|of)\s+([A-Za-z][A-Za-z&\s]{3,40})", re.I)
_SUMMARY_HEAD = re.compile(r"^\s*(?:professional\s+)?(?:summary|profile|objective|about me)\s*:?\s*$", re.I | re.M)
_WEBSITE_RE = re.compile(
    r"\b(?:https?://|www\.)[\w.-]+\.[a-z]{2,}\S*|\b[\w-]+\.(?:dev|io|me|com|in|app|tech|xyz|vercel\.app|netlify\.app)\b",
    re.I,
)


@dataclass(frozen=True)
class RoleEntry:
    """One employment entry as a platform's parser would see it."""

    line: str
    has_title: bool
    has_company: bool
    has_month_year: bool
    is_current: bool


@dataclass(frozen=True)
class CandidateRecord:
    name: bool
    email: bool
    phone: bool
    location: str | None
    linkedin: bool
    github: bool
    website: bool
    summary: bool
    roles: tuple[RoleEntry, ...]
    education_heading: bool
    school: bool
    degree_level: int
    field_of_study: bool
    skills: tuple[str, ...]
    skills_section: bool

    @property
    def any_link(self) -> bool:
        return self.linkedin or self.github or self.website


def _header_location(lines: tuple[str, ...]) -> str | None:
    """The candidate's own location: a place name in the contact header, not an employer's city."""
    from app.discovery.jobs.locations import canonical_location

    for line in lines[:12]:
        for seg in _SEGMENT_SPLIT.split(line):
            seg = seg.strip(" .•|")
            if not seg or len(seg) > 60 or "@" in seg:
                continue
            if (resolved := canonical_location(seg)) and resolved != "Remote":
                return resolved
    return None


def _segment_is_company(seg: str) -> bool:
    seg = seg.strip(" .,")
    if not seg or len(seg.split()) > 4 or any(ch.isdigit() for ch in seg):
        return False
    if _ROLE_WORD.search(seg) or DATE_RANGE_RE.search(seg):
        return False
    words = [w for w in seg.split() if w]
    if not words or all(w.lower() in _NOT_A_COMPANY for w in words):
        return False
    return any(w[:1].isupper() for w in words)


def _roles(experience_text: str) -> tuple[RoleEntry, ...]:
    lines = [l.rstrip() for l in experience_text.splitlines()]
    out: list[RoleEntry] = []
    for i, line in enumerate(lines):
        m = DATE_RANGE_RE.search(line)
        if not m:
            continue
        neighbours = [lines[j].strip() for j in (i - 1, i + 1) if 0 <= j < len(lines)]
        ctx = " ⁞ ".join([line.strip(), *neighbours])
        start_raw, end_raw = m.group(1), m.group(2)
        is_current = bool(_CURRENT_END.search(end_raw))
        has_month_year = bool(_MONTH_NAME.search(start_raw)) and (
            is_current or bool(_MONTH_NAME.search(end_raw))
        )
        has_company = bool(_ORG_SUFFIX.search(ctx) or _AT_COMPANY.search(ctx)) or any(
            _segment_is_company(seg) for seg in _SEGMENT_SPLIT.split(line)
        )
        out.append(
            RoleEntry(
                line=line.strip()[:160],
                has_title=bool(_ROLE_WORD.search(ctx)),
                has_company=has_company,
                has_month_year=has_month_year,
                is_current=is_current,
            )
        )
    return tuple(out)


@lru_cache(maxsize=64)
def extract_record(resume_text: str) -> CandidateRecord:
    """Everything an ATS parser would try to put into its candidate fields."""
    resume = parse_resume_shared(resume_text)
    edu = education_block(resume.raw)
    # No education heading: degrees are still searched for in the whole text, but a parser has no
    # block to map onto its education fields, which is what the education findings say.
    edu_text = edu or resume.raw
    degree = detect_degree_level(edu_text)
    field = bool(_FIELD_OF_STUDY.search(edu_text))
    if not field and degree:
        field = any(
            _FIELD_OF_STUDY.search(m.group(1)) for m in _DEGREE_IN.finditer(edu_text)
        )
    return CandidateRecord(
        name=bool(resume.name),
        email=bool(resume.email),
        phone=bool(resume.phone),
        location=_header_location(resume.lines),
        linkedin=resume.linkedin,
        github=resume.github,
        website=bool(_WEBSITE_RE.search("\n".join(resume.lines[:12]))),
        summary=bool(_SUMMARY_HEAD.search(resume.raw)),
        roles=_roles(without_education(resume.raw)),
        education_heading=bool(edu.strip()),
        school=bool(_SCHOOL_RE.search(edu_text)),
        degree_level=degree,
        field_of_study=field,
        skills=resume.hard_skills,
        skills_section=bool(resume.skills_section_skills),
    )


# ── Field checks ────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class FieldCheck:
    key: str
    api_field: str  # the vendor's own field name
    label: str
    value: float  # 0–1 share of this field the parser could fill
    detail: str
    fix: str


def _share(ok: int, total: int) -> float:
    return (ok / total) if total else 0.0


def _bool(ok: bool) -> float:
    return 1.0 if ok else 0.0


def _roles_detail(rec: CandidateRecord, ok: int, what: str) -> str:
    if not rec.roles:
        return "No employment entry with a date range was detected."
    return f"{ok} of {len(rec.roles)} detected employment entries {what}."


def _contact_checks(rec: CandidateRecord) -> dict[str, FieldCheck]:
    """Checks shared by every platform — each vendor picks and weights the ones it stores."""
    return {
        "name": FieldCheck(
            "name", "first_name / last_name", "Candidate name", _bool(rec.name),
            "A name line (2–4 capitalised words, no digits) was found."
            if rec.name
            else "The first lines don't read as a name, so the name fields stay empty.",
            "Put your full name alone on the first line, in plain text — not inside a header image, "
            "a table cell or a design banner.",
        ),
        "email": FieldCheck(
            "email", "email", "Email address", _bool(rec.email),
            "A plain-text email address was found." if rec.email else "No plain-text email address was found.",
            "Write your email as selectable text (name@domain.com) in the header; an icon, QR code "
            "or image is skipped by every parser here.",
        ),
        "phone": FieldCheck(
            "phone", "phone", "Phone number", _bool(rec.phone),
            "A phone number was found." if rec.phone else "No phone number was found.",
            "Add a phone number as ordinary digits with the country code (+91 …), on its own in the header.",
        ),
        "location": FieldCheck(
            "location", "location", "Location", _bool(rec.location),
            f"Resolved to {rec.location}." if rec.location
            else "No city or region was found in the contact header.",
            "Add “City, State” (for example “Pune, Maharashtra”) to the header line — recruiters "
            "filter candidates by location, and an unfilled location drops you out of that filter.",
        ),
        "links": FieldCheck(
            "links", "links", "Profile links", _bool(rec.any_link),
            "Found: "
            + ", ".join(
                [n for n, ok in (("LinkedIn", rec.linkedin), ("GitHub", rec.github), ("website", rec.website)) if ok]
            )
            if rec.any_link
            else "No LinkedIn, GitHub or portfolio URL was found.",
            "Add your LinkedIn and GitHub (or portfolio) as full plain-text URLs in the header.",
        ),
    }


def _employment_checks(rec: CandidateRecord, prefix: str) -> dict[str, FieldCheck]:
    titled = sum(1 for r in rec.roles if r.has_title)
    companies = sum(1 for r in rec.roles if r.has_company)
    dated = sum(1 for r in rec.roles if r.has_month_year)
    currents = sum(1 for r in rec.roles if r.is_current)
    return {
        f"{prefix}_title": FieldCheck(
            f"{prefix}_title", f"{prefix}[].title", "Job title per role", _share(titled, len(rec.roles)),
            _roles_detail(rec, titled, "carry a recognisable job title"),
            "Put a conventional title (“Backend Engineer”, “Data Analyst”) on the same line as the "
            "employer and dates for every role — invented titles don't map onto the title field.",
        ),
        f"{prefix}_company": FieldCheck(
            f"{prefix}_company", f"{prefix}[].company", "Employer per role", _share(companies, len(rec.roles)),
            _roles_detail(rec, companies, "carry an employer name"),
            "Name the employer next to each role (“Acme Technologies — Backend Engineer”); a logo "
            "or a design sidebar leaves the company field empty.",
        ),
        f"{prefix}_dates": FieldCheck(
            f"{prefix}_dates", f"{prefix}[].start_date / end_date", "Month + year dates",
            _share(dated, len(rec.roles)),
            _roles_detail(rec, dated, "give a month and year on both ends")
            + " These fields store a month and a year, so a bare “2021 – 2023” parses incompletely.",
            "Write dates as “Mar 2021 – Jun 2023” (or “– Present”): month and year on both ends, "
            "one format throughout.",
        ),
        f"{prefix}_current": FieldCheck(
            f"{prefix}_current", f"{prefix}[].current", "Current role marked",
            _bool(currents == 1) if rec.roles else 0.0,
            "Exactly one role is marked Present."
            if currents == 1
            else f"{currents} roles are marked Present/Current — the current-employment flag is ambiguous."
            if currents > 1
            else "No role is marked Present, so the current-employment flag cannot be set.",
            "End your present role with “– Present” and give every earlier role a real end date, so "
            "exactly one entry is current.",
        ),
    }


def _education_checks(rec: CandidateRecord) -> dict[str, FieldCheck]:
    return {
        "education_school": FieldCheck(
            "education_school", "education[].school", "School / institution", _bool(rec.school),
            "An institution name was found." if rec.school else "No university, institute or college name was found.",
            "Write the full institution name under an “Education” heading (“Pune Institute of "
            "Computer Technology”), not only an abbreviation or a logo.",
        ),
        "education_degree": FieldCheck(
            "education_degree", "education[].degree", "Degree", _bool(rec.degree_level > 0),
            "A degree was recognised." if rec.degree_level else "No degree was recognised.",
            "Spell the degree out (“B.Tech”, “Bachelor of Technology”, “MCA”) next to the institution.",
        ),
        "education_field": FieldCheck(
            "education_field", "education[].discipline / field_of_study", "Field of study",
            _bool(rec.field_of_study),
            "A field of study was recognised." if rec.field_of_study else "No field of study was found.",
            "Name the discipline after the degree — “B.Tech in Computer Science” — because it is a "
            "separate field recruiters filter on.",
        ),
        "education_block": FieldCheck(
            "education_block", "education[]", "Education block",
            (_bool(rec.education_heading) + _bool(rec.school) + _bool(rec.degree_level > 0)) / 3,
            f"Education heading {'found' if rec.education_heading else 'missing'}; "
            f"school {'found' if rec.school else 'missing'}; "
            f"degree {'found' if rec.degree_level else 'missing'}.",
            "Keep an “Education” heading with institution, degree and years on their own lines.",
        ),
    }


def _misc_checks(rec: CandidateRecord) -> dict[str, FieldCheck]:
    skill_fill = min(1.0, len(rec.skills) / 5) * (1.0 if rec.skills_section else 0.5)
    return {
        "summary": FieldCheck(
            "summary", "summary", "Summary", _bool(rec.summary),
            "A summary/profile heading was found." if rec.summary else "No summary or profile section was found.",
            "Add a two-line “Summary” under your name stating your role, years and focus — it is a "
            "stored field and the first thing shown on the profile.",
        ),
        "skills": FieldCheck(
            "skills", "skills", "Skills", skill_fill,
            f"{len(rec.skills)} recognised skills"
            + (" under a Skills heading." if rec.skills_section else ", but no Skills heading was detected."),
            "List your tools as words under a “Skills” heading (React, PostgreSQL, Docker) — skill "
            "bars, logos and icon rows carry no text to extract.",
        ),
        "headline": FieldCheck(
            "headline", "headline", "Previous companies (headline)",
            _share(sum(1 for r in rec.roles if r.has_company), len(rec.roles)),
            _roles_detail(rec, sum(1 for r in rec.roles if r.has_company), "carry an employer name"),
            "Name every employer in plain text: the headline is built from your previous companies "
            "and is what recruiters see before opening the resume.",
        ),
        "company": FieldCheck(
            "company", "company", "Current employer",
            _bool(any(r.is_current and r.has_company for r in rec.roles)),
            "A current employer was identified."
            if any(r.is_current and r.has_company for r in rec.roles)
            else "No role marked Present carries an employer name, so the current-company field stays empty.",
            "Mark your present role “– Present” with the employer's name on the same line.",
        ),
        "employment_entries": FieldCheck(
            "employment_entries", "employment[]", "Employment block", _bool(bool(rec.roles)),
            f"{len(rec.roles)} employment entries detected."
            if rec.roles
            else "No employment entry with a date range was detected.",
            "Use a “Work Experience” heading and give each role its own line with employer, title "
            "and dates, so the employment block can be mapped at all.",
        ),
    }


def _all_checks(rec: CandidateRecord, prefix: str) -> dict[str, FieldCheck]:
    return {
        **_contact_checks(rec),
        **_employment_checks(rec, prefix),
        **_education_checks(rec),
        **_misc_checks(rec),
    }


# ── Platform definitions ────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Platform:
    engine_id: str
    name: str
    profile_id: str
    reference: str
    #: `employments` (Greenhouse), `experience` (Workable), `employment` (iCIMS) — the vendor's own
    #: name for the work-history array, used in the field labels.
    prefix: str
    record_note: str


PLATFORMS: tuple[Platform, ...] = (
    Platform(
        "greenhouse_ats", "Greenhouse", "greenhouse-platform",
        "docs.greenhouse.io/job-board.html (Job Board API — Submit an application)",
        "employments",
        "Greenhouse stores an application as first/last name, email, phone, location, an "
        "`employments` array (company, title, month + year dates, current flag) and an "
        "`educations` array (school, degree, discipline). Links are collected as custom questions.",
    ),
    Platform(
        "lever_ats", "Lever", "lever-platform",
        "hire.lever.co/developer/documentation (Opportunities — create with parse=true)",
        "employments",
        "Lever is candidate-centric: parsing a resume fills name, headline (previous companies), "
        "emails, phones, location, current company and links. It stores no education fields, so "
        "this profile weights contact details, employers and links instead.",
    ),
    Platform(
        "workable_ats", "Workable", "workable-platform",
        "workable.readme.io (Create a candidate — POST /jobs/{shortcode}/candidates)",
        "experience",
        "Workable's candidate object carries name, email, phone, address, summary, "
        "`experience_entries` (title is required) and `education_entries` (school is required), "
        "plus skills and social profiles.",
    ),
    Platform(
        "icims_ats", "iCIMS", "icims-platform",
        "community.icims.com (the candidate profile: basic information, Employment, Education, Skills, Links)",
        "employment",
        "The iCIMS candidate profile leads with location, email and phone, then Employment, "
        "Education, Skills and Links blocks; its skills come from a static industry skill list, so "
        "they have to appear as words on the resume.",
    ),
)
PLATFORM_BY_ID = {p.engine_id: p for p in PLATFORMS}


# ── Search coverage ────────────────────────────────────────────────────────────────────────────


def _search_coverage(
    inp: EngineInput, resume: ParsedResume, name: str, emit: Emit
) -> tuple[float | None, list[str], list[str], list[dict], str]:
    """How much of what a recruiter would search for is present as text.

    Every platform here lets recruiters keyword-search candidate records, so this is the same
    measurement for all four; only the field model differs between them.
    """
    if inp.mode == "resume_only":
        return None, [], [], [], ""
    emit(EXTRACTING_SKILLS, None)
    have = set(resume.hard_skills)
    if inp.mode == "role_match":
        wanted = list(role_expected_skills(inp.role, engine_name=name))
        keywords: list[str] = []
    else:
        jd = parse_jd_shared(inp.jd_text, inp.role)
        wanted = list(jd.hard_skills)
        keywords = jd_keywords(inp.jd_text, inp.role, limit=20)
    emit(MATCHING_KEYWORDS, None)
    matched = [c for c in wanted if c in have]
    missing = [c for c in wanted if c not in have]
    stems = resume_stems(resume.raw)
    kw_hit = [k for k in keywords if k in stems]
    skill_share = _share(len(matched), len(wanted)) if wanted else None
    kw_share = _share(len(kw_hit), len(keywords)) if keywords else None
    parts = [(0.6, skill_share), (0.4, kw_share)]
    live = [(w, v) for w, v in parts if v is not None]
    if not live:
        return None, matched, missing, [], ""
    total_w = sum(w for w, _ in live)
    coverage = sum(w * v for w, v in live) / total_w
    rows = [
        {"key": "search_skills", "label": "Searchable skills from the posting",
         "score": round((skill_share or 0) * 100), "weight": round(0.6 / total_w, 4),
         "parent": "Search coverage"}
        if skill_share is not None
        else None,
        {"key": "search_keywords", "label": "Other recurring job-description terms",
         "score": round((kw_share or 0) * 100), "weight": round(0.4 / total_w, 4),
         "parent": "Search coverage"}
        if kw_share is not None
        else None,
    ]
    detail = (
        f"{len(matched)}/{len(wanted)} skills"
        + (f" and {len(kw_hit)}/{len(keywords)} recurring terms" if keywords else "")
        + " from the posting appear on the resume."
    )
    return coverage, matched, missing, [r for r in rows if r], detail


# ── Runner ─────────────────────────────────────────────────────────────────────────────────────


def _severity(weight: float, value: float) -> str:
    if value <= 0 and weight >= 0.10:
        return "critical"
    if weight >= 0.10:
        return "high"
    if weight >= 0.06:
        return "medium"
    return "low"


def _band(score: float) -> str:
    if score >= 85:
        return "Complete"
    if score >= 70:
        return "Mostly complete"
    if score >= 50:
        return "Gaps in key fields"
    return "Incomplete"


def run_platform(platform: Platform, inp: EngineInput, emit: Emit) -> dict[str, Any]:
    emit(PARSING_RESUME, None)
    resume = parse_resume_shared(inp.resume_text)
    require_parsable(resume)
    if inp.mode == "job_match":
        emit(PARSING_JOB_DESCRIPTION, None)

    emit(ANALYZING_CONTENT, f"Mapping the resume onto {platform.name}'s candidate fields")
    rec = extract_record(inp.resume_text)
    checks = _all_checks(rec, platform.prefix)
    weights = PLATFORM_FIELD_WEIGHTS[platform.engine_id]

    fields = [(checks[key], w) for key, w in weights.items()]
    field_coverage = sum(w * c.value for c, w in fields) / sum(w for _, w in fields)

    search, matched, missing, search_rows, search_detail = _search_coverage(
        inp, resume, platform.name, emit
    )

    emit(CALCULATING_SCORE, None)
    if search is None:
        overall = field_coverage * 100
        formula = f"overall = field coverage ({len(fields)} {platform.name} candidate fields, weighted)"
    else:
        share = PLATFORM_SEARCH_SHARE
        overall = (1 - share) * field_coverage * 100 + share * search * 100
        formula = (
            f"overall = {round((1 - share) * 100)}% field coverage ({len(fields)} weighted "
            f"{platform.name} candidate fields) + {round(share * 100)}% recruiter-search coverage "
            "(0.6 skills + 0.4 other job-description terms)"
        )

    emit(GENERATING_REPORT, None)
    findings: list[dict] = []
    improvements: list[dict] = []
    strengths: list[str] = []
    for check, weight in sorted(fields, key=lambda f: -f[1]):
        if check.value >= 0.999:
            strengths.append(f"{check.label} ({check.api_field}) parses cleanly")
            continue
        severity = _severity(weight, check.value)
        findings.append(
            {
                "id": f"field.{check.key}",
                "severity": severity,
                "category": "contact" if check.key in ("name", "email", "phone", "location", "links") else "structure",
                "title": f"{platform.name} field “{check.api_field}” "
                + ("cannot be filled" if check.value <= 0 else "is only partly filled"),
                "detail": f"{check.detail} Field weight {round(weight * 100)}% of this platform's record.",
                "recommendation": check.fix,
            }
        )
        improvements.append(
            {
                "key": f"field.{check.key}",
                "kind": "platform_field",
                "priority": "high" if severity in ("critical", "high") else "medium" if severity == "medium" else "low",
                "text": check.fix,
                "reason": f"{platform.name} {check.api_field}: {check.detail}",
                "findingId": f"field.{check.key}",
            }
        )

    breakdown = [
        {
            "key": check.key,
            "label": f"{check.label} ({check.api_field})",
            "score": round(check.value * 100),
            "weight": round(weight * (1 - (PLATFORM_SEARCH_SHARE if search is not None else 0)), 4),
            "contribution": round(
                check.value * 100 * weight * (1 - (PLATFORM_SEARCH_SHARE if search is not None else 0)), 1
            ),
            "parent": "Field coverage",
            "detail": check.detail,
        }
        for check, weight in fields
    ]
    if search is not None:
        breakdown.append(
            {
                "key": "search_coverage",
                "label": "Recruiter-search coverage",
                "score": round(search * 100),
                "weight": PLATFORM_SEARCH_SHARE,
                "contribution": round(search * 100 * PLATFORM_SEARCH_SHARE, 1),
                "detail": search_detail,
            }
        )
        breakdown.extend(search_rows)

    warnings: list[str] = []
    if inp.mode == "job_match" and search is None:
        warnings.append(
            "No skills or recurring terms could be read from this job description, so only field "
            "coverage was scored."
        )
    if not rec.roles:
        warnings.append(
            "No employment entry with a date range was detected, so every work-history field scored 0."
        )

    score_type = "parse_readiness" if inp.mode == "resume_only" else "application_readiness"
    return engine_result(
        inp=inp,
        resume=resume,
        engine_id=platform.engine_id,
        engine_name=platform.name,
        profile_id=platform.profile_id,
        score_type=score_type,
        score_name=f"{platform.name} Parse Readiness"
        if inp.mode == "resume_only"
        else f"{platform.name} Application Readiness",
        overall=overall,
        score_label=f"{_band(overall)} {platform.name} record",
        formula=formula,
        reference=platform.reference,
        breakdown=breakdown,
        findings=findings,
        improvements=improvements,
        scores={
            "atsCompatibility": round(field_coverage * 100),
            "structureFormatting": round(field_coverage * 100),
            "keywordCoverage": round(search * 100) if search is not None else None,
        },
        strengths=strengths,
        matched=[
            {"skill": display_name(c), "canonical": c, "status": "matched", "strength": 0.85}
            for c in matched
        ],
        missing=[
            {"skill": display_name(c), "canonical": c, "status": "missing", "strength": 0}
            for c in missing
        ],
        metrics=[
            {"key": "employment_entries", "label": "Employment entries detected", "value": len(rec.roles)},
            {"key": "field_coverage", "label": "Field coverage", "value": round(field_coverage * 100), "unit": "%"},
            *(
                [{"key": "search_coverage", "label": "Search coverage", "value": round(search * 100), "unit": "%"}]
                if search is not None
                else []
            ),
        ],
        warnings=warnings,
        limitations=[
            f"Measures how completely {platform.name}'s documented candidate fields can be filled "
            "from this resume's text — it is not a score, ranking or match rate produced by "
            f"{platform.name}, and Aavedak is not affiliated with it.",
            "The field list is the vendor's own public documentation; the weight on each field and "
            f"the {round(PLATFORM_SEARCH_SHARE * 100)}% search share are Aavedak estimates — no "
            "vendor publishes how it weights its fields.",
            "Employer names and job titles are not closed lists, so those two checks are text "
            "heuristics and can miss an unusual company name or title.",
            "Parsing here runs on extracted text: the real parser also sees the file's layout, "
            "fonts and columns, which no text-only engine can judge.",
            platform.record_note,
        ],
        blurb=f"{platform.name} candidate-record readiness: how much of {platform.name}'s own "
        "application data model this resume can fill, plus how findable it is in a recruiter search.",
        profile_version=PLATFORM_PROFILE_VERSION,
        reference_label="field model from",
    )


def _runner(platform: Platform) -> Callable[[EngineInput, Emit], dict[str, Any]]:
    def run(inp: EngineInput, emit: Emit) -> dict[str, Any]:
        return run_platform(platform, inp, emit)

    return run


PLATFORM_ENGINES: dict[str, tuple[str, EngineContract, Callable[[EngineInput, Emit], dict[str, Any]]]] = {
    p.engine_id: (p.name, PLATFORM_CONTRACT, _runner(p)) for p in PLATFORMS
}
