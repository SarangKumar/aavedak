"""Per-user recommendations: the SQL around the staged matcher in `match.py`.

Eligible users: approved, onboarded, discovery not disabled in Profile settings. Each user
gets at most `discovery_daily_limit` new recommendations per IST day. Recommendations
accumulate (stored on `user_job_state.recommended_at`) until the user applies or ignores;
expired/closed jobs simply drop out of the Discover query.

Pipeline per user (see `match.py` for the stages themselves):

1. The pool query fetches active, unexpired, un-acted-on jobs within the user's experience
   window, India first, capped at `POOL_LIMIT` — the only place jobs are read, so there is
   one query per user and none per job.
2. `match.eligibility` drops what is unsuitable whatever else matches (hard constraints).
3. `match.evaluate` scores and explains each remaining job; jobs below
   `discovery_min_match_score` are skipped for users whose profile says enough to judge.
4. `match.rank_jobs` orders them, removes near-duplicates and caps one company's share of
   the front of the batch; the day's remaining budget is taken from the top.
5. `user_job_state` (recommended_at, rank score, reasons) and `job_scores` (match score, JD
   quality, breakdown, `inputs_key`) are written per user with two bulk statements.

`inputs_key` (engine version + job data + profile/resume data) makes the work cacheable: a
re-rank skips every job whose inputs are unchanged, so saving an unrelated profile field or
re-running the cron costs almost nothing, and a resume edit invalidates only that user's rows.

Hidden by ranking: a re-rank that finds an open recommendation no longer fits clears
`recommended_at` and sets `hidden_reason = 'rerank'`. Those rows stay in the pool, so a later
run offers the job again once it fits (for example after a profile change). Jobs the user
ignored, applied to or bookmarked are never offered again.

Runs incrementally after each company scan (for its new jobs), once a day over the whole active
pool to top up, after a career-preference save, after a resume change and when onboarding
completes. Every path is idempotent: an existing recommendation is never touched; only a
ranking-hidden row is reused.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.db import new_id
from app.discovery.jobs import match
from app.discovery.jobs.match import Candidate, JobFacts, RankedJob
from app.discovery.jobs.scoring import ats_score
from app.discovery.timeutil import expiry_cutoff_iso, ist_day_start_iso, now_iso

POOL_LIMIT = 1500
# A state row hidden by ranking, not by the user (never ignored, applied or bookmarked). The
# pool offers these jobs again, so they come back once a profile change makes them fit.
# COALESCE keeps it true/false (never NULL), so `NOT` on it is safe for ordinary rows.
_SYSTEM_HIDDEN = (
    "(COALESCE({s}.hidden_reason, '') = 'rerank' AND {s}.ignored = 0 AND {s}.application_id IS NULL)"
)
# Columns the matcher reads. `work_mode`, `employment_type`, `seniority` and `skills_json` are
# only filled for jobs a user added by hand; the matcher treats them as absent otherwise.
_JOB_COLUMNS = """j.id, j.title, j.company, j.location, j.description, j.salary, j.url,
                  j.min_years, j.max_years, j.region, j.status, j.expired_at, j.closed_at,
                  j.work_mode, j.employment_type, j.seniority, j.skills_json,
                  COALESCE(j.posted_at, j.first_seen_at) AS posted"""


@dataclass
class UserContext:
    user_id: str
    candidate: Candidate
    resume_id: str | None

    @property
    def years(self) -> float:
        return self.candidate.years


def max_min_years(settings: DiscoverySettings, years: float) -> float:
    """Highest minimum-required years a user is shown."""
    return years + settings.experience_window_years


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
    conn: psycopg.Connection, user_id: str, default_years: float = 0.0, window: float = 2.0
) -> UserContext:
    profile = conn.execute(
        """SELECT skills_json, preferred_roles_json, preferred_locations_json, remote_preference,
                  experience_level, industry_preference, years_experience
           FROM profiles WHERE user_id = %s""",
        (user_id,),
    ).fetchone() or {}
    # Same choice as web `resumeTextForUser`: the active resume, else the newest one.
    resume = conn.execute(
        """SELECT id, extracted_text FROM resumes
           WHERE user_id = %s AND status != 'archived'
           ORDER BY (status = 'active') DESC, updated_at DESC LIMIT 1""",
        (user_id,),
    ).fetchone()
    years = profile.get("years_experience")
    candidate = Candidate(
        years=float(years) if years is not None else default_years,
        skills=tuple(_json_list(profile.get("skills_json"))),
        preferred_roles=tuple(_json_list(profile.get("preferred_roles_json"))),
        preferred_locations=tuple(_json_list(profile.get("preferred_locations_json"))),
        remote_preference=profile.get("remote_preference"),
        experience_level=profile.get("experience_level"),
        industry_preference=profile.get("industry_preference"),
        resume_text=(resume or {}).get("extracted_text") or "",
        experience_window=window,
    )
    return UserContext(user_id, candidate, (resume or {}).get("id"))


def _candidates(
    conn: psycopg.Connection, user_id: str, cutoff: str, job_ids: list[str] | None, max_years: float
) -> list[dict[str, Any]]:
    base = (
        "SELECT " + _JOB_COLUMNS + """
              FROM jobs j
              WHERE j.user_id IS NULL AND j.status = 'active'
                AND j.expired_at IS NULL AND j.closed_at IS NULL
                AND COALESCE(j.posted_at, j.first_seen_at) >= %(cutoff)s
                AND (j.min_years IS NULL OR j.min_years <= %(max_years)s)
                AND EXISTS (SELECT 1 FROM job_sources s WHERE s.job_id = j.id)
                AND NOT EXISTS (SELECT 1 FROM user_job_state u
                                WHERE u.user_id = %(user)s AND u.job_id = j.id
                                  AND NOT """ + _SYSTEM_HIDDEN.format(s="u") + ")"
    )
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


def _score_rows(
    rows: list[dict[str, Any]], ctx: UserContext, settings: DiscoverySettings, now: str
) -> match.Ranking:
    """Stages A, B and E over one pool, with no database access."""
    entries: list[RankedJob] = []
    for row in rows:
        job = JobFacts.from_row(row)
        if not match.eligibility(job, ctx.candidate).eligible:
            continue
        result = match.evaluate(job, ctx.candidate)
        if ctx.candidate.has_signals and result.score < settings.discovery_min_match_score:
            continue
        entries.append(
            RankedJob(
                job=job,
                result=result,
                rank=match.rank_value(result, job, now),
                cache_key=match.inputs_key(job, ctx.candidate),
            )
        )
    return match.rank_jobs(entries)


def _write_scores(
    cur: psycopg.Cursor, user_id: str, resume_id: str | None, picked: list[RankedJob], rows_by_id: dict[str, dict[str, Any]], now: str
) -> None:
    cur.executemany(
        """INSERT INTO job_scores
             (id, user_id, job_id, resume_id, compatibility_score, ats_score, details_json,
              inputs_key, created_at, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (user_id, job_id) DO UPDATE SET
             resume_id = EXCLUDED.resume_id,
             compatibility_score = EXCLUDED.compatibility_score,
             ats_score = EXCLUDED.ats_score,
             details_json = EXCLUDED.details_json,
             inputs_key = EXCLUDED.inputs_key,
             updated_at = EXCLUDED.updated_at""",
        [
            (
                new_id(), user_id, entry.job.id, resume_id, entry.result.score, ats,
                json.dumps(
                    {
                        "ats": ats_details,
                        "compatibility": {
                            "engine": match.MATCH_ENGINE_VERSION,
                            "confidence": entry.result.confidence,
                            "breakdown": entry.result.breakdown(),
                            "skillsMatched": entry.result.skills_matched,
                            "skillsMissing": entry.result.skills_missing,
                        },
                    }
                ),
                entry.cache_key, now, now,
            )
            for entry, ats, ats_details in (
                (entry, *ats_score(rows_by_id[entry.job.id])) for entry in picked
            )
        ],
    )


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
            conn, user_id, settings.default_years_experience, settings.experience_window_years
        )
        contexts[user_id] = ctx
        rows = _candidates(conn, user_id, cutoff, job_ids, max_min_years(settings, ctx.years))
        if not rows:
            continue
        now = now_iso()
        ranked = _score_rows(rows, ctx, settings, now)
        picked = ranked.items[:remaining]
        if not picked:
            continue

        rows_by_id = {str(row["id"]): row for row in rows}
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
                        user_id, entry.job.id, now, now, entry.rank,
                        json.dumps(entry.result.explanation(entry.job)),
                    )
                    for entry in picked
                ],
            )
            _write_scores(cur, user_id, ctx.resume_id, picked, rows_by_id, now)
        created[user_id] = len(picked)
    return created


def rerank_user(conn: psycopg.Connection, settings: DiscoverySettings, user_id: str) -> dict[str, int]:
    """Re-run ranking for one user after their career preferences or resume change.

    1. Re-score the recommendations still open for them (not applied, not ignored) against the
       current profile, and refresh `job_scores`. A job whose `inputs_key` is unchanged is left
       alone: the deterministic engine would return exactly what is already stored.
    2. Hide open recommendations that no longer fit (hard constraints, or under the match
       threshold): `recommended_at` is cleared and `hidden_reason` set to 'rerank'.
    3. Fill from the pool with whatever daily budget is left, exactly like the normal run. The
       pool includes jobs hidden by an earlier re-rank, so those that fit the new profile come
       back (ranked with the rest, within the daily cap).

    Returns counts: {"rescored", "unchanged", "dropped", "added", "restored"}; "restored" is the
    part of "added" that had been hidden by ranking. A user who isn't eligible (not approved, or
    discovery paused) gets zeros; their list is left as it was.
    """
    empty = {"rescored": 0, "unchanged": 0, "dropped": 0, "added": 0, "restored": 0}
    if user_id not in eligible_users(conn):
        return dict(empty)
    ctx = load_user_context(
        conn, user_id, settings.default_years_experience, settings.experience_window_years
    )
    rows = conn.execute(
        "SELECT " + _JOB_COLUMNS + """, s.recommended_at, sc.inputs_key
           FROM user_job_state s
           JOIN jobs j ON j.id = s.job_id
           LEFT JOIN job_scores sc ON sc.user_id = s.user_id AND sc.job_id = s.job_id
           WHERE s.user_id = %s AND s.ignored = 0 AND s.application_id IS NULL
             AND s.recommended_at IS NOT NULL
             AND j.status = 'active' AND j.expired_at IS NULL AND j.closed_at IS NULL""",
        (user_id,),
    ).fetchall()

    now = now_iso()
    keep: list[tuple[Any, ...]] = []
    scored: list[RankedJob] = []
    drop: list[tuple[Any, ...]] = []
    unchanged = 0
    for row in rows:
        job = JobFacts.from_row(row)
        key = match.inputs_key(job, ctx.candidate)
        if row.get("inputs_key") == key:
            unchanged += 1
            continue
        result = match.evaluate(job, ctx.candidate)
        under = ctx.candidate.has_signals and result.score < settings.discovery_min_match_score
        if not match.eligibility(job, ctx.candidate).eligible or under:
            drop.append((user_id, job.id))
            continue
        entry = RankedJob(
            job=job, result=result, rank=match.rank_value(result, job, now), cache_key=key
        )
        scored.append(entry)
        keep.append((entry.rank, json.dumps(result.explanation(job)), now, user_id, job.id))

    rows_by_id = {str(row["id"]): row for row in rows}
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            "UPDATE user_job_state SET score = %s, reasons_json = %s, updated_at = %s "
            "WHERE user_id = %s AND job_id = %s",
            keep,
        )
        _write_scores(cur, user_id, ctx.resume_id, scored, rows_by_id, now)
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
        "unchanged": unchanged,
        "dropped": len(drop),
        "added": added.get(user_id, 0),
        "restored": int(restored),
    }
