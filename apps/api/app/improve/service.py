"""Improve a resume and score original vs revised with one identical scoring request."""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict

from app.ats.analyze import detect_mode
from app.ats.engine_runner import VALID_ENGINES, run_engine_staged
from app.ats.pipeline import EngineFailure
from app.ats.resume_profile import bullet_has_metric
from app.ats.version import ENGINE_VERSION
from app.improve import guards
from app.improve.alignment import align, relevance_rank, role_pack
from app.improve.lexicon import weak_phrases
from app.improve.rules import (
    Change,
    apply_changes,
    bullet_changes,
    bullet_order_changes,
    section_order_change,
    skills_change,
)
from app.improve.structure import BULLET_SECTIONS, StructuredResume, parse, render, to_json

IMPROVER_VERSION = "1.0"


def _guard(change: Change) -> list[str]:
    if change.kind == "bullet":
        return guards.check_bullet_rewrite(change.before[0], change.after[0])
    if change.kind == "skills":
        return guards.check_skills_regroup(change.before, change.after, set(change.target["labels"]))
    return guards.check_same_lines(change.before, change.after)


def candidate_changes(resume: StructuredResume, role: str, jd_text: str,
                      years_experience: float | None) -> tuple[list[Change], list[dict]]:
    rank = relevance_rank(role, jd_text)
    pack = role_pack(role)
    entry_level = years_experience is not None and years_experience < pack["experiencedFromYears"]
    order = pack["sectionOrderEntryLevel" if entry_level else "sectionOrderExperienced"]
    found: list[Change] = [*bullet_changes(resume)]
    sk = skills_change(resume, rank)
    if sk:
        found.append(sk)
    found += bullet_order_changes(resume, rank)
    so = section_order_change(resume, order)
    if so:
        found.append(so)
    valid, rejected = [], []
    for ch in found:
        problems = _guard(ch)
        if problems:
            rejected.append({**_change_json(ch, accepted=False), "problems": problems})
        else:
            valid.append(ch)
    return valid, rejected


def _change_json(ch: Change, *, accepted: bool) -> dict:
    d = asdict(ch)
    d["accepted"] = accepted
    return d


def suggestions(resume: StructuredResume, role: str) -> list[dict]:
    """Things only the user can fix (never applied automatically)."""
    out: list[dict] = []
    hedges = weak_phrases()["hedges"]
    for section in resume.sections:
        if section.key not in BULLET_SECTIONS:
            continue
        for ln in section.lines:
            if ln.kind != "bullet":
                continue
            low = ln.text.lower()
            if not bullet_has_metric(ln.text):
                out.append({"lineId": ln.id, "kind": "no_result", "text": ln.text,
                            "message": "Add the result if you know it (how much, how many, how fast). Don't estimate."})
            for h in hedges:
                if re.search(rf"\b{re.escape(h)}\b", low):
                    out.append({"lineId": ln.id, "kind": "hedge", "text": ln.text,
                                "message": f"“{h}” undersells. If you've actually used it, say what you did with it."})
            if len(ln.text.split()) > 35:
                out.append({"lineId": ln.id, "kind": "long", "text": ln.text,
                            "message": "Over 35 words. Consider splitting it into two bullets."})
    for prompt in role_pack(role)["evidencePrompts"]:
        out.append({"lineId": None, "kind": "role_prompt", "text": "", "message": prompt})
    return out


def improve(resume_text: str, *, role: str = "", jd_text: str = "",
            years_experience: float | None = None, accepted: list[str] | None = None) -> dict:
    """Deterministic: the same inputs always give the same changes and revised text."""
    resume = parse(resume_text)
    original_text = render(resume)
    valid, rejected = candidate_changes(resume, role, jd_text, years_experience)
    chosen = valid if accepted is None else [c for c in valid if c.id in set(accepted)]
    revised = apply_changes(resume, chosen)
    revised_text = render(revised)

    doc_problems = guards.check_document(
        original_text, revised_text,
        header_before=[ln.text for ln in resume.header],
        header_after=[ln.text for ln in revised.header],
        entries_before=[ln.text for ln in resume.all_lines() if ln.kind == "entry"],
        entries_after=[ln.text for ln in revised.all_lines() if ln.kind == "entry"],
        label_words=sum(
            len(guards._words(label)) for c in chosen if c.kind == "skills" for label in c.target["labels"]
        ),
    )
    if doc_problems:  # never ship a document that fails the whole-resume check
        revised, revised_text, chosen = resume, original_text, []
    chosen_ids = {c.id for c in chosen}
    pack = role_pack(role)
    return {
        "improverVersion": IMPROVER_VERSION,
        "originalText": original_text,
        "revisedText": revised_text,
        "revised": to_json(revised),
        "changes": [_change_json(c, accepted=c.id in chosen_ids) for c in valid],
        "rejected": rejected,
        "documentProblems": doc_problems,
        "alignment": align(resume, role, jd_text),
        "suggestions": suggestions(resume, role),
        "rolePack": {"key": pack["roleKey"], "label": pack["label"], "matched": pack["matched"]},
        "structureConfidence": _confidence(resume),
    }


def _confidence(resume: StructuredResume) -> str:
    keys = {s.key for s in resume.sections}
    bullets = sum(1 for ln in resume.all_lines() if ln.kind == "bullet")
    if {"experience", "skills"} <= keys and bullets >= 3:
        return "high"
    return "medium" if keys and bullets else "low"


# ---------------------------------------------------------------- scoring

DEFAULT_ENGINES = tuple(sorted(VALID_ENGINES))


def scoring_request(*, role: str, jd_text: str, years_experience: float | None) -> dict:
    """The exact inputs used for both texts. Only `resume_text` differs between the two runs."""
    return {
        "role": role or "",
        "jd_text": jd_text or "",
        "mode": detect_mode(role, jd_text),
        "years_experience": years_experience,
    }


def score_text(text: str, request: dict, engines: tuple[str, ...]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for engine_id in engines:
        try:
            res = run_engine_staged(engine_id=engine_id, resume_text=text, resume_id="improver", **request)
        except EngineFailure as failure:
            out[engine_id] = {"ok": False, "failureKind": failure.kind, "message": failure.message}
            continue
        out[engine_id] = {
            "ok": True,
            "score": res.get("overallScore"),
            "scoreType": res.get("scoreType") or res.get("scoreName"),
            "engineVersion": res.get("engineVersion") or ENGINE_VERSION,
            "breakdown": [
                {"key": b.get("key"), "label": b.get("label"), "score": b.get("score")}
                for b in (res.get("breakdown") or [])
            ] if engine_id == "aavedak" else [],
        }
    return out


def score_pair(original_text: str, revised_text: str, *, role: str, jd_text: str,
               years_experience: float | None, engines: tuple[str, ...] = DEFAULT_ENGINES) -> dict:
    request = scoring_request(role=role, jd_text=jd_text, years_experience=years_experience)
    before = score_text(original_text, request, engines)
    after = score_text(revised_text, request, engines)
    snapshot = {
        "engineVersion": ENGINE_VERSION,
        "improverVersion": IMPROVER_VERSION,
        "mode": request["mode"],
        "role": request["role"],
        "yearsExperience": years_experience,
        "jdHash": hashlib.sha256(request["jd_text"].encode()).hexdigest()[:16],
        "engines": list(engines),
        "engineVersions": {e: before[e].get("engineVersion") for e in engines if before[e]["ok"]},
    }
    return {"snapshot": snapshot, "before": before, "after": after}
