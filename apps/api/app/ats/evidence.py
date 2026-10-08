"""Evidence strength — levels 0–5; rewards demonstrated context, not stuffing."""

from __future__ import annotations

from app.ats.resume_profile import (
    ResumeProfile,
    SkillMention,
    bullet_has_action,
    bullet_has_metric,
)
from app.ats.skill_taxonomy import ALIAS_TO_CANONICAL, related_skills

# Map evidence level → continuous strength used in weighted averages.
LEVEL_TO_STRENGTH = {
    0: 0.0,
    1: 0.28,  # mentioned only (skills list / summary)
    2: 0.55,  # project evidence
    3: 0.78,  # professional experience
    4: 0.90,  # repeated / multi-bullet professional
    5: 1.00,  # strong + impact / ownership / production cues
}

LEVEL_LABEL = {
    0: "missing",
    1: "mentioned",
    2: "project",
    3: "professional",
    4: "strong_professional",
    5: "strong_impact",
}

_PRODUCTION_CUES = (
    "production",
    "prod ",
    "customers",
    "users",
    "scale",
    "latency",
    "throughput",
    "p95",
    "p99",
    "revenue",
    "pipeline",
    "migrat",
    "led ",
    "owned ",
    "shipped",
)

# Concept buckets for responsibility matching (synonym-aware, deterministic).
_RESP_CONCEPTS: dict[str, frozenset[str]] = {
    "build": frozenset(
        {"build", "built", "develop", "developed", "implement", "implemented", "create", "created", "ship", "shipped"}
    ),
    "design": frozenset({"design", "designed", "architect", "architected", "prototype"}),
    "api": frozenset(
        {"api", "apis", "rest", "restful", "endpoint", "endpoints", "graphql", "grpc", "service", "services", "http"}
    ),
    "backend": frozenset({"backend", "back-end", "server", "serverside", "microservice", "microservices"}),
    "frontend": frozenset({"frontend", "front-end", "ui", "ux", "react", "component", "components", "dashboard"}),
    "data": frozenset({"data", "etl", "pipeline", "warehouse", "analytics", "ingestion", "spark", "sql"}),
    "scale": frozenset({"scale", "scalable", "scaling", "throughput", "latency", "performance", "optimize", "optimized"}),
    "deploy": frozenset({"deploy", "deployed", "ci", "cd", "kubernetes", "docker", "infra", "terraform"}),
    "test": frozenset({"test", "tested", "testing", "qa", "unit", "integration"}),
    "collaborate": frozenset({"collaborate", "collaborated", "cross-functional", "stakeholders", "partnered"}),
    "database": frozenset({"database", "databases", "sql", "postgres", "postgresql", "mysql", "mongodb", "query", "schema"}),
    "cloud": frozenset({"aws", "gcp", "azure", "cloud"}),
}


def evidence_strength(profile: ResumeProfile, canonical: str) -> tuple[float, str, str, int]:
    """
    Returns (strength 0..1, matchType, evidence snippet, evidenceLevel 0..5).
    matchType: exact_strong | exact_weak | related | indirect | missing
    """
    mention = profile.skill_mentions.get(canonical)
    if mention:
        level, snippet = _level_from_mention(profile, mention)
        strength = LEVEL_TO_STRENGTH[level]
        label = "exact_strong" if level >= 3 else "exact_weak" if level >= 1 else "missing"
        return strength, label, snippet, level

    # Related technology — capped (never full credit)
    best_rel = 0
    best_snip = ""
    for rel in related_skills(canonical):
        rel_m = profile.skill_mentions.get(rel)
        if not rel_m:
            continue
        lvl, snip = _level_from_mention(profile, rel_m)
        # Related maxes at project-ish credit
        capped = min(2, lvl) if lvl >= 2 else 1 if lvl >= 1 else 0
        if capped > best_rel:
            best_rel = capped
            best_snip = snip or rel_m.context or rel_m.original
    if best_rel:
        return LEVEL_TO_STRENGTH[best_rel] * 0.85, "related", best_snip, best_rel

    if canonical in ("postgresql", "mysql") and "relational database" in profile.lower:
        return LEVEL_TO_STRENGTH[1] * 0.8, "indirect", "Mentions relational databases (not the specific engine).", 1

    if canonical == "rest" and ("api" in profile.lower and "http" in profile.lower):
        return LEVEL_TO_STRENGTH[1] * 0.9, "indirect", "Mentions APIs / HTTP without explicit REST.", 1

    return 0.0, "missing", "", 0


def _level_from_mention(profile: ResumeProfile, mention: SkillMention) -> tuple[int, str]:
    needles = {
        mention.canonical.replace("_", " "),
        mention.original.lower(),
    }
    for alias, can in ALIAS_TO_CANONICAL.items():
        if can == mention.canonical and len(alias) >= 3:
            needles.add(alias)

    matching_bullets: list[str] = []
    for bullet in profile.bullets:
        bl = bullet.lower()
        if any(n and n in bl for n in needles):
            matching_bullets.append(bullet)

    best = matching_bullets[0] if matching_bullets else ""
    # Prefer action + metric bullet as primary snippet
    for b in matching_bullets:
        if bullet_has_action(b) and bullet_has_metric(b):
            best = b
            break
        if bullet_has_action(b) and (not best or not bullet_has_action(best)):
            best = b

    evidence = best or mention.context or mention.original
    in_projects = mention.section == "projects" or any(
        "project" in b.lower() for b in matching_bullets[:3]
    )
    in_experience = mention.section == "experience" or (
        bool(matching_bullets)
        and mention.section not in ("skills", "education", "summary")
        and any(bullet_has_action(b) for b in matching_bullets)
        and mention.section != "skills"
    )
    # Hard rule: skills-section listing alone is never professional evidence
    if mention.section == "skills" and not matching_bullets:
        if mention.count >= 5:
            return 1, evidence
        return 1, evidence

    if mention.section == "skills" and matching_bullets:
        # Skill also appears in a narrative bullet elsewhere
        in_experience = any(
            bullet_has_action(b) and mention.section != "skills"
            for b in matching_bullets
        )
        # Re-check: bullets from experience often still match
        for b in matching_bullets:
            if bullet_has_action(b):
                in_experience = True
                best = b
                evidence = b
                break

    if not matching_bullets and mention.section in ("skills", "summary", "body", "education"):
        return 1, evidence

    if not matching_bullets:
        return 1, evidence

    action_hits = sum(1 for b in matching_bullets if bullet_has_action(b))
    metric_hits = sum(1 for b in matching_bullets if bullet_has_metric(b))
    prod_hits = sum(
        1 for b in matching_bullets if any(c in b.lower() for c in _PRODUCTION_CUES)
    )

    if in_experience or (mention.section == "experience"):
        if action_hits >= 2 or (action_hits >= 1 and len(matching_bullets) >= 2):
            if metric_hits or prod_hits:
                return 5, evidence
            return 4, evidence
        if action_hits >= 1:
            if metric_hits or prod_hits:
                return 5, evidence
            return 3, evidence
        return 3, evidence

    if in_projects or mention.section == "projects":
        if action_hits and (metric_hits or prod_hits):
            return 3, evidence
        if action_hits:
            return 2, evidence
        return 2, evidence

    if mention.section == "summary":
        return 1, evidence

    return 1, evidence


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
        "experience",
        "strong",
    }
)


def _concepts_in_text(text: str) -> set[str]:
    tokens = set(re_tokens(text))
    lower = (text or "").lower()
    found: set[str] = set()
    for name, syns in _RESP_CONCEPTS.items():
        if tokens & syns or any(s in lower for s in syns if len(s) > 4):
            found.add(name)
    return found


def responsibility_match(
    profile: ResumeProfile, responsibility: str
) -> tuple[str, float, str]:
    """Return status matched|partial|missing, score, evidence."""
    jd_concepts = _concepts_in_text(responsibility)
    tokens = [t for t in re_tokens(responsibility) if len(t) > 3 and t not in _RESP_STOP]
    if not tokens and not jd_concepts:
        return ("missing", 0.0, "")

    skill_tokens = {
        t for t in tokens if t in ALIAS_TO_CANONICAL or t.replace("-", "") in ALIAS_TO_CANONICAL
    }
    weights = {t: (2.0 if t in skill_tokens else 1.0) for t in tokens}
    weight_total = sum(weights.values()) or 1.0

    best_score = 0.0
    best_ev = ""
    for bullet in profile.bullets:
        bl = bullet.lower()
        token_ratio = sum(weights[t] for t in tokens if t in bl) / weight_total if tokens else 0.0
        bullet_concepts = _concepts_in_text(bullet)
        if jd_concepts:
            concept_ratio = len(jd_concepts & bullet_concepts) / len(jd_concepts)
        else:
            concept_ratio = 0.0
        # Blend: concepts carry semantic weight; tokens catch specific tools.
        ratio = 0.55 * concept_ratio + 0.45 * token_ratio if jd_concepts else token_ratio
        bonus = 0.0
        if ratio >= 0.25:
            if bullet_has_action(bullet):
                bonus += 0.05
            if bullet_has_metric(bullet):
                bonus += 0.05
        score = min(1.0, ratio + bonus)
        if score > best_score:
            best_score = score
            best_ev = bullet

    if best_score < 0.28 and tokens:
        hit_w = sum(weights[t] for t in tokens if t in profile.lower)
        best_score = max(best_score, (hit_w / weight_total) * 0.6)

    if best_score >= 0.52:
        return ("matched", min(1.0, best_score), best_ev)
    if best_score >= 0.26:
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
    family = {"engineer", "developer", "sde", "swe"}
    if (ta & family) and (tb & family):
        jaccard = min(1.0, jaccard + 0.25)
    # Domain mismatch penalty (frontend vs backend)
    domains = (
        ({"frontend", "front", "ui", "react"}, {"backend", "back", "api", "server"}),
        ({"data", "etl", "pipeline"}, {"frontend", "ui", "design"}),
    )
    for a_set, b_set in domains:
        if (ta & a_set and tb & b_set) or (ta & b_set and tb & a_set):
            jaccard *= 0.55
    return jaccard
