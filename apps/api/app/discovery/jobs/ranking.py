"""Per-user recommendations.

Eligible users: approved, onboarded, discovery not disabled in Profile settings. Each user
gets at most `discovery_daily_limit` new recommendations per IST day. Recommendations
accumulate (stored on `user_job_state.recommended_at`) until the user applies or ignores;
expired/closed jobs simply drop out of the Discover query.

Experience: a user with N years (profile `years_experience`, else
`default_years_experience`) is offered jobs whose minimum required years is within
[0, N + experience_window_years]; jobs stating none are included. Ranking adds a closeness
bonus (min years near N) and a region bonus (India, then remote open to India, then other
remote, then elsewhere) to the match score, so India leads while global roles still appear.

Hidden by ranking: a re-rank that finds an open recommendation no longer fits clears
`recommended_at` and sets `hidden_reason = 'rerank'`. Those rows stay in the pool, so a later
run offers the job again once it fits (for example after a profile change). Jobs the user
ignored, applied to or bookmarked are never offered again.

Runs incrementally after each company scan (for its new jobs), once a day over the whole active
pool to top up, after a career-preference save and when onboarding completes. Every path is
idempotent: an existing recommendation is never touched; only a ranking-hidden row is reused.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.db import new_id
from app.discovery.jobs.scoring import Career, ats_score, compatibility_score
from app.discovery.timeutil import expiry_cutoff_iso, ist_day_start_iso, now_iso

POOL_LIMIT = 1500
# A state row hidden by ranking, not by the user (never ignored, applied or bookmarked). The
# pool offers these jobs again, so they come back once a profile change makes them fit.
# COALESCE keeps it true/false (never NULL), so `NOT` on it is safe for ordinary rows.
_SYSTEM_HIDDEN = (
    "(COALESCE({s}.hidden_reason, '') = 'rerank' AND {s}.ignored = 0 AND {s}.application_id IS NULL)"
)
# Rank bonus by job region (filters.REGION_PRIORITY order): India first.
REGION_BONUS = {"india": 12, "india_remote": 9, "remote": 4, "global": 0}
CLOSENESS_MAX = 10


@dataclass
class UserContext:
    user_id: str
    career: Career
    resume_text: str
    resume_id: str | None
    years: float = 0.0


def max_min_years(settings: DiscoverySettings, years: float) -> float:
    """Highest minimum-required years a user is shown."""
    return years + settings.experience_window_years


def experience_closeness(min_years: int | None, years: float) -> int:
    """0..CLOSENESS_MAX: highest when the job's minimum is at the user's level; a job asking
    for more (up to the window) or far less scores lower. Unstated → middle."""
    if min_years is None:
        return CLOSENESS_MAX // 2
    gap = abs(years - min_years)
    return max(0, round(CLOSENESS_MAX - 2.5 * gap))


def rank_value(compat: int, row: dict[str, Any], years: float) -> int:
    return compat + experience_closeness(row.get("min_years"), years) + REGION_BONUS.get(
        row.get("region") or "india", 0
    )


def _json_list(raw: str | None) -> list[str]:
    try:
        value = json.loads(raw or "[]")
    except ValueError:
        return []
    return [str(v).strip() for v in value if isinstance(v, str) and v.strip()] if isinstance(value, list) else []


def eligible_users(conn: psycopg.Connection) -> list[str]:
    rows = conn.execute(
        """SELECT p.user_id FROM profiles p
           LEFT JOIN user_preferences up ON up.user_id = p.user_id
           WHERE p.approval_status = 'approved' AND p.onboarding_complete = 1
             AND COALESCE(up.discovery_enabled, 1) = 1"""
    ).fetchall()
    return [r["user_id"] for r in rows]


def load_user_context(
    conn: psycopg.Connection, user_id: str, default_years: float = 0.0
) -> UserContext:
    profile = conn.execute(
        """SELECT skills_json, preferred_roles_json, preferred_locations_json, remote_preference,
                  experience_level, industry_preference, years_experience
           FROM profiles WHERE user_id = %s""",
        (user_id,),
    ).fetchone() or {}
    career = Career(
        skills=_json_list(profile.get("skills_json")),
        preferred_roles=_json_list(profile.get("preferred_roles_json")),
        preferred_locations=_json_list(profile.get("preferred_locations_json")),
        remote_preference=profile.get("remote_preference"),
        experience_level=profile.get("experience_level"),
        industry_preference=profile.get("industry_preference"),
    )
    # Same choice as web `resumeTextForUser`: the active resume, else the newest one.
    resume = conn.execute(
        """SELECT id, extracted_text FROM resumes
           WHERE user_id = %s AND status != 'archived'
           ORDER BY (status = 'active') DESC, updated_at DESC LIMIT 1""",
        (user_id,),
    ).fetchone()
    resume_text = (resume or {}).get("extracted_text") or ""
    if not resume_text.strip():
        resume_text = "\n".join(
            filter(None, [" ".join(career.skills), " ".join(career.preferred_roles), career.industry_preference or ""])
        )
    years = profile.get("years_experience")
    return UserContext(
        user_id, career, resume_text, (resume or {}).get("id"),
        float(years) if years is not None else default_years,
    )


def _candidates(
    conn: psycopg.Connection, user_id: str, cutoff: str, job_ids: list[str] | None, max_years: float
) -> list[dict[str, Any]]:
    base = """SELECT j.id, j.title, j.company, j.location, j.description, j.salary, j.url,
                     j.min_years, j.max_years, j.region,
                     COALESCE(j.posted_at, j.first_seen_at) AS posted
              FROM jobs j
              WHERE j.user_id IS NULL AND j.status = 'active'
                AND j.expired_at IS NULL AND j.closed_at IS NULL
                AND COALESCE(j.posted_at, j.first_seen_at) >= %(cutoff)s
                AND (j.min_years IS NULL OR j.min_years <= %(max_years)s)
                AND EXISTS (SELECT 1 FROM job_sources s WHERE s.job_id = j.id)
                AND NOT EXISTS (SELECT 1 FROM user_job_state u
                                WHERE u.user_id = %(user)s AND u.job_id = j.id
                                  AND NOT """ + _SYSTEM_HIDDEN.format(s="u") + ")"
    params: dict[str, Any] = {
        "cutoff": cutoff, "user": user_id, "limit": POOL_LIMIT, "max_years": max_years,
    }
    if job_ids is not None:
        base += " AND j.id = ANY(%(ids)s)"
        params["ids"] = job_ids
    # India first, so a big worldwide pool never crowds Indian roles out of the limit.
    base += """ ORDER BY CASE COALESCE(j.region, 'india') WHEN 'india' THEN 0
                  WHEN 'india_remote' THEN 1 WHEN 'remote' THEN 2 ELSE 3 END,
                j.first_seen_at DESC LIMIT %(limit)s"""
    return conn.execute(base, params).fetchall()


def recommend(
    conn: psycopg.Connection,
    settings: DiscoverySettings,
    job_ids: list[str] | None = None,
    contexts: dict[str, UserContext] | None = None,
    user_ids: list[str] | None = None,
) -> dict[str, int]:
    """Create missing recommendations. `job_ids=None` ranks the whole active pool; `user_ids`
    limits the run to those users. Returns {user_id: recommendations created}."""
    if not settings.discovery_enabled or (job_ids is not None and not job_ids):
        return {}
    contexts = contexts if contexts is not None else {}
    created: dict[str, int] = {}
    day_start = ist_day_start_iso()
    cutoff = expiry_cutoff_iso(settings.job_expiry_days)
    wanted = set(user_ids) if user_ids is not None else None

    for user_id in eligible_users(conn):
        if wanted is not None and user_id not in wanted:
            continue
        today = conn.execute(
            "SELECT COUNT(*) AS n FROM user_job_state WHERE user_id = %s AND recommended_at >= %s",
            (user_id, day_start),
        ).fetchone()["n"]
        remaining = settings.discovery_daily_limit - int(today)
        if remaining <= 0:
            continue
        ctx = contexts.get(user_id) or load_user_context(
            conn, user_id, settings.default_years_experience
        )
        contexts[user_id] = ctx
        rows = _candidates(conn, user_id, cutoff, job_ids, max_min_years(settings, ctx.years))
        if not rows:
            continue

        scored = []
        for row in rows:
            compat, compat_details = compatibility_score(row, ctx.career, ctx.resume_text)
            if ctx.career.has_signals and compat < settings.discovery_min_match_score:
                continue
            ats, ats_details = ats_score(row)
            scored.append(
                (rank_value(compat, row, ctx.years), row["posted"] or "", row, compat_details, ats,
                 ats_details, compat)
            )
        scored.sort(key=lambda s: (s[0], s[1]), reverse=True)
        picked = scored[:remaining]
        if not picked:
            continue

        now = now_iso()
        with conn.transaction(), conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO user_job_state
                     (user_id, job_id, ignored, application_id, updated_at, recommended_at, score, reasons_json)
                   VALUES (%s, %s, 0, NULL, %s, %s, %s, %s)
                   ON CONFLICT (user_id, job_id) DO UPDATE SET
                     recommended_at = EXCLUDED.recommended_at, score = EXCLUDED.score,
                     reasons_json = EXCLUDED.reasons_json, updated_at = EXCLUDED.updated_at,
                     hidden_reason = NULL
                   WHERE """ + _SYSTEM_HIDDEN.format(s="user_job_state"),
                [
                    (
                        user_id, row["id"], now, now, rank,
                        json.dumps(_reasons(details, row, ctx.years, compat)),
                    )
                    for rank, _, row, details, _, _, compat in picked
                ],
            )
            cur.executemany(
                """INSERT INTO job_scores
                     (id, user_id, job_id, resume_id, compatibility_score, ats_score, details_json,
                      created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (user_id, job_id) DO UPDATE SET
                     resume_id = EXCLUDED.resume_id,
                     compatibility_score = EXCLUDED.compatibility_score,
                     ats_score = EXCLUDED.ats_score,
                     details_json = EXCLUDED.details_json,
                     updated_at = EXCLUDED.updated_at""",
                [
                    (
                        new_id(), user_id, row["id"], ctx.resume_id, compat, ats,
                        json.dumps({"ats": ats_details, "compatibility": details}),
                        now, now,
                    )
                    for _, _, row, details, ats, ats_details, compat in picked
                ],
            )
        created[user_id] = len(picked)
    return created


def _reasons(details: dict[str, Any], row: dict[str, Any], years: float, compat: int) -> dict[str, Any]:
    return {
        "skills": details["skillHits"][:8],
        "roles": details["roleHits"][:4],
        "locations": details["locationHits"][:4],
        "minYears": row["min_years"],
        "maxYears": row.get("max_years"),
        "region": row.get("region"),
        "experienceFit": experience_closeness(row["min_years"], years),
        "match": compat,
    }


def rerank_user(conn: psycopg.Connection, settings: DiscoverySettings, user_id: str) -> dict[str, int]:
    """Re-run ranking for one user after their career preferences change.

    1. Re-score the recommendations still open for them (not applied, not ignored) against the
       current career profile, and refresh `job_scores`.
    2. Hide open recommendations that no longer fit (outside the experience window or under the
       match threshold): `recommended_at` is cleared and `hidden_reason` set to 'rerank'.
    3. Fill from the pool with whatever daily budget is left, exactly like the normal run. The
       pool includes jobs hidden by an earlier re-rank, so those that fit the new profile come
       back (ranked with the rest, within the daily cap).

    Returns counts: {"rescored", "dropped", "added", "restored"}; "restored" is the part of
    "added" that had been hidden by ranking. A user who isn't eligible (not approved, or
    discovery paused) gets zeros; their list is left as it was.
    """
    if user_id not in eligible_users(conn):
        return {"rescored": 0, "dropped": 0, "added": 0, "restored": 0}
    ctx = load_user_context(conn, user_id, settings.default_years_experience)
    limit_years = max_min_years(settings, ctx.years)
    rows = conn.execute(
        """SELECT j.id, j.title, j.company, j.location, j.description, j.salary, j.url,
                  j.min_years, j.max_years, j.region,
                  COALESCE(j.posted_at, j.first_seen_at) AS posted,
                  s.recommended_at
           FROM user_job_state s
           JOIN jobs j ON j.id = s.job_id
           WHERE s.user_id = %s AND s.ignored = 0 AND s.application_id IS NULL
             AND s.recommended_at IS NOT NULL
             AND j.status = 'active' AND j.expired_at IS NULL AND j.closed_at IS NULL""",
        (user_id,),
    ).fetchall()

    now = now_iso()
    keep: list[tuple[Any, ...]] = []
    scores: list[tuple[Any, ...]] = []
    drop: list[tuple[Any, ...]] = []
    for row in rows:
        compat, compat_details = compatibility_score(row, ctx.career, ctx.resume_text)
        outside = row["min_years"] is not None and row["min_years"] > limit_years
        if outside or (ctx.career.has_signals and compat < settings.discovery_min_match_score):
            drop.append((user_id, row["id"]))
            continue
        ats, _ = ats_score(row)
        keep.append(
            (
                rank_value(compat, row, ctx.years),
                json.dumps(_reasons(compat_details, row, ctx.years, compat)),
                now,
                user_id,
                row["id"],
            )
        )
        scores.append((compat, ats, now, user_id, row["id"]))

    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            "UPDATE user_job_state SET score = %s, reasons_json = %s, updated_at = %s "
            "WHERE user_id = %s AND job_id = %s",
            keep,
        )
        cur.executemany(
            "UPDATE job_scores SET compatibility_score = %s, ats_score = %s, updated_at = %s "
            "WHERE user_id = %s AND job_id = %s",
            scores,
        )
        cur.executemany(
            "UPDATE user_job_state SET recommended_at = NULL, score = NULL, reasons_json = NULL, "
            "hidden_reason = 'rerank', updated_at = %s WHERE user_id = %s AND job_id = %s",
            [(now, uid, jid) for uid, jid in drop],
        )

    hidden = [
        r["job_id"]
        for r in conn.execute(
            "SELECT job_id FROM user_job_state WHERE user_id = %s AND hidden_reason = 'rerank'", (user_id,)
        ).fetchall()
    ]
    added = recommend(conn, settings, job_ids=None, contexts={user_id: ctx}, user_ids=[user_id])
    restored = 0
    if hidden and added.get(user_id):
        restored = conn.execute(
            """SELECT COUNT(*) AS n FROM user_job_state
               WHERE user_id = %s AND job_id = ANY(%s) AND recommended_at IS NOT NULL""",
            (user_id, hidden),
        ).fetchone()["n"]
    return {
        "rescored": len(keep),
        "dropped": len(drop),
        "added": added.get(user_id, 0),
        "restored": int(restored),
    }
