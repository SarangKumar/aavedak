"""Evidence strength for skill mentions — rewards context, not stuffing."""

from __future__ import annotations

from app.ats.resume_profile import (
    ResumeProfile,
    SkillMention,
    bullet_has_action,
    bullet_has_metric,
)
from app.ats.skill_taxonomy import related_skills


def evidence_strength(profile: ResumeProfile, canonical: str) -> tuple[float, str, str]:
    """
    Returns (0..1 strength, label, evidence snippet).
    Labels: exact_strong | exact_weak | related | indirect | missing
    """
    mention = profile.skill_mentions.get(canonical)
    if mention:
        return _from_mention(profile, mention)

    # Related technology — partial only
    for rel in related_skills(canonical):
        rel_m = profile.skill_mentions.get(rel)
        if rel_m and rel_m.section in ("experience", "projects"):
            return (
                0.55,
                "related",
                rel_m.context or rel_m.original,
            )
        if rel_m:
            return (0.35, "related", rel_m.context or rel_m.original)

    # Indirect: relational databases language without specific engine
    if canonical in ("postgresql", "mysql") and "relational database" in profile.lower:
        return (0.25, "indirect", "Mentions relational databases (not the specific engine).")

    if canonical == "rest" and ("api" in profile.lower and "http" in profile.lower):
        return (0.3, "indirect", "Mentions APIs / HTTP without explicit REST.")

    return (0.0, "missing", "")


def _from_mention(profile: ResumeProfile, mention: SkillMention) -> tuple[float, str, str]:
    # Find best bullet containing the skill
    best_bullet = ""
    for bullet in profile.bullets:
        if mention.canonical.replace("_", " ") in bullet.lower() or mention.original.lower() in bullet.lower():
            best_bullet = bullet
            break
        # alias tokens
        if any(part and part in bullet.lower() for part in mention.original.lower().split()):
            if len(bullet) > len(best_bullet):
                best_bullet = bullet

    evidence = best_bullet or mention.context or mention.original
    in_experience = mention.section in ("experience", "projects") or bool(best_bullet)
    has_action = bullet_has_action(best_bullet) if best_bullet else False
    has_metric = bullet_has_metric(best_bullet) if best_bullet else False

    if in_experience and has_action and has_metric:
        return (1.0, "exact_strong", evidence)
    if in_experience and has_action:
        return (0.95, "exact_strong", evidence)
    if in_experience:
        return (0.9, "exact_strong", evidence)
    if mention.section == "skills":
        # Skills-only listing is weaker
        strength = 0.7 if mention.count <= 2 else max(0.45, 0.7 - (mention.count - 2) * 0.08)
        return (strength, "exact_weak", evidence)
    return (0.85, "exact_weak", evidence)


def responsibility_match(
    profile: ResumeProfile, responsibility: str
) -> tuple[str, float, str]:
    """Return status matched|partial|missing, score, evidence."""
    tokens = [
        t
        for t in re_tokens(responsibility)
        if len(t) > 3
        and t
        not in {
            "with",
            "from",
            "that",
            "this",
            "your",
            "will",
            "have",
            "into",
            "using",
            "team",
            "work",
        }
    ]
    if not tokens:
        return ("missing", 0.0, "")

    best_score = 0.0
    best_ev = ""
    for bullet in profile.bullets:
        bl = bullet.lower()
        hits = sum(1 for t in tokens if t in bl)
        ratio = hits / len(tokens)
        if ratio > best_score:
            best_score = ratio
            best_ev = bullet

    # Also check full text lightly
    if best_score < 0.35:
        hits = sum(1 for t in tokens if t in profile.lower)
        best_score = max(best_score, hits / len(tokens) * 0.7)

    if best_score >= 0.55:
        return ("matched", min(1.0, best_score), best_ev)
    if best_score >= 0.3:
        return ("partial", best_score, best_ev)
    return ("missing", 0.0, "")


def re_tokens(text: str) -> list[str]:
    import re

    return re.findall(r"[a-z][a-z0-9+.#-]{2,}", (text or "").lower())


def title_similarity(a: str, b: str) -> float:
    import re

    def norm(s: str) -> set[str]:
        s = (s or "").lower()
        s = s.replace("sde", "software engineer").replace("swe", "software engineer")
        s = s.replace("front-end", "frontend").replace("back-end", "backend")
        s = s.replace("full-stack", "fullstack").replace("full stack", "fullstack")
        tokens = set(re.findall(r"[a-z]{2,}", s))
        stop = {"the", "and", "for", "with", "role", "job", "position", "senior", "junior", "i"}
        return {t for t in tokens if t not in stop}

    ta, tb = norm(a), norm(b)
    if not ta or not tb:
        return 0.0
    if ta == tb:
        return 1.0
    inter = len(ta & tb)
    union = len(ta | tb)
    jaccard = inter / union if union else 0.0
    # boost if engineer/developer family overlaps
    family = {"engineer", "developer", "sde", "swe"}
    if (ta & family) and (tb & family):
        jaccard = min(1.0, jaccard + 0.25)
    return jaccard
