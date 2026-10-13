"""Deterministic rewrite rules. Each returns candidate `Change`s; `service.py` guards them.

Rules only reword, regroup or reorder what is already on the resume:

- bullet: pronoun openers, weak openers ("Responsible for building" → "Built"), weak verbs from a
  fixed safe map ("Made" → "Created"), and -ing openers in past roles ("Developing" → "Developed").
- skills: group the existing skills by category and order them by relevance to the target.
- bullet_order: inside one role, bullets that show target skills move up (none removed).
- section_order: sections follow the role pack's order (contents untouched).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.ats.oss_profiles import SKILL_CATEGORIES
from app.ats.resume_profile import _find_skills
from app.ats.skill_taxonomy import normalize_skill
from app.improve.lexicon import gerund, lemma_of, past, verbs, weak_phrases
from app.improve.structure import BULLET_SECTIONS, Section, StructuredResume, bullet_text_with_continuations


@dataclass
class Change:
    id: str
    kind: str  # bullet | skills | bullet_order | section_order
    section: str
    before: list[str]
    after: list[str]
    rules: list[str]
    reason: str
    target: dict = field(default_factory=dict)  # what to apply: line ids / order


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


def _split_first(text: str) -> tuple[str, str]:
    parts = text.split(None, 1)
    return (parts[0], parts[1] if len(parts) > 1 else "")


def rewrite_bullet(text: str, *, current: bool) -> tuple[str, list[str]]:
    """Reword one bullet. Returns (new text, rule ids applied); unchanged text → no rules."""
    out = text.strip()
    applied: list[str] = []
    lemmas = lemma_of()
    wp = weak_phrases()

    # 1. Pronoun opener ("I built…", "We designed…") — only when a known verb follows.
    first, rest = _split_first(out)
    if first.lower() in wp["pronounOpeners"] and rest:
        nxt, _ = _split_first(rest)
        if nxt.lower().strip(",") in lemmas:
            out = _cap(rest)
            applied.append("pronoun")

    # 2. Weak opening phrases.
    low = out.lower()
    for rule in wp["rules"]:
        pat = rule["pattern"]
        if not re.match(rf"{re.escape(pat)}\b", low):
            continue
        remainder = out[len(pat):].strip()
        if not remainder:
            break
        word, tail = _split_first(remainder)
        w = word.lower().strip(",")
        if rule["action"] == "gerund_to_verb":
            base = lemmas.get(w)
            if base and w == gerund(base):
                out = _cap(f"{past(base)} {tail}".strip())
                applied.append("weak_phrase")
        elif rule["action"] == "contribute":
            out = f"Contributed to {remainder}"
            applied.append("weak_phrase")
        elif rule["action"] == "contribute_verb":
            base = lemmas.get(w)
            if base and w == base:  # "Helped build X" → "Contributed to building X"
                out = f"Contributed to {gerund(base)} {tail}".strip()
                applied.append("weak_phrase")
            elif w in ("with", "to", "in"):
                continue  # handled by a more specific pattern
        break

    # 3. Weak verb opener from the safe map, keeping its tense ("Made" → "Created").
    first, rest = _split_first(out)
    f = first.lower().strip(",")
    base = lemmas.get(f)
    vmap = verbs()["map"]
    if base in vmap and rest:
        new_base = vmap[base]
        forms = verbs()["forms"]
        if f == forms[base]["past"]:
            out = _cap(f"{past(new_base)} {rest}")
            applied.append("weak_verb")
        elif f == base:
            out = _cap(f"{new_base} {rest}")
            applied.append("weak_verb")

    # 4. Tense: an -ing opener in a past role becomes past tense ("Developing" → "Developed").
    if not current:
        first, rest = _split_first(out)
        f = first.lower()
        base = lemmas.get(f)
        if base and f == gerund(base) and rest:
            out = _cap(f"{past(base)} {rest}")
            applied.append("tense")

    return (out, applied) if out != text.strip() else (text, [])


# ---------------------------------------------------------------- skills

_SPLIT_RE = re.compile(r"\s*[,;|•·]\s*")
_LABEL_RE = re.compile(r"^\s*([A-Za-z][A-Za-z /&+.-]{1,30}):\s*")
CATEGORY_ORDER = list(SKILL_CATEGORIES)
_CANON_TO_CATEGORY = {c: cat for cat, items in SKILL_CATEGORIES.items() for c in items}
OTHER = "Other"


def parse_skill_items(lines: list[str]) -> list[str]:
    items: list[str] = []
    for line in lines:
        body = _LABEL_RE.sub("", line)
        items += [i.strip().strip(".") for i in _SPLIT_RE.split(body) if i.strip().strip(".")]
    return items


def regroup_skills(lines: list[str], rank: dict[str, int]) -> tuple[list[str], set[str]] | None:
    """Group + order existing skills; None when there is nothing to do."""
    items = parse_skill_items(lines)
    if len(items) < 3:
        return None
    seen_canon: set[str] = set()
    seen_raw: set[str] = set()
    groups: dict[str, list[tuple[int, int, str]]] = {}
    for idx, item in enumerate(items):
        canon = normalize_skill(item) or next(iter(_find_skills(item)), None)
        key = canon or item.lower()
        if item.lower() in seen_raw or (canon and canon in seen_canon):
            continue
        seen_raw.add(item.lower())
        if canon:
            seen_canon.add(canon)
        cat = _CANON_TO_CATEGORY.get(canon or "", OTHER)
        groups.setdefault(cat, []).append((rank.get(key, 99), idx, item))
    ordered_cats = sorted(
        groups,
        key=lambda c: (
            min(r for r, _, _ in groups[c]),
            CATEGORY_ORDER.index(c) if c in CATEGORY_ORDER else len(CATEGORY_ORDER),
        ),
    )
    out = [f"{cat}: {', '.join(i for _, _, i in sorted(groups[cat]))}" for cat in ordered_cats]
    if out == [ln.strip() for ln in lines]:
        return None
    return out, set(ordered_cats)


# ---------------------------------------------------------------- change generation


def bullet_changes(resume: StructuredResume) -> list[Change]:
    changes: list[Change] = []
    for section in resume.sections:
        if section.key not in BULLET_SECTIONS:
            continue
        for ln in section.lines:
            if ln.kind != "bullet":
                continue
            full, cont_ids = bullet_text_with_continuations(section, ln)
            new, applied = rewrite_bullet(full, current=ln.current)
            if cont_ids and not applied:
                new, applied = full, ["merge_wrapped"]
            elif cont_ids:
                applied.append("merge_wrapped")
            if not applied:
                continue
            changes.append(
                Change(
                    id=f"bullet:{ln.id}",
                    kind="bullet",
                    section=section.key,
                    before=[full],
                    after=[new],
                    rules=applied,
                    reason=_bullet_reason(applied),
                    target={"lineId": ln.id, "contIds": cont_ids},
                )
            )
    return changes


_REASONS = {
    "pronoun": "Drop the pronoun opener",
    "weak_phrase": "Replace a weak opener with what you did",
    "weak_verb": "Use a clearer verb with the same meaning",
    "tense": "Past role: use past tense",
    "merge_wrapped": "Join a bullet split across lines by the PDF",
}


def _bullet_reason(rules: list[str]) -> str:
    return "; ".join(_REASONS[r] for r in rules)


def skills_change(resume: StructuredResume, rank: dict[str, int]) -> Change | None:
    section = resume.section("skills")
    if section is None:
        return None
    lines = [ln.text for ln in section.lines]
    result = regroup_skills(lines, rank)
    if result is None:
        return None
    new_lines, labels = result
    return Change(
        id="skills",
        kind="skills",
        section="skills",
        before=lines,
        after=new_lines,
        rules=["skills_group"],
        reason="Group your skills by type and put the ones this role asks for first",
        target={"labels": sorted(labels)},
    )


def _relevance(text: str, rank: dict[str, int]) -> int:
    return sum(1 for canon in _find_skills(text) if rank.get(canon, 99) <= 3)


def bullet_order_changes(resume: StructuredResume, rank: dict[str, int]) -> list[Change]:
    changes = []
    for section in resume.sections:
        if section.key not in BULLET_SECTIONS:
            continue
        groups: dict[str, list] = {}
        for ln in section.lines:
            if ln.kind == "bullet" and ln.entry_id:
                full, _ = bullet_text_with_continuations(section, ln)
                groups.setdefault(ln.entry_id, []).append((ln.id, full))
        for entry_id, bullets in groups.items():
            if len(bullets) < 2:
                continue
            ordered = sorted(bullets, key=lambda b: -_relevance(b[1], rank))  # stable
            if [b[0] for b in ordered] == [b[0] for b in bullets]:
                continue
            changes.append(
                Change(
                    id=f"order:{entry_id}",
                    kind="bullet_order",
                    section=section.key,
                    before=[b[1] for b in bullets],
                    after=[b[1] for b in ordered],
                    rules=["bullet_order"],
                    reason="Put the bullets that show this role's skills first",
                    target={"entryId": entry_id, "order": [b[0] for b in ordered]},
                )
            )
    return changes


def section_order_change(resume: StructuredResume, order: list[str]) -> Change | None:
    pack = [o.lower() for o in order]
    keys = [s.key for s in resume.sections]
    slots = [i for i, k in enumerate(keys) if k in pack]
    known = sorted((keys[i] for i in slots), key=pack.index)
    new_keys = list(keys)
    for slot, key in zip(slots, known):
        new_keys[slot] = key
    if new_keys == keys or len(set(keys)) != len(keys):
        return None
    headings = {s.key: s.heading for s in resume.sections}
    return Change(
        id="sections",
        kind="section_order",
        section="*",
        before=[headings[k] for k in keys],
        after=[headings[k] for k in new_keys],
        rules=["section_order"],
        reason="Order sections the way recruiters for this role expect",
        target={"order": new_keys},
    )


def apply_changes(resume: StructuredResume, changes: list[Change]) -> StructuredResume:
    out = resume.clone()
    for ch in changes:
        if ch.kind == "bullet":
            for section in out.sections:
                ids = {ln.id for ln in section.lines}
                if ch.target["lineId"] not in ids:
                    continue
                drop = set(ch.target["contIds"])
                for ln in section.lines:
                    if ln.id == ch.target["lineId"]:
                        ln.text = ch.after[0]
                section.lines = [ln for ln in section.lines if ln.id not in drop]
    for ch in changes:
        if ch.kind == "skills":
            section = out.section("skills")
            if section:
                base = section.lines[0].id if section.lines else "skills"
                from app.improve.structure import Line

                section.lines = [
                    Line(f"{base}.{i}", "skills", text) for i, text in enumerate(ch.after)
                ]
    for ch in changes:
        if ch.kind == "bullet_order":
            for section in out.sections:
                _reorder_entry(section, ch.target["entryId"], ch.target["order"])
    for ch in changes:
        if ch.kind == "section_order":
            by_key = {s.key: s for s in out.sections}
            out.sections = [by_key[k] for k in ch.target["order"] if k in by_key]
    return out


def _reorder_entry(section: Section, entry_id: str, order: list[str]) -> None:
    """Move whole bullets (with their continuation lines) into `order` inside one entry."""
    lines = section.lines
    blocks: dict[str, list] = {}
    positions: list[int] = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.kind == "bullet" and ln.entry_id == entry_id:
            block = [ln]
            j = i + 1
            while j < len(lines) and lines[j].kind == "cont":
                block.append(lines[j])
                j += 1
            blocks[ln.id] = block
            positions.append(i)
            i = j
        else:
            i += 1
    if not blocks or set(order) != set(blocks):
        return
    first = positions[0]
    consumed = {id(x) for b in blocks.values() for x in b}
    before = [x for x in lines[:first] if id(x) not in consumed]
    after = [x for x in lines[first:] if id(x) not in consumed]
    section.lines = before + [x for bid in order for x in blocks[bid]] + after
