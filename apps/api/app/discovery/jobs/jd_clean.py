"""Strip non-JD boilerplate (privacy/cookie notices, EEO statements, data-protection and
fraud warnings, legal footers, navigation) from plain-text job descriptions.

Patterns live in `data/jd/boilerplate.json` at the repo root, shared with the web app
(`apps/web/lib/jd-clean.ts`), which applies the same rules. Sections are dropped by heading;
stray boilerplate sentences are dropped by phrase. Content sections (responsibilities,
requirements, qualifications, skills, benefits, about the role) are kept. If cleaning would
leave almost nothing, the original text is returned. Fail-safe: without the patterns file
the text is returned unchanged.
"""

from __future__ import annotations

import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

DATA_PATH = Path(__file__).resolve().parents[5] / "data" / "jd" / "boilerplate.json"

_BULLET = re.compile(r"^[\s•\-*–·#>]+")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\"'“])")
_MULTI_BLANK = re.compile(r"\n\s*\n\s*\n+")


@lru_cache(maxsize=1)
def _rules():
    path = Path(os.environ.get("JD_BOILERPLATE_PATH") or DATA_PATH)
    if not path.is_file():
        log.warning("JD boilerplate patterns not found; descriptions are stored as parsed")
        return None
    data = json.loads(path.read_text(encoding="utf-8"))

    def full(items: list[str]) -> re.Pattern[str]:
        return re.compile(r"^(?:" + "|".join(f"(?:{p})" for p in items) + r")$", re.I)

    return {
        "drop_heading": full(data["dropHeadings"]),
        "keep_heading": full(data["keepHeadings"]),
        "nav": full(data["navLines"]),
        "drop_para": re.compile("|".join(f"(?:{p})" for p in data["dropParagraphs"]), re.I),
        "min_ratio": float(data["minKeepRatio"]),
        "min_chars": int(data["minKeepChars"]),
    }


def _norm(line: str) -> str:
    return _BULLET.sub("", line).strip().rstrip(":").strip().lower()


def _looks_like_heading(line: str) -> bool:
    raw = _BULLET.sub("", line).strip()
    if not raw or len(raw) > 60 or len(raw.split()) > 8:
        return False
    if raw.endswith(":"):
        return True
    if raw[-1] in ".,;!?":
        return False
    letters = [w for w in raw.split() if w[:1].isalpha()]
    if not letters:
        return False
    if raw.isupper():
        return True
    caps = sum(1 for w in letters if w[:1].isupper())
    return caps / len(letters) >= 0.6 and len(letters) <= 6


def strip_boilerplate(text: str | None) -> str:
    """Cleaned description (or the input unchanged when nothing applies)."""
    original = text or ""
    rules = _rules()
    if not rules or not original.strip():
        return original
    out: list[str] = []
    dropping = False
    for line in original.splitlines():
        stripped = line.strip()
        if not stripped:
            if not dropping:
                out.append("")
            continue
        key = _norm(stripped)
        if len(key) <= 60 and rules["nav"].match(key):
            continue
        if len(key) <= 80 and rules["drop_heading"].match(key):
            dropping = True
            continue
        if rules["keep_heading"].match(key) or _looks_like_heading(stripped):
            dropping = False
            out.append(line)
            continue
        if dropping:
            continue
        if rules["drop_para"].search(stripped):
            prefix = line[: len(line) - len(line.lstrip())]
            kept = [s for s in _SENTENCE_SPLIT.split(stripped) if not rules["drop_para"].search(s)]
            if not kept:
                continue
            line = prefix + " ".join(kept)
        out.append(line)
    cleaned = _MULTI_BLANK.sub("\n\n", "\n".join(out)).strip()
    if len(original) >= rules["min_chars"] and len(cleaned) < rules["min_chars"]:
        return original
    if len(cleaned) < rules["min_ratio"] * len(original) and len(cleaned) < 1000:
        return original
    return cleaned
