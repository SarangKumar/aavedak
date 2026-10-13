"""Pure helpers: seniority / department from a job title, and whether a string looks like a
real person's name (so headings like "Our Team" never become people)."""

from __future__ import annotations

import re
import unicodedata

_SENIORITY: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("c_level", re.compile(r"\b(ceo|cto|cfo|coo|cpo|cmo|ciso|chief|founder|co-?founder|president|managing director)\b", re.I)),
    ("vp", re.compile(r"\b(vp|svp|evp|vice[- ]president)\b", re.I)),
    ("director", re.compile(r"\b(director|head of|head,|\bhead\b)", re.I)),
    ("manager", re.compile(r"\b(manager|lead|leader|supervisor)\b", re.I)),
    ("senior", re.compile(r"\b(senior|sr\.?|staff|principal|architect)\b", re.I)),
    ("entry", re.compile(r"\b(junior|jr\.?|intern|trainee|graduate|associate|fresher)\b", re.I)),
)

_DEPARTMENT: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("recruiting", re.compile(r"recruit|talent|\bhr\b|human resources|people (ops|operations|partner)|hiring", re.I)),
    ("leadership", re.compile(r"\b(ceo|founder|co-?founder|chief executive|president|managing director)\b", re.I)),
    ("data", re.compile(r"\bdata\b|machine learning|\bml\b|\bai\b|analytics|scientist", re.I)),
    ("engineering", re.compile(r"engineer|developer|software|\bsre\b|devops|\bcto\b|architect|tech(nical|nology)? lead|programmer|\bqa\b", re.I)),
    ("product", re.compile(r"\bproduct\b|\bcpo\b", re.I)),
    ("design", re.compile(r"design|\bux\b|\bui\b", re.I)),
    ("sales", re.compile(r"sales|account (executive|manager)|business development|\bbd\b|partnerships", re.I)),
    ("marketing", re.compile(r"marketing|growth|brand|content|\bcmo\b|communications", re.I)),
    ("finance", re.compile(r"financ|\bcfo\b|account(ant|ing)|controller", re.I)),
    ("legal", re.compile(r"legal|counsel|compliance", re.I)),
    ("support", re.compile(r"customer success|support|customer experience", re.I)),
    ("operations", re.compile(r"operations|\bcoo\b|\bops\b|admin", re.I)),
)

ROLE_WORDS = re.compile(
    r"\b(ceo|cto|cfo|coo|cpo|cmo|chief|founder|co-?founder|president|director|head|vp|vice president|"
    r"manager|lead|engineer|developer|recruit\w*|talent|designer|scientist|analyst|architect|partner|"
    r"officer|specialist|consultant|executive|associate|intern|product|marketing|sales|hr|operations)\b",
    re.I,
)

_NOT_NAME = re.compile(
    r"\b(team|our|the|about|careers?|jobs?|contact|privacy|terms|cookie|policy|company|products?|"
    r"services?|solutions?|blog|news|press|investors?|leadership|management|board|meet|join|us|we|"
    r"read|more|view|learn|home|menu|login|sign|india|limited|ltd|inc|llc|pvt|private|technologies|"
    r"group|global|office|offices|values|mission|story|culture|customers?|partners?|platform|"
    r"meetup|event|events|conference|summit|webinar|workshop|podcast|day|week|devops|cloud|labs?)\b",
    re.I,
)
_NAME_TOKEN = re.compile(r"^[A-Z][a-zA-Z'\-]*\.?$|^[A-Z]\.$")


def seniority(title: str | None) -> str | None:
    if not title:
        return None
    for label, pattern in _SENIORITY:
        if pattern.search(title):
            return label
    return "individual"


def department(title: str | None) -> str | None:
    if not title:
        return None
    for label, pattern in _DEPARTMENT:
        if pattern.search(title):
            return label
    return None


def ascii_fold(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def clean_name(value: str | None) -> str | None:
    """A plausible person's name (2–4 capitalised words), tidied; else None. Pure."""
    if not value:
        return None
    text = re.sub(r"\s+", " ", value).strip(" ,|-–—:·")
    text = re.sub(r"\s*\((he|she|they)/\w+\)$", "", text, flags=re.I)
    text = re.sub(r",?\s+(ph\.?d|mba|cpa)\.?$", "", text, flags=re.I)
    if not 4 <= len(text) <= 60 or any(ch.isdigit() for ch in text) or "@" in text:
        return None
    if _NOT_NAME.search(text) or ROLE_WORDS.search(text):
        return None
    tokens = ascii_fold(text).split(" ")
    if not 2 <= len(tokens) <= 4:
        return None
    if text.isupper():  # "OM SHEGOKAR" → "Om Shegokar"
        text = " ".join(t.capitalize() for t in text.split(" "))
        tokens = ascii_fold(text).split(" ")
    if not all(_NAME_TOKEN.match(t) for t in tokens):
        return None
    if any(len(t) >= 3 and t.isupper() for t in tokens):
        return None  # acronyms: "ACCU Bristol", "JJUC Meetup Tokyo"
    return text


def looks_like_title(value: str | None) -> bool:
    """A short role line ("Head of Talent", "Co-founder & CTO"), not markup or a sentence."""
    if not value or len(value) > 90 or len(value.split()) > 12:
        return False
    if any(ch in value for ch in "<>{}=。") or value.rstrip().endswith((".", "!", "?")):
        return False
    if sum(1 for ch in value if ord(ch) > 0x2FF) > 3:
        return False
    return bool(ROLE_WORDS.search(value))
