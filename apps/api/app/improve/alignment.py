"""Target requirements (JD or role pack) ↔ evidence already on the resume.

Each requirement is `supported` (shown in experience/projects/summary), `skills_only` (only in
the Skills list) or `missing`. Missing ones are gaps for the user — never written into the resume.
"""

from __future__ import annotations

import json
from functools import lru_cache

from app.ats.jd_profile import parse_jd
from app.ats.resume_profile import _find_skills
from app.ats.skill_taxonomy import ROLE_PROFILES, display_name, infer_role_key
from app.improve.lexicon import DATA
from app.improve.structure import StructuredResume

EVIDENCE_SECTIONS = frozenset({"experience", "projects", "summary"})


@lru_cache(maxsize=16)
def role_pack(role: str) -> dict:
    key = infer_role_key(role or "") or "generic"
    path = DATA / "role_guidance" / f"{key.replace(' ', '_')}.json"
    if not path.exists():
        path = DATA / "role_guidance" / "generic.json"
    pack = json.loads(path.read_text())
    pack["matched"] = key != "generic" and pack["roleKey"] == key
    return pack


def requirements(role: str, jd_text: str) -> list[dict]:
    """[{skill, label, importance}] — JD required/preferred, else the role profile's skills."""
    out: list[dict] = []
    seen: set[str] = set()
    if (jd_text or "").strip():
        jd = parse_jd(jd_text, role)
        for kind, reqs in (("required", jd.required), ("preferred", jd.preferred)):
            for r in reqs:
                if r.canonical and r.canonical not in seen:
                    seen.add(r.canonical)
                    out.append({"skill": r.canonical, "importance": kind})
        return out
    key = infer_role_key(role or "")
    if not key:
        return out
    for bucket in ("core", "common"):
        for canon in ROLE_PROFILES[key].get(bucket, ()):
            if canon not in seen:
                seen.add(canon)
                out.append({"skill": canon, "importance": "core" if bucket == "core" else "common"})
    return out


def relevance_rank(role: str, jd_text: str) -> dict[str, int]:
    """Lower = more relevant. Used only to order what the resume already has."""
    order = {"required": 0, "preferred": 1, "core": 2, "common": 3}
    rank = {r["skill"]: order[r["importance"]] for r in requirements(role, jd_text)}
    key = infer_role_key(role or "")
    if key:
        for canon in ROLE_PROFILES[key].get("optional", ()):
            rank.setdefault(canon, 4)
    return rank


def align(resume: StructuredResume, role: str, jd_text: str) -> dict:
    evidence: dict[str, list[dict]] = {}
    for section in resume.sections:
        for ln in section.lines:
            for canon in _find_skills(ln.text):
                evidence.setdefault(canon, []).append(
                    {"lineId": ln.id, "section": section.key, "text": ln.text[:160]}
                )
    items = []
    for req in requirements(role, jd_text):
        spans = evidence.get(req["skill"], [])
        in_work = [s for s in spans if s["section"] in EVIDENCE_SECTIONS]
        status = "supported" if in_work else ("skills_only" if spans else "missing")
        items.append(
            {
                "skill": req["skill"],
                "label": display_name(req["skill"]),
                "importance": req["importance"],
                "status": status,
                "evidence": (in_work or spans)[:3],
            }
        )
    return {
        "source": "jd" if (jd_text or "").strip() else "role",
        "items": items,
        "supported": [i for i in items if i["status"] == "supported"],
        "skillsOnly": [i for i in items if i["status"] == "skills_only"],
        "missing": [i for i in items if i["status"] == "missing"],
    }
