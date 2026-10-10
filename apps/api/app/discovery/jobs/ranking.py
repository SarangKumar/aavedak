"""Per-user recommendations.

Eligible users: approved, onboarded, discovery not disabled in Profile settings. Each user
gets at most `discovery_daily_limit` new recommendations per IST day. Recommendations
accumulate (stored on `user_job_state.recommended_at`) until the user applies or ignores;
expired/closed jobs simply drop out of the Discover query.

Runs incrementally after each company scan (for its new jobs) and once a day over the
whole active pool to top up. Both paths are idempotent (`ON CONFLICT DO NOTHING`).
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


@dataclass
class UserContext:
    user_id: str
    career: Career
    resume_text: str
    resume_id: str | None


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


def load_user_context(conn: psycopg.Connection, user_id: str) -> UserContext:
    profile = conn.execute(
        """SELECT skills_json, preferred_roles_json, preferred_locations_json, remote_preference,
                  experience_level, industry_preference
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
    return UserContext(user_id, career, resume_text, (resume or {}).get("id"))


def _candidates(
    conn: psycopg.Connection, user_id: str, cutoff: str, job_ids: list[str] | None
) -> list[dict[str, Any]]:
    base = """SELECT j.id, j.title, j.company, j.location, j.description, j.salary, j.url,
                     j.min_years, COALESCE(j.posted_at, j.first_seen_at) AS posted
              FROM jobs j
              WHERE j.user_id IS NULL AND j.status = 'active'
                AND j.expired_at IS NULL AND j.closed_at IS NULL
                AND COALESCE(j.posted_at, j.first_seen_at) >= %(cutoff)s
                AND EXISTS (SELECT 1 FROM job_sources s WHERE s.job_id = j.id)
                AND NOT EXISTS (SELECT 1 FROM user_job_state u
                                WHERE u.user_id = %(user)s AND u.job_id = j.id)"""
    params: dict[str, Any] = {"cutoff": cutoff, "user": user_id, "limit": POOL_LIMIT}
    if job_ids is not None:
        base += " AND j.id = ANY(%(ids)s)"
        params["ids"] = job_ids
    base += " ORDER BY j.first_seen_at DESC LIMIT %(limit)s"
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
        rows = _candidates(conn, user_id, cutoff, job_ids)
        if not rows:
            continue
        ctx = contexts.get(user_id) or load_user_context(conn, user_id)
        contexts[user_id] = ctx

        scored = []
        for row in rows:
            compat, compat_details = compatibility_score(row, ctx.career, ctx.resume_text)
            if ctx.career.has_signals and compat < settings.discovery_min_match_score:
                continue
            ats, ats_details = ats_score(row)
            scored.append((compat, row["posted"] or "", row, compat_details, ats, ats_details))
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
                   ON CONFLICT (user_id, job_id) DO NOTHING""",
                [
                    (
                        user_id, row["id"], now, now, compat,
                        json.dumps(
                            {
                                "skills": details["skillHits"][:8],
                                "roles": details["roleHits"][:4],
                                "locations": details["locationHits"][:4],
                                "minYears": row["min_years"],
                            }
                        ),
                    )
                    for compat, _, row, details, _, _ in picked
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
                    for compat, _, row, details, ats, ats_details in picked
                ],
            )
        created[user_id] = len(picked)
    return created


def rerank_user(conn: psycopg.Connection, settings: DiscoverySettings, user_id: str) -> dict[str, int]:
    """Re-run ranking for one user after their career preferences change.

    1. Re-score the recommendations still open for them (not applied, not ignored) against the
       current career profile, and refresh `job_scores`.
    2. Drop open recommendations that no longer meet the match threshold. Setting
       `recommended_at` to NULL hides them from Discover; the row stays, so the pool query never
       offers them again.
    3. Fill from the pool with whatever daily budget is left, exactly like the normal run.

    Returns counts: {"rescored", "dropped", "added"}. A user who isn't eligible (not approved, or
    discovery paused) gets zeros; their list is left as it was.
    """
    if user_id not in eligible_users(conn):
        return {"rescored": 0, "dropped": 0, "added": 0}
    ctx = load_user_context(conn, user_id)
    rows = conn.execute(
        """SELECT j.id, j.title, j.company, j.location, j.description, j.salary, j.url,
                  j.min_years, COALESCE(j.posted_at, j.first_seen_at) AS posted,
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
        if ctx.career.has_signals and compat < settings.discovery_min_match_score:
            drop.append((user_id, row["id"]))
            continue
        ats, _ = ats_score(row)
        keep.append(
            (
                compat,
                json.dumps(
                    {
                        "skills": compat_details["skillHits"][:8],
                        "roles": compat_details["roleHits"][:4],
                        "locations": compat_details["locationHits"][:4],
                        "minYears": row["min_years"],
                    }
                ),
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
            "updated_at = %s WHERE user_id = %s AND job_id = %s",
            [(now, uid, jid) for uid, jid in drop],
        )

    added = recommend(conn, settings, job_ids=None, contexts={user_id: ctx}, user_ids=[user_id])
    return {"rescored": len(keep), "dropped": len(drop), "added": added.get(user_id, 0)}
