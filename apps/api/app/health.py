"""Dependency probes for GET /svc/health. Cheap, short timeouts, never returns secret values.

Each check is `{status: ok|degraded|down|not_configured, latencyMs, detail}`; extra keys are
non-secret facts (counts, booleans, timestamps).
"""

from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings

RANK = {"ok": 0, "not_configured": 0, "degraded": 1, "down": 2}


def _check(status: str, started: float | None = None, detail: str | None = None, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {
        "status": status,
        "latencyMs": round((time.perf_counter() - started) * 1000, 1) if started is not None else None,
        "detail": detail,
    }
    out.update(extra)
    return out


def _discovery_settings():
    from app.discovery.config import get_settings

    return get_settings()


def _db_checks() -> dict[str, dict[str, Any]]:
    """Database (SELECT 1 + version), Google CSE usage and discovery state in one connection."""
    url = settings.database_url.strip()
    if not url:
        missing = _check("not_configured", detail="DATABASE_URL not set")
        return {"database": missing, "googleCse": _cse(None), "discovery": missing}
    started = time.perf_counter()
    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(url, connect_timeout=5, row_factory=dict_row) as conn:
            conn.execute("SET statement_timeout = 3000")
            conn.execute("SELECT 1")
            version = conn.execute("SHOW server_version").fetchone()["server_version"]
            host = url.split("@")[-1].split("/")[0].split(":")[0]
            db = _check(
                "ok", started, "SELECT 1 succeeded",
                serverVersion=version, provider="neon" if "neon.tech" in host else "postgres",
            )
            return {"database": db, "googleCse": _cse(conn), "discovery": _discovery(conn)}
    except Exception as exc:  # noqa: BLE001 — surface any probe failure, without the URL
        err = _check("down", started, type(exc).__name__ + ": " + str(exc).split("\n")[0][:160])
        return {"database": err, "googleCse": _cse(None), "discovery": _check("down", detail="database unavailable")}


def _cse(conn: Any) -> dict[str, Any]:
    s = _discovery_settings()
    if not (s.google_cse_key and s.google_cse_cx):
        return _check("not_configured", detail="GOOGLE_CSE_KEY / GOOGLE_CSE_CX not set (no live query is sent)")
    cap = s.google_cse_daily_query_cap
    if conn is None:
        return _check("degraded", detail="configured; usage unknown (database unavailable)", cap=cap)
    from app.discovery.people.quota import pacific_day, used

    started = time.perf_counter()
    try:
        day = pacific_day()
        n = used(conn, "google_cse", day)
    except Exception as exc:  # noqa: BLE001
        return _check("degraded", started, f"usage lookup failed: {type(exc).__name__}", cap=cap)
    status = "degraded" if n >= cap else "ok"
    return _check(status, started, "configured; no live query sent", usedToday=n, cap=cap, quotaDay=day,
                  quotaDayZone="America/Los_Angeles")


def _discovery(conn: Any) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        run = conn.execute(
            """SELECT id, status, created_at, updated_at, total_items, done_items, failed_items
               FROM discovery_runs WHERE kind = 'people_discovery' ORDER BY created_at DESC LIMIT 1"""
        ).fetchone()
        queued = conn.execute(
            """SELECT COUNT(*)::int AS n FROM discovery_run_items i JOIN discovery_runs r ON r.id = i.run_id
               WHERE r.kind = 'people_discovery' AND i.status = 'pending'"""
        ).fetchone()["n"]
        patterns = conn.execute("SELECT COUNT(*)::int AS n FROM company_email_patterns").fetchone()["n"]
    except Exception as exc:  # noqa: BLE001 — tables appear after the first discovery request
        return _check("degraded", started, f"discovery tables not readable: {type(exc).__name__}")
    last = None
    if run:
        last = {k: run[k] for k in ("status", "created_at", "updated_at", "total_items", "done_items", "failed_items")}
    status = "ok" if run and run["status"] != "failed" else "degraded"
    detail = "no people-discovery run yet" if not run else f"last run {run['status']}"
    return _check(status, started, detail, lastPeopleRun=last, queuedItems=queued, emailPatterns=patterns)


def _github() -> dict[str, Any]:
    token = _discovery_settings().github_token.strip()
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    started = time.perf_counter()
    try:
        # /rate_limit does not count against the rate limit.
        resp = httpx.get("https://api.github.com/rate_limit", headers=headers, timeout=4.0)
    except Exception as exc:  # noqa: BLE001
        return _check("down", started, f"GitHub unreachable: {type(exc).__name__}", tokenConfigured=bool(token))
    if resp.status_code == 401:
        return _check("down", started, "GITHUB_TOKEN rejected (401)", tokenConfigured=True)
    if resp.status_code != 200:
        return _check("degraded", started, f"HTTP {resp.status_code}", tokenConfigured=bool(token))
    core = (resp.json().get("resources") or {}).get("core") or {}
    remaining, limit = core.get("remaining"), core.get("limit")
    reset = core.get("reset")
    reset_iso = datetime.fromtimestamp(reset, tz=timezone.utc).isoformat().replace("+00:00", "Z") if reset else None
    status = "ok" if token and remaining and remaining > 100 else "degraded"
    detail = "token configured" if token else "no GITHUB_TOKEN: 60 requests/hour"
    return _check(status, started, detail, tokenConfigured=bool(token), limit=limit, remaining=remaining,
                  resetAt=reset_iso)


def _configured(name: str, value: str) -> dict[str, Any]:
    if value.strip():
        return _check("ok", detail=f"{name} configured (not called)", configured=True)
    return _check("not_configured", detail=f"{name} not set", configured=False)


def build_health_report() -> dict[str, Any]:
    started = time.perf_counter()
    s = _discovery_settings()
    with ThreadPoolExecutor(max_workers=2) as pool:
        db_future = pool.submit(_db_checks)
        gh_future = pool.submit(_github)
        db = db_future.result()
        gh = gh_future.result()
    checks: dict[str, dict[str, Any]] = {
        "backend": _check("ok", detail="FastAPI reachable"),
        "database": db["database"],
        "github": gh,
        "googleCse": db["googleCse"],
        "brave": _configured("BRAVE_SEARCH_API_KEY", s.brave_search_api_key),
        "serpapi": _configured("SERPAPI_KEY", s.serpapi_key),
        "hunter": _configured("HUNTER_API_KEY", s.hunter_api_key),
        "apollo": _configured("APOLLO_API_KEY", s.apollo_api_key),
        "discovery": db["discovery"],
        "cronSecret": _check(
            "ok" if settings.cron_secret.strip() else "down",
            detail="CRON_SECRET configured" if settings.cron_secret.strip() else "CRON_SECRET not set: crons will be rejected",
            configured=bool(settings.cron_secret.strip()),
        ),
    }
    worst = max(RANK[c["status"]] for c in checks.values())
    if checks["database"]["status"] == "down":
        worst = 2
    status = {0: "ok", 1: "degraded", 2: "down"}[worst]
    return {
        "status": status,
        "ok": status != "down",
        "service": "api",
        "commit": os.environ.get("VERCEL_GIT_COMMIT_SHA") or None,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "latencyMs": round((time.perf_counter() - started) * 1000, 1),
        "checks": checks,
    }
