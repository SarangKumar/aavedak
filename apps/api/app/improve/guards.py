"""Fact-preservation guards.

A change is applied only if it adds nothing factual. For each token class below, the multiset
after a change must equal the multiset before (nothing new, nothing lost, nothing duplicated),
except where a class explicitly allows reordering only. Bullet rewrites may additionally only
add verb forms / "to" and only drop weak-phrase words, and may never add an ownership claim.
"""

from __future__ import annotations

import re
from collections import Counter

from app.ats.resume_profile import _find_skills
from app.improve.lexicon import (
    OWNERSHIP_LEMMAS,
    allowed_new_words,
    lemma_of,
    removable_words,
)

# Unit gap is spaces/tabs only: "\s*" used to swallow the line break after "2025", so merging a
# wrapped line ("2025\n" → "2025 ") looked like one number dropped and another added.
NUMBER_RE = re.compile(r"(?<![A-Za-z])[$₹€£]?\d+(?:[.,]\d+)*[ \t]*(?:%|[kKmMbBxX]\b|\+)?")
MONTH_RE = re.compile(
    r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?=\s|$|,)", re.I
)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
URL_RE = re.compile(r"(?:https?://)?(?:www\.)?[\w-]+(?:\.[\w-]+)+/[\w./?=&%#-]*", re.I)
PHONE_RE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#.&'-]*")


def _month_norm(text: str) -> str:
    return MONTH_RE.sub(lambda m: m.group(0).lower().rstrip(".")[:3], text)


_SEP_RE = re.compile(r"\s+[|·]\s+")


def _sep_norm(text: str) -> str:
    """" | " and " · " between items are the same separator."""
    return _SEP_RE.sub(" | ", text)


def check_separators(before_lines: list[str], after_lines: list[str]) -> list[str]:
    """Separator swap: same lines, each changed only from " | " to " · " between items."""
    if len(before_lines) != len(after_lines):
        return ["changes which lines exist"]
    if any(_sep_norm(b) != _sep_norm(a) for b, a in zip(before_lines, after_lines)):
        return ["changes more than the separators"]
    return []


def _words(text: str) -> list[str]:
    return [w.strip(".,;:'").lower() for w in WORD_RE.findall(text)]


def _entities(text: str) -> Counter:
    """Capitalised words other than the opener, known verb forms and month names (orgs, products,
    places)."""
    out: Counter = Counter()
    for i, w in enumerate(WORD_RE.findall(text)):
        clean = w.strip(".,;:'")
        if i == 0 or not clean[:1].isupper():
            continue
        if clean.lower() in lemma_of():
            continue
        if MONTH_RE.fullmatch(clean):  # dates are checked by the "months" class
            continue
        out[clean] += 1
    return out


def token_classes(text: str) -> dict[str, Counter]:
    t = text or ""
    return {
        "numbers": Counter(re.sub(r"\s", "", m.group(0)).lower() for m in NUMBER_RE.finditer(t)),
        "months": Counter(m.group(0).lower().rstrip(".")[:3] for m in MONTH_RE.finditer(t)),
        "emails": Counter(m.group(0).lower() for m in EMAIL_RE.finditer(t)),
        "urls": Counter(m.group(0).lower() for m in URL_RE.finditer(t)),
        "phones": Counter(re.sub(r"\D", "", m.group(0)) for m in PHONE_RE.finditer(t)),
        "skills": Counter({k: v.count for k, v in _find_skills(t).items()}),
        "entities": _entities(t),
    }


def _class_diffs(before: str, after: str, classes: tuple[str, ...]) -> list[str]:
    b, a = token_classes(before), token_classes(after)
    problems = []
    for cls in classes:
        added = a[cls] - b[cls]
        removed = b[cls] - a[cls]
        if added:
            problems.append(f"adds {cls}: {', '.join(sorted(added))}")
        if removed:
            problems.append(f"drops {cls}: {', '.join(sorted(removed))}")
    return problems


FACT_CLASSES = ("numbers", "months", "emails", "urls", "phones", "skills", "entities")


def check_bullet_rewrite(before: str, after: str) -> list[str]:
    """Problems with rewording one bullet (empty list = safe)."""
    problems = _class_diffs(before, after, FACT_CLASSES)
    bw, aw = Counter(_words(before)), Counter(_words(after))
    added = {w for w in (aw - bw) if w not in allowed_new_words()}
    if added:
        problems.append(f"adds words: {', '.join(sorted(added))}")
    removed = {w for w in (bw - aw) if w not in removable_words()}
    if removed:
        problems.append(f"drops words: {', '.join(sorted(removed))}")
    lemmas = lemma_of()
    bl = Counter(lemmas[w] for w in bw.elements() if w in lemmas)
    al = Counter(lemmas[w] for w in aw.elements() if w in lemmas)
    for lemma in OWNERSHIP_LEMMAS:
        if al[lemma] > bl[lemma]:
            problems.append(f"adds an ownership claim: {lemma}")
    if len(_words(after)) > len(_words(before)) + 2:
        problems.append("makes the bullet longer")
    return problems


def check_same_lines(before: list[str], after: list[str]) -> list[str]:
    """A reorder: exactly the same lines, only the order may differ."""
    return [] if Counter(before) == Counter(after) else ["changes line content, not only order"]


def check_skills_regroup(before_lines: list[str], after_lines: list[str], labels: set[str]) -> list[str]:
    """Skills regrouping: same skills (canonical set), no new raw items, only category labels added."""
    before = "\n".join(before_lines)
    after = "\n".join(after_lines)
    problems = []
    b_sk, a_sk = set(token_classes(before)["skills"]), set(token_classes(after)["skills"])
    if a_sk - b_sk:
        problems.append(f"adds skills: {', '.join(sorted(a_sk - b_sk))}")
    if b_sk - a_sk:
        problems.append(f"drops skills: {', '.join(sorted(b_sk - a_sk))}")
    label_words = {w.lower() for label in labels for w in _words(label)}
    new_words = set(_words(after)) - set(_words(before)) - label_words
    if new_words:
        problems.append(f"adds words: {', '.join(sorted(new_words))}")
    for cls in ("numbers", "emails", "urls"):
        if token_classes(after)[cls] - token_classes(before)[cls]:
            problems.append(f"adds {cls}")
    return problems


def same_except_month_spelling(before: str, after: str) -> bool:
    """True when the texts differ only in how months are spelled ("Jun" vs "June")."""
    return _month_norm(before) == _month_norm(after)


def check_date_format(before_lines: list[str], after_lines: list[str]) -> list[str]:
    """Date spelling: same lines, each changed only by spelling out a month."""
    if len(before_lines) != len(after_lines):
        return ["changes which lines exist"]
    problems = _class_diffs("\n".join(before_lines), "\n".join(after_lines), FACT_CLASSES[:-1])
    if any(not same_except_month_spelling(b, a) for b, a in zip(before_lines, after_lines)):
        problems.append("changes more than the month spelling")
    return problems


def check_document(before: str, after: str, *, header_before: list[str], header_after: list[str],
                   entries_before: list[str], entries_after: list[str],
                   label_words: int = 0) -> list[str]:
    """Whole-resume check after every accepted change is applied.

    `label_words`: words of skill-category labels ("Cloud / DevOps:") the regroup added, which
    are headings, not content, so they don't count toward the 5% growth limit.
    """
    problems = []
    # The header may differ only in separators (the separators rule).
    if [_sep_norm(h) for h in header_before] != [_sep_norm(h) for h in header_after]:
        problems.append("header changed")
    # Role lines may only differ by month spelling (the date_format rule).
    if Counter(_sep_norm(_month_norm(e)) for e in entries_before) != Counter(
        _sep_norm(_month_norm(e)) for e in entries_after
    ):
        problems.append("a role/project line changed")
    # Skills may be de-duplicated by regrouping, so compare their set; everything else exactly.
    problems += _class_diffs(before, after, ("numbers", "months", "emails", "urls", "phones"))
    if set(token_classes(before)["skills"]) != set(token_classes(after)["skills"]):
        problems.append("skill set changed")
    if len(_words(after)) - label_words > len(_words(before)) * 1.05:
        problems.append("word count grew by more than 5%")
    return problems
