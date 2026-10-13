"""Resume text → structured lines, and back to canonical text.

The structure only labels lines; it never rewrites them. `render(parse(text))` is the canonical
form of a resume, used for the "before" score so the before/after delta measures the rules and
not whitespace differences from PDF extraction.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field

from app.ats.resume_profile import SECTION_ALIASES

# Headings beyond the ATS engine's five; recognised so their content is left alone.
EXTRA_SECTIONS: dict[str, tuple[str, ...]] = {
    "certifications": ("certifications", "certificates", "licenses & certifications"),
    "achievements": ("achievements", "awards", "honors", "honours", "awards & achievements"),
    "publications": ("publications",),
    "languages": ("languages",),
    "interests": ("interests", "hobbies"),
    "volunteering": ("volunteering", "volunteer experience"),
    "leadership": ("leadership", "activities", "extracurricular activities"),
}

ALL_SECTIONS: dict[str, tuple[str, ...]] = {**SECTION_ALIASES, **EXTRA_SECTIONS}
# Sections whose bullets the rules may reword. Everything else is copied verbatim.
BULLET_SECTIONS = frozenset({"experience", "projects"})

_GLYPH_RE = re.compile(r"^(\s*(?:[•\-*●◦▪‣–]|\d{1,2}[.)])\s+)")
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_CURRENT_RE = re.compile(r"\b(?:present|current|now|ongoing)\b", re.I)
_RANGE_HINT_RE = re.compile(r"[–—-]|\bto\b", re.I)


@dataclass
class Line:
    id: str
    kind: str  # header | entry | bullet | cont | skills | text
    text: str
    glyph: str = ""  # original bullet prefix incl. trailing space, kept on render
    entry_id: str | None = None  # bullets/cont: the entry they belong to
    current: bool = False  # entry/bullet: under a "– Present" role


@dataclass
class Section:
    key: str  # experience | skills | … | other
    heading: str  # the original heading line, verbatim
    lines: list[Line] = field(default_factory=list)


@dataclass
class StructuredResume:
    header: list[Line] = field(default_factory=list)
    sections: list[Section] = field(default_factory=list)

    def all_lines(self) -> list[Line]:
        return [*self.header, *(ln for s in self.sections for ln in s.lines)]

    def line(self, line_id: str) -> Line | None:
        return next((ln for ln in self.all_lines() if ln.id == line_id), None)

    def section(self, key: str) -> Section | None:
        return next((s for s in self.sections if s.key == key), None)

    def clone(self) -> "StructuredResume":
        return copy.deepcopy(self)


def heading_key(line: str) -> str | None:
    """Section key when the whole line is a heading ("EXPERIENCE", "Technical Skills:")."""
    t = re.sub(r"[\s:]+$", "", line.strip()).lower()
    if not t or len(t) > 40:
        return None
    for key, aliases in ALL_SECTIONS.items():
        if t in aliases:
            return key
    return None


def _is_entry_header(text: str) -> bool:
    """A role/project line with dates ("Backend Engineer, Acme — Jan 2021 – Present")."""
    if len(text) > 140 or text.endswith("."):
        return False
    has_date = bool(_YEAR_RE.search(text)) and (
        bool(_RANGE_HINT_RE.search(text)) or bool(_CURRENT_RE.search(text))
    )
    return has_date or bool(_CURRENT_RE.search(text) and _YEAR_RE.search(text))


def parse(text: str) -> StructuredResume:
    resume = StructuredResume()
    current: Section | None = None
    entry: Line | None = None
    n = 0
    for raw in (text or "").splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        n += 1
        lid = f"l{n}"
        key = heading_key(line)
        if key:
            current = Section(key=key, heading=line.strip())
            resume.sections.append(current)
            entry = None
            continue
        if current is None:
            resume.header.append(Line(lid, "header", line.strip()))
            continue
        if current.key == "skills":
            current.lines.append(Line(lid, "skills", line.strip()))
            continue
        if current.key not in BULLET_SECTIONS:
            current.lines.append(Line(lid, "text", line.strip()))
            continue
        m = _GLYPH_RE.match(line)
        glyph = m.group(1).strip() + " " if m else ""
        body = line[m.end():].strip() if m else line.strip()
        if not m and _is_entry_header(body):
            entry = Line(lid, "entry", body, current=bool(_CURRENT_RE.search(body)))
            current.lines.append(entry)
            continue
        prev = current.lines[-1] if current.lines else None
        # PDF wraps: an unglyphed line that starts lowercase continues the previous bullet.
        if not m and prev is not None and prev.kind in ("bullet", "cont") and body[:1].islower():
            current.lines.append(
                Line(lid, "cont", body, entry_id=prev.entry_id, current=prev.current)
            )
            continue
        current.lines.append(
            Line(
                lid,
                "bullet",
                body,
                glyph=glyph,
                entry_id=entry.id if entry else None,
                current=entry.current if entry else False,
            )
        )
    return resume


def render(resume: StructuredResume) -> str:
    """Canonical text: header, then each section (heading + lines), one blank line between."""
    out: list[str] = [ln.text for ln in resume.header]
    for section in resume.sections:
        if out:
            out.append("")
        out.append(section.heading)
        for ln in section.lines:
            out.append(f"{ln.glyph}{ln.text}" if ln.kind == "bullet" else ln.text)
    return "\n".join(out).strip() + "\n"


def bullet_text_with_continuations(section: Section, bullet: Line) -> tuple[str, list[str]]:
    """The full text of a bullet whose PDF line-wraps became `cont` lines, and those line ids."""
    idx = section.lines.index(bullet)
    parts, ids = [bullet.text], []
    for ln in section.lines[idx + 1 :]:
        if ln.kind != "cont":
            break
        parts.append(ln.text)
        ids.append(ln.id)
    return " ".join(parts), ids


def to_json(resume: StructuredResume) -> dict:
    return {
        "header": [ln.text for ln in resume.header],
        "sections": [
            {
                "key": s.key,
                "heading": s.heading,
                "lines": [
                    {"id": ln.id, "kind": ln.kind, "text": ln.text, "glyph": ln.glyph.strip()}
                    for ln in s.lines
                ],
            }
            for s in resume.sections
        ],
    }
