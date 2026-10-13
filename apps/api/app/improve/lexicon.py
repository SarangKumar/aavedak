"""Word lists for the rules and guards, loaded once from `data/`."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "data"


@lru_cache(maxsize=1)
def verbs() -> dict:
    return json.loads((DATA / "verbs.json").read_text())


@lru_cache(maxsize=1)
def weak_phrases() -> dict:
    return json.loads((DATA / "weak_phrases.json").read_text())


@lru_cache(maxsize=1)
def lemma_of() -> dict[str, str]:
    """Every known form ("built", "building", "builds", "build") → its base verb."""
    out: dict[str, str] = {}
    for base, f in verbs()["forms"].items():
        for form in (base, f["past"], f["gerund"], f["present3"]):
            out.setdefault(form, base)
    return out


def past(base: str) -> str:
    return verbs()["forms"][base]["past"]


def gerund(base: str) -> str:
    return verbs()["forms"][base]["gerund"]


# Claims of ownership or leadership a rule must never introduce.
OWNERSHIP_LEMMAS = frozenset(
    {"lead", "own", "architect", "found", "spearhead", "head", "direct", "mentor", "manage"}
)


@lru_cache(maxsize=1)
def allowed_new_words() -> frozenset[str]:
    """Words a bullet rewrite may add: verb forms, plus the connective of "contributed to"."""
    return frozenset(lemma_of()) | {"to"}


@lru_cache(maxsize=1)
def removable_words() -> frozenset[str]:
    """Words a bullet rewrite may drop: weak-phrase words, pronoun openers, verb forms."""
    words: set[str] = set(lemma_of())
    for rule in weak_phrases()["rules"]:
        words.update(rule["pattern"].split())
    words.update(weak_phrases()["pronounOpeners"])
    return frozenset(words)
