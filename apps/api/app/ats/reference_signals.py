"""Signals for reference ATS profiles (deterministic heuristics)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ats.skill_taxonomy import SKILL_ALIASES

SOFT_TERMS = (
    "communication",
    "collaboration",
    "leadership",
    "mentoring",
    "ownership",
    "teamwork",
    "stakeholder",
    "problem solving",
    "agile",
    "scrum",
)

STOP = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "your",
        "have",
        "will",
        "are",
        "was",
        "were",
        "our",
        "you",
        "all",
        "any",
        "can",
        "may",
        "not",
        "but",
        "into",
        "about",
        "over",
        "such",
        "than",
        "then",
        "them",
        "they",
        "their",
        "been",
        "being",
        "also",
        "using",
        "use",
        "used",
        "work",
        "team",
        "role",
        "job",
        "years",
        "year",
        "experience",
        "required",
        "requirements",
        "preferred",
        "including",
        "ability",
        "strong",
    }
)

HARD_SKILL_ALIASES: dict[str, list[str]] = {
    canonical: list(aliases) for canonical, (_display, aliases) in SKILL_ALIASES.items()
}


def _escape_re(s: str) -> str:
    return re.escape(s)


def count_phrase(haystack: str, phrase: str) -> int:
    p = (phrase or "").strip().lower()
    if not p:
        return 0
    pat = rf"(?<![a-z0-9]){_escape_re(p)}(?![a-z0-9])"
    return len(re.findall(pat, haystack, flags=re.I))


# The taxonomy leaves bare "go" out (it's an English verb). Vendors still recognise the language, so
# count a capitalised "Go" only where it reads as a list item next to other terms:
# "Python, Go, SQL", "in Go and Python", "Python or Go", "Python and/or Go", "Go/Rust".
_GO_LANG = re.compile(
    r"(?:^|[,/(:]|\b(?:in|and|or|with|and/or))\s*Go(?=\s*(?:[,/);]|\.?\s*$|\b(?:and|or)\b))",
    re.M,
)


def go_count(text: str) -> int:
    return len(_GO_LANG.findall(text or ""))


def _find_hard(text: str) -> list[str]:
    lower = text.lower()
    found: list[str] = []
    for canonical, aliases in HARD_SKILL_ALIASES.items():
        if any(count_phrase(lower, a) > 0 for a in aliases) or (canonical == "go" and go_count(text)):
            found.append(canonical)
    return found


# Inflection-aware soft-skill patterns: "mentored" / "mentor" count for mentoring, "collaborated" for
# collaboration, "communicating" for communication. Exact-phrase matching missed them on both sides.
_SOFT_PATTERNS: dict[str, re.Pattern[str]] = {
    "communication": re.compile(r"\bcommunicat(?:e|es|ed|ing|ion|ions|or)\b"),
    "collaboration": re.compile(r"\bcollaborat(?:e|es|ed|ing|ion|ive)\b|\bcross-functional\b"),
    "leadership": re.compile(r"\bleadership\b"),
    "mentoring": re.compile(r"\bmentor(?:s|ed|ing|ship)?\b"),
    "ownership": re.compile(r"\bownership\b"),
    "teamwork": re.compile(r"\bteamwork\b|\bteam player\b"),
    "stakeholder": re.compile(r"\bstakeholders?\b"),
    "problem solving": re.compile(r"\bproblem[- ]solv(?:ing|er|e)\b"),
    "agile": re.compile(r"\bagile\b"),
    "scrum": re.compile(r"\bscrum\b"),
}
assert set(_SOFT_PATTERNS) == set(SOFT_TERMS)


def _soft_hits(text: str) -> list[str]:
    lower = text.lower()
    return [t for t in SOFT_TERMS if _SOFT_PATTERNS[t].search(lower)]


# ── "Other keywords" (Jobscan / Teal / SkillSyncer) ─────────────────────────────────────────────
# All three describe a third keyword bucket beside hard and soft skills: the JD's recurring words.
# Built from the JD *after* removing hiring boilerplate (company pitch, benefits, EEO), excluding
# words already counted as hard/soft skills, ranked by frequency, matched on stems so "APIs" meets
# "API" and "services" meets "service".

_BOILERPLATE_HEAD = re.compile(
    r"^\s*(?:benefits|perks(?: and benefits)?|what we offer|why (?:join|work)|about (?:us|the company|the team)"
    r"|who we are|our (?:culture|values|mission)|compensation|equal (?:opportunity|employment)|eeo)\b.*$",
    re.I,
)
_KEEP_HEAD = re.compile(
    r"^\s*(?:what you(?:'|’)?ll do|responsibilit|requirements?|qualifications?|what we(?:'|’)?re looking"
    r"|you have|must have|nice to have|preferred|skills|about the role|the role|minimum|basic)\b",
    re.I,
)
_KW_FILLER = frozenset(
    """what what's whats we're were you'll youll your you're who how why when where which while within
    make made build own join help world-class fast-growing mission future simple millions plus etc
    across based like well new great best high highly level levels day days good able looking
    familiarity proficiency equivalent understanding solid deep hands-on excellent strong""".split()
)


def jd_body(jd_text: str) -> str:
    """JD without hiring boilerplate: cleaned by the discovery JD cleaner, then benefit / company /
    EEO sections dropped (until the next requirements-type heading)."""
    from app.discovery.jobs.jd_clean import strip_boilerplate

    lines = strip_boilerplate(jd_text or "").splitlines()
    # A short company pitch before the first duties/requirements heading is not about the job.
    first_keep = next((i for i, ln in enumerate(lines) if _KEEP_HEAD.match(ln) and len(ln.split()) <= 6), None)
    if first_keep is not None and sum(1 for ln in lines[:first_keep] if ln.strip()) <= 6:
        lines = lines[first_keep:]
    out: list[str] = []
    skipping = False
    for line in lines:
        if _BOILERPLATE_HEAD.match(line) and len(line.split()) <= 6:
            skipping = True
            continue
        if skipping and _KEEP_HEAD.match(line):
            skipping = False
        if not skipping:
            out.append(line)
    return "\n".join(out)


def _kw_words(text: str) -> list[str]:
    """Lowercase words; hyphenated compounds split unless the compound itself is filler."""
    out: list[str] = []
    for tok in re.findall(r"[a-z][a-z0-9+#]*(?:-[a-z0-9+#]+)*", (text or "").lower()):
        if "-" in tok and tok in _KW_FILLER:
            continue
        out.extend(tok.split("-"))
    return out


def _kw_stem(w: str) -> str:
    """Light stemmer for keyword matching: plurals, -ing/-ed/-ion/-ment, trailing e
    (develop/developed/development, cache/caching, service/services all meet)."""
    for suf in ("ments", "ment", "ings", "ing", "ions", "ion", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            w = w[: -len(suf)]
            break
    return w[:-1] if w.endswith("e") and len(w) > 4 else w


def _without_skills(text: str) -> str:
    """Blank out hard- and soft-skill mentions so they aren't counted again as 'other' keywords."""
    lower = (text or "").lower()
    for aliases in HARD_SKILL_ALIASES.values():
        for a in aliases:
            lower = re.sub(rf"(?<![a-z0-9]){re.escape(a.lower())}(?![a-z0-9])", " ", lower)
    for pat in _SOFT_PATTERNS.values():
        lower = pat.sub(" ", lower)
    return lower


def jd_keywords(jd_text: str, role: str = "", limit: int = 25) -> list[str]:
    """Top recurring JD words (stems), boilerplate and skills removed, most frequent first."""
    from app.ats.text_similarity import ENGLISH_STOP_WORDS

    body = _without_skills(jd_body(jd_text))
    counts: dict[str, int] = {}
    first: dict[str, int] = {}
    for i, w in enumerate(_kw_words(body)):
        if len(w) < 3 or w in STOP or w in ENGLISH_STOP_WORDS or w in _JD_FILLER or w in _KW_FILLER:
            continue
        st = _kw_stem(w)
        counts[st] = counts.get(st, 0) + 1
        first.setdefault(st, i)
    ranked = sorted(counts, key=lambda k: (-counts[k], first[k]))
    return ranked[:limit]


def stem_counts(text: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for w in _kw_words(_without_skills(text)):
        st = _kw_stem(w)
        out[st] = out.get(st, 0) + 1
    return out


def keyword_points(jd_keywords: list[str], resume_text: str, jd_text: str, max_points: float) -> float:
    """SkillSyncer-style frequency points for 'other' keywords, on stems (mirrors frequency_category_points)."""
    if not jd_keywords:
        return float(max_points)
    jd_c, res_c = stem_counts(jd_body(jd_text)), stem_counts(resume_text)
    share = max_points / len(jd_keywords)
    return sum(min(1.0, res_c.get(k, 0) / max(1, jd_c.get(k, 1))) * share for k in jd_keywords)


def resume_stems(resume_text: str) -> set[str]:
    return {_kw_stem(w) for w in _kw_words(resume_text)}


def _tokens(text: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for t in re.findall(r"[a-z][a-z0-9+.#-]{2,}", text.lower()):
        if t in STOP or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def detect_degree_level(text: str) -> int:
    t = text.lower()
    if re.search(r"\b(ph\.?d|doctorate|doctoral)\b", t):
        return 3
    if re.search(r"\b(master'?s?|m\.?s\.?|m\.?eng|mba|m\.?tech|m\.?sc|mca|m\.?e\.)\b", t):
        return 2
    if re.search(r"\b(bachelor'?s?|b\.?s\.?|b\.?a\.?|b\.?eng|undergraduate|b\.?tech|b\.?sc|bca|b\.?e\.|b\.?com)\b", t):
        return 1
    if re.search(r"\bdegree\b", t):
        return 1
    return 0


@dataclass
class ReferenceSignals:
    text_len: int
    has_email: bool
    has_phone: bool
    sections: list[str]
    hard_skills_resume: list[str]
    hard_skills_jd: list[str]
    soft_skills_resume: list[str]
    soft_skills_jd: list[str]
    action_bullets: int
    metric_bullets: int
    title_hit: float
    title_exact: bool
    degree_resume: int
    degree_jd: int
    jd_tokens: list[str]
    resume_tokens: list[str]
    jd_keywords: list[str]  # boilerplate-free, skill-free, stemmed, most frequent first
    resume_stems: set[str]
    stuffing: int
    resume_lower: str
    jd_lower: str


def extract_reference_signals(resume_text: str, jd_text: str = "", role: str = "") -> ReferenceSignals:
    text = resume_text or ""
    lower = text.lower()
    jd_lower = f"{role}\n{jd_body(jd_text) if (jd_text or '').strip() else ''}".lower()
    lines = [l.strip() for l in text.split("\n") if len(l.strip()) >= 24]
    action_re = re.compile(
        r"^(built|developed|designed|implemented|led|owned|created|optimized|improved|"
        r"reduced|increased|launched|shipped|architected|migrated|automated|delivered)\b",
        re.I,
    )
    action_bullets = sum(1 for l in lines if action_re.match(l))
    metric_bullets = sum(
        1 for l in lines if re.search(r"\d+(?:\.\d+)?%|\d+[kKmMbB]\+?|\bp\d{2}\b", l)
    )
    # A heading is a short line naming the section, with up to two qualifiers in front
    # ("Professional Experience", "Technical Skills", "Work History"-style PDF headings).
    sections = [
        s
        for s in ("experience", "education", "skills", "projects", "summary")
        if re.search(rf"^\s*(?:[a-z&/]+\s+){{0,2}}{s}\s*:?\s*$", text, re.I | re.M)
    ]
    hard_resume = _find_hard(text)
    body = jd_body(jd_text) if (jd_text or "").strip() else ""
    hard_jd = _find_hard(f"{role}\n{body}")
    soft_resume = _soft_hits(text)
    soft_jd = _soft_hits(f"{role}\n{body}")
    role_norm = role.strip().lower()
    role_norm = re.sub(r"\s+", " ", role_norm)
    title_exact = len(role_norm) >= 3 and role_norm in lower
    title_tok = [t for t in re.split(r"[^a-z]+", role_norm) if len(t) > 2]
    title_hit = (
        sum(1 for t in title_tok if count_phrase(lower, t) > 0) / len(title_tok) if title_tok else 0.0
    )
    stuffing = 0
    for sid in hard_resume:
        if count_phrase(lower, sid) >= 6:
            stuffing += 1
    degree_resume = detect_degree_level(text)
    degree_jd = detect_degree_level(f"{role}\n{jd_text}")
    return ReferenceSignals(
        text_len=len(text.strip()),
        has_email=bool(re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.I)),
        has_phone=bool(re.search(r"\+?\d[\d\s().-]{7,}\d", text)),
        sections=sections,
        hard_skills_resume=hard_resume,
        hard_skills_jd=hard_jd,
        soft_skills_resume=soft_resume,
        soft_skills_jd=soft_jd,
        action_bullets=action_bullets,
        metric_bullets=metric_bullets,
        title_hit=title_hit,
        title_exact=title_exact,
        degree_resume=degree_resume,
        degree_jd=degree_jd,
        jd_tokens=_tokens(jd_text),
        resume_tokens=_tokens(text),
        jd_keywords=jd_keywords(jd_text, role) if body else [],
        resume_stems=resume_stems(text),
        stuffing=stuffing,
        resume_lower=lower,
        jd_lower=jd_lower,
    )


def clamp(n: float) -> int:
    return max(0, min(100, int(round(n))))


def coverage(a: list[str], b: list[str]) -> float:
    if not b:
        return 0.0
    aset = set(a)
    return sum(1 for x in b if x in aset) / len(b)


def token_coverage(resume: list[str], jd: list[str]) -> float:
    if not jd:
        return 0.0
    rset = set(resume)
    return sum(1 for t in jd if t in rset) / len(jd)


def frequency_category_points(
    terms: list[str],
    resume_lower: str,
    jd_lower: str,
    max_points: float,
    aliases: dict[str, list[str]] | None = None,
    go_counts: tuple[int, int] = (0, 0),
) -> tuple[float, list[str], list[str]]:
    """`go_counts` = (JD, resume) counts of the bare Go language, from the original-case text."""
    unique = list(dict.fromkeys(t.lower() for t in terms))
    if not unique:
        return float(max_points), [], []
    share = max_points / len(unique)
    points = 0.0
    matched: list[str] = []
    missing: list[str] = []
    for term in unique:
        phrases = (aliases or {}).get(term, [term])
        jd_count = max(1, sum(count_phrase(jd_lower, p) for p in phrases))
        resume_count = sum(count_phrase(resume_lower, p) for p in phrases)
        if term == "go" and aliases is not None:  # bare "Go" needs the cased text
            jd_count = max(jd_count, go_counts[0])
            resume_count += go_counts[1]
        if resume_count <= 0:
            missing.append(term)
            continue
        matched.append(term)
        points += min(1.0, resume_count / jd_count) * share
    return points, matched, missing


def skillsyncer_degree_points(resume: int, jd: int) -> int:
    if jd == 0:
        return 10
    if resume == 0:
        return 0
    if resume >= jd:
        return 10
    return 5


# ── Documented-check signals (Rezi / Resume Worded / Jobscan docs) ──────────────────────────────

_BUZZ_FILLER = (
    "responsible for", "team player", "hard working", "hard-working", "detail oriented", "detail-oriented",
    "results-driven", "go-getter", "self-starter", "synergy", "dynamic", "passionate", "motivated",
    "worked on", "helped with", "various", "etc",
)
_PASSIVE_RE = re.compile(r"\b(?:is|are|was|were|been|being)\s+\w+ed\b", re.I)
_PRONOUN_RE = re.compile(r"\b(?:I|me|my)\b")
_FULL_MONTH_DATE = re.compile(
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}\b"
)
_ANY_MONTH_DATE = re.compile(r"\b(?:[A-Z][a-z]{2,8}\.?|\d{1,2}[/-])\s*(?:19|20)\d{2}\b")
_DATE_RANGE = re.compile(
    r"(?:[A-Za-z]{3,9}\.?\s+)?(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:(?:[A-Za-z]{3,9}\.?\s+)?(?:19|20)\d{2}|present|current|now)",
    re.I,
)
_BULLET_MARKER = re.compile(r"^\s*[•\-*▪◦‣]\s+(.*\S)")
_LEADERSHIP_RE = re.compile(
    r"\b(?:led|lead|mentored|managed|grew|scaled|launched|owned|founded|promoted|spearheaded|coached)\b", re.I
)
_CATEGORY_LINE = re.compile(r"^\s*[A-Za-z][A-Za-z /&+.-]{2,28}:\s*\S")


@dataclass
class QualitySignals:
    """Counts behind the checks that Rezi and Resume Worded publicly describe."""

    word_count: int
    bullets: list[str]
    roles: int  # date ranges ≈ roles
    bullets_per_role: float
    avg_bullet_words: float
    pronoun_lines: int
    buzz_hits: int
    passive_hits: int
    leadership_bullets: int
    full_month_dates: int
    other_dates: int
    category_skill_lines: int


_HEADING_LINE = re.compile(r"^\s*(?:[A-Za-z&/]+\s+){0,2}[A-Za-z&/]+\s*:?\s*$")
_EDU_HEAD = re.compile(r"\b(?:education|academics?|certifications?|courses|coursework)\b", re.I)
_SECTION_WORDS = re.compile(
    r"\b(?:experience|employment|work|history|projects?|skills|summary|profile|achievements|awards|"
    r"publications|volunteer|leadership|interests|languages)\b",
    re.I,
)


def _without_education(text: str) -> str:
    """Text minus Education / Certifications blocks, so degree dates aren't counted as jobs."""
    out: list[str] = []
    in_edu = False
    for line in text.splitlines():
        if _HEADING_LINE.match(line) and len(line.split()) <= 3:
            if _EDU_HEAD.search(line):
                in_edu = True
                continue
            if _SECTION_WORDS.search(line):
                in_edu = False
        if not in_edu:
            out.append(line)
    return "\n".join(out)


def extract_quality_signals(text: str) -> QualitySignals:
    lines = [l for l in (text or "").split("\n") if l.strip()]
    bullets = [m.group(1) for l in lines if (m := _BULLET_MARKER.match(l))]
    if not bullets:
        # PDF text often loses bullet glyphs: fall back to sentence-like lines (6+ words, not a header/contact line).
        bullets = [
            l.strip() for l in lines
            if len(l.split()) >= 6 and not l.strip().endswith(":") and "@" not in l and not _DATE_RANGE.search(l)
        ]
    roles = len(_DATE_RANGE.findall(_without_education(text or "")))
    lower = (text or "").lower()
    full = len(_FULL_MONTH_DATE.findall(text or ""))
    other = max(0, len(_ANY_MONTH_DATE.findall(text or "")) - full)
    return QualitySignals(
        word_count=len((text or "").split()),
        bullets=bullets,
        roles=roles,
        bullets_per_role=(len(bullets) / roles) if roles else float(len(bullets)),
        avg_bullet_words=(sum(len(b.split()) for b in bullets) / len(bullets)) if bullets else 0.0,
        pronoun_lines=sum(1 for l in lines if _PRONOUN_RE.search(l)),
        buzz_hits=sum(1 for p in _BUZZ_FILLER if count_phrase(lower, p) > 0),
        passive_hits=len(_PASSIVE_RE.findall(text or "")),
        leadership_bullets=sum(1 for b in bullets if _LEADERSHIP_RE.search(b)),
        full_month_dates=full,
        other_dates=other,
        category_skill_lines=sum(1 for l in lines if _CATEGORY_LINE.match(l) and "," in l),
    )


def hard_skill_frequencies(text: str) -> dict[str, int]:
    """Canonical hard skill → mention count in `text` (Jobscan: frequent hard skills weigh more)."""
    lower = (text or "").lower()
    out: dict[str, int] = {}
    for canonical, aliases in HARD_SKILL_ALIASES.items():
        n = sum(count_phrase(lower, a) for a in aliases) + (go_count(text) if canonical == "go" else 0)
        if n:
            out[canonical] = n
    return out


def pass_rate(checks: list[bool]) -> float:
    """Unweighted share of checks passed — only where the vendor documents it (Resume Worded)."""
    return 100.0 * sum(checks) / len(checks) if checks else 0.0


def weighted_pass(checks: dict[str, bool], weights: dict[str, float], default: float = 1.0) -> float:
    """0–100 share of check *weight* passed; checks missing from `weights` get `default`.
    Keys are matched by prefix so labels can carry dynamic suffixes (e.g. a word-count band)."""

    def w(label: str) -> float:
        for key, val in weights.items():
            if label.startswith(key):
                return val
        return default

    total = sum(w(k) for k in checks)
    return 100.0 * sum(w(k) for k, ok in checks.items() if ok) / total if total else 0.0


# ── Domain keyphrases (non-software JDs) ────────────────────────────────────────────────────────
# Jobscan reports 15+ missing "hard skills" for a mechanical-engineering JD, so its hard-skill list is
# not limited to software tools. When our software taxonomy finds too few skills, the JD's own
# stemmed unigrams/bigrams (frequency-weighted, filler removed) stand in for them.

_JD_FILLER = frozenset(
    """knowledge ability good work works working ensure ensuring provide participate execute maintain
    implement related exposure years year aptitude think box creative innovative necessary meeting target
    targets completed organize notify possible areas improvement information per norms strong excellent
    skills skill experience required preferred responsibilities requirements qualification qualifications
    candidate role team teams company looking seeking join help hands proven plus bonus including
    ability able etc""".split()
)


def _stem(w: str) -> str:
    for suf in ("ing", "ies", "es", "s", "ed", "al", "ion"):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w


def _content_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z][a-z0-9+&]{2,}", (text or "").lower())


def jd_keyphrases(jd_text: str) -> dict[tuple[str, ...], int]:
    """Stemmed unigram/bigram → JD frequency, with stop words and generic JD filler removed."""
    from app.ats.text_similarity import ENGLISH_STOP_WORDS

    toks = _content_tokens(jd_text)
    out: dict[tuple[str, ...], int] = {}
    for i, t in enumerate(toks):
        if t in ENGLISH_STOP_WORDS or t in _JD_FILLER:
            continue
        out[(_stem(t),)] = out.get((_stem(t),), 0) + 1
        if i + 1 < len(toks):
            n = toks[i + 1]
            if n not in ENGLISH_STOP_WORDS and n not in _JD_FILLER:
                key = (_stem(t), _stem(n))
                out[key] = out.get(key, 0) + 1
    return out


def keyphrase_coverage(resume_text: str, phrases: dict[tuple[str, ...], int]) -> tuple[float, list[str]]:
    """Frequency-weighted share of JD keyphrases found in the resume, plus the top missing ones."""
    rs = [_stem(t) for t in _content_tokens(resume_text)]
    uni = set(rs)
    bi = {(rs[i], rs[i + 1]) for i in range(len(rs) - 1)}
    total = hit = 0
    missing: list[tuple[int, str]] = []
    for p, f in phrases.items():
        total += f
        if (p[0] in uni) if len(p) == 1 else (p in bi):
            hit += f
        else:
            missing.append((f, " ".join(p)))
    missing.sort(key=lambda m: (-m[0], m[1]))
    return (hit / total if total else 0.0), [m for _, m in missing[:12]]
