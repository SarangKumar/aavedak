"""Evidence strength for skill mentions — rewards context, not stuffing."""

from __future__ import annotations

from app.ats.resume_profile import (
    ResumeProfile,
    SkillMention,
    bullet_has_action,
    bullet_has_metric,
)
from app.ats.skill_taxonomy import ALIAS_TO_CANONICAL, related_skills


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
                0.5,
                "related",
                rel_m.context or rel_m.original,
            )
        if rel_m:
            return (0.28, "related", rel_m.context or rel_m.original)

    # Indirect: relational databases language without specific engine
    if canonical in ("postgresql", "mysql") and "relational database" in profile.lower:
        return (0.22, "indirect", "Mentions relational databases (not the specific engine).")

    if canonical == "rest" and ("api" in profile.lower and "http" in profile.lower):
        return (0.28, "indirect", "Mentions APIs / HTTP without explicit REST.")

    return (0.0, "missing", "")


def _from_mention(profile: ResumeProfile, mention: SkillMention) -> tuple[float, str, str]:
    # Find best bullet containing the skill (canonical or original alias)
    needles = {
        mention.canonical.replace("_", " "),
        mention.original.lower(),
    }
    for alias, can in ALIAS_TO_CANONICAL.items():
        if can == mention.canonical and len(alias) >= 3:
            needles.add(alias)

    best_bullet = ""
    best_score = 0
    for bullet in profile.bullets:
        bl = bullet.lower()
        if not any(n and n in bl for n in needles):
            continue
        rank = 1
        if bullet_has_action(bullet):
            rank += 1
        if bullet_has_metric(bullet):
            rank += 1
        if rank > best_score or (rank == best_score and len(bullet) > len(best_bullet)):
            best_score = rank
            best_bullet = bullet

    evidence = best_bullet or mention.context or mention.original
    has_action = bullet_has_action(best_bullet) if best_bullet else False
    has_metric = bullet_has_metric(best_bullet) if best_bullet else False
    # Skills-section listings must never become "experience" just because the
    # whole skills line was extracted as a long bullet.
    in_experience = mention.section in ("experience", "projects")
    if (
        not in_experience
        and best_bullet
        and has_action
        and mention.section not in ("skills", "education")
    ):
        in_experience = True

    # Experience + action + metric is the only path to a perfect hit.
    if in_experience and has_action and has_metric:
        return (1.0, "exact_strong", evidence)
    if in_experience and has_action:
        return (0.92, "exact_strong", evidence)
    if in_experience:
        return (0.85, "exact_strong", evidence)

    # Skills-only / summary listings are partial credit — not a match.
    if mention.section == "skills":
        if mention.count >= 5:
            return (0.25, "exact_weak", evidence)
        if mention.count >= 3:
            return (0.35, "exact_weak", evidence)
        return (0.45, "exact_weak", evidence)

    if mention.section == "summary":
        return (0.5, "exact_weak", evidence)

    return (0.55, "exact_weak", evidence)


_RESP_STOP = frozenset(
    {
        "with",
        "from",
        "that",
        "this",
        "your",
        "will",
        "have",
        "into",
        "using",
        "used",
        "team",
        "work",
        "role",
        "able",
        "must",
        "should",
        "across",
        "including",
        "such",
        "other",
        "their",
        "about",
        "within",
    }
)


def responsibility_match(
    profile: ResumeProfile, responsibility: str
) -> tuple[str, float, str]:
    """Return status matched|partial|missing, score, evidence."""
    tokens = [t for t in re_tokens(responsibility) if len(t) > 3 and t not in _RESP_STOP]
    if not tokens:
        return ("missing", 0.0, "")

    # Tokens that are known skills weigh more than filler verbs/nouns.
    skill_tokens = {t for t in tokens if t in ALIAS_TO_CANONICAL or t.replace("-", "") in ALIAS_TO_CANONICAL}
    weights = {t: (2.2 if t in skill_tokens else 1.0) for t in tokens}
    weight_total = sum(weights.values())

    best_score = 0.0
    best_ev = ""
    for bullet in profile.bullets:
        bl = bullet.lower()
        hit_w = sum(weights[t] for t in tokens if t in bl)
        ratio = hit_w / weight_total
        # Action + metric bullets that hit the responsibility are stronger evidence.
        bonus = 0.0
        if ratio >= 0.25:
            if bullet_has_action(bullet):
                bonus += 0.06
            if bullet_has_metric(bullet):
                bonus += 0.06
        score = min(1.0, ratio + bonus)
        if score > best_score:
            best_score = score
            best_ev = bullet

    # Light full-text fallback when no bullet is close enough.
    if best_score < 0.3:
        hit_w = sum(weights[t] for t in tokens if t in profile.lower)
        best_score = max(best_score, (hit_w / weight_total) * 0.65)

    if best_score >= 0.55:
        return ("matched", min(1.0, best_score), best_ev)
    if best_score >= 0.28:
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
