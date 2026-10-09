"""HTTP surface for discovery: `/svc/v1/discovery/*`.

* `/cron/*` — Vercel Cron (GET, `Authorization: Bearer $CRON_SECRET`), see vercel.json.
* `/admin/*` — called server-to-server by the web app's admin routes, which check the
  admin allowlist first and forward with the same secret. Never called from browsers.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import Iterator
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.discovery.config import get_settings
from app.discovery.db import DatabaseNotConfigured, connect
from app.discovery.jobs import expiry, ranking, registry, scan
from app.discovery.people import importer
from app.discovery.people import store as people_store
from app.discovery.runs import store as runs
from app.discovery.runs.worker import process_tick
from app.discovery.schema import BaseSchemaMissing, ensure_schema
from app.discovery.timeutil import ist_date_key

router = APIRouter(prefix="/svc/v1/discovery", tags=["discovery"])


def require_secret(authorization: str | None = Header(default=None)) -> None:
    secret = get_settings().cron_secret.strip()
    if not secret:
        # Same rule as the web cron routes: only allowed outside production.
        if os.environ.get("VERCEL_ENV") == "production":
            raise HTTPException(status_code=401, detail="CRON_SECRET is not configured.")
        return
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized.")


def db() -> Iterator[psycopg.Connection]:
    try:
        with connect() as conn:
            ensure_schema(conn)
            yield conn
    except (DatabaseNotConfigured, BaseSchemaMissing) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


Auth = Depends(require_secret)
Conn = Depends(db)


def _seed_if_empty(conn: psycopg.Connection) -> None:
    if conn.execute("SELECT 1 FROM company_sources LIMIT 1").fetchone() is None:
        registry.import_seed(conn)


# --- Cron -------------------------------------------------------------------------------


@router.get("/cron/scan/{shard}", dependencies=[Auth])
def cron_scan(shard: int, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    """Daily scan of one registry shard. Idempotent per IST day: a re-run (or Vercel retry)
    resumes the same run instead of creating another."""
    settings = get_settings()
    if not settings.discovery_enabled:
        return {"skipped": "discovery disabled"}
    if not 0 <= shard < settings.discovery_shards:
        raise HTTPException(status_code=400, detail=f"shard must be 0..{settings.discovery_shards - 1}")
    _seed_if_empty(conn)
    ids = registry.scheduled_source_ids(
        conn, shard=shard, shard_count=settings.discovery_shards, max_failures=settings.discovery_max_failures
    )
    run, created = runs.create_run(
        conn,
        kind="jobs_scan",
        run_key=f"jobs-scan:{ist_date_key()}:shard-{shard}",
        items=[(scan.ITEM_KIND, source_id, {}) for source_id in ids],
        created_by="cron",
    )
    return {"runId": run["id"], "created": created, "sources": len(ids), "tick": process_tick(conn, settings)}


@router.get("/cron/drain/{slot}", dependencies=[Auth])
def cron_drain(slot: int, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    """Process leftover/retrying items from any run (scans and people imports). `slot` only
    keeps each scheduled cron path unique in vercel.json."""
    return {"tick": process_tick(conn, get_settings())}


@router.get("/cron/expire", dependencies=[Auth])
def cron_expire(conn: psycopg.Connection = Conn) -> dict[str, Any]:
    return expiry.run_expiry(conn, get_settings())


@router.get("/cron/rank", dependencies=[Auth])
def cron_rank(conn: psycopg.Connection = Conn) -> dict[str, Any]:
    """Daily top-up over the whole active pool (incremental ranking happens per scan)."""
    created = ranking.recommend(conn, get_settings(), job_ids=None)
    return {"recommended": sum(created.values()), "users": len(created)}


# --- Admin (server-to-server from the web admin routes) ----------------------------------


class ImportSourcesBody(BaseModel):
    text: str | None = Field(default=None, max_length=500_000)
    seed: bool = False


class SourcePatch(BaseModel):
    enabled: bool


class ScanRunBody(BaseModel):
    createdBy: str | None = None
    sourceIds: list[str] | None = None


class PeopleImportBody(BaseModel):
    csv: str = Field(min_length=1, max_length=20_000_000)
    createdBy: str | None = None
    source: str = "admin_import"


class TickBody(BaseModel):
    budgetSeconds: float | None = Field(default=None, ge=5, le=280)


@router.get("/admin/overview", dependencies=[Auth])
def admin_overview(conn: psycopg.Connection = Conn) -> dict[str, Any]:
    settings = get_settings()
    sources = registry.list_sources(conn, limit=1)
    return {
        "settings": {
            "enabled": settings.discovery_enabled,
            "dailyLimit": settings.discovery_daily_limit,
            "expiryDays": settings.job_expiry_days,
            "juniorMaxYearsExclusive": settings.junior_max_years_exclusive,
            "includeInternships": settings.include_internships,
            "shards": settings.discovery_shards,
        },
        "sourceSummary": sources["summary"],
        "byProvider": sources["byProvider"],
        "runs": runs.list_runs(conn, limit=15),
        "openItems": runs.open_item_count(conn, max_attempts=settings.discovery_max_attempts),
    }


@router.get("/admin/sources", dependencies=[Auth])
def admin_sources(
    q: str = "",
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    conn: psycopg.Connection = Conn,
) -> dict[str, Any]:
    return registry.list_sources(conn, query=q, limit=limit, offset=offset)


@router.post("/admin/sources/import", dependencies=[Auth])
def admin_import_sources(body: ImportSourcesBody, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    if body.seed:
        return registry.import_seed(conn)
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Provide `text` (one career URL per line) or `seed: true`.")
    result = registry.import_lines(conn, body.text)
    return {"added": result.added, "existing": result.existing, "invalid": result.invalid[:50]}


@router.patch("/admin/sources/{source_id}", dependencies=[Auth])
def admin_patch_source(source_id: str, body: SourcePatch, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    if not registry.set_enabled(conn, source_id, body.enabled):
        raise HTTPException(status_code=404, detail="Source not found.")
    return {"ok": True}


@router.post("/admin/runs/jobs-scan", dependencies=[Auth])
def admin_scan_run(body: ScanRunBody, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    """Manual scan of all enabled sources (or the given ones). Returns immediately; the
    admin page then drives `/admin/tick` and the drain crons finish anything left."""
    settings = get_settings()
    # A manual scan that is still in progress is resumed, never duplicated (double clicks,
    # retries after a client timeout).
    open_run = conn.execute(
        """SELECT r.id, r.total_items FROM discovery_runs r
           WHERE r.kind = 'jobs_scan' AND r.run_key IS NULL AND r.status = 'running'
             AND EXISTS (SELECT 1 FROM discovery_run_items i
                         WHERE i.run_id = r.id AND i.status IN ('pending', 'running'))
           ORDER BY r.created_at DESC LIMIT 1"""
    ).fetchone()
    if open_run and not body.sourceIds:
        return {"runId": open_run["id"], "sources": open_run["total_items"], "resumed": True}
    _seed_if_empty(conn)
    ids = body.sourceIds or registry.scheduled_source_ids(
        conn, shard=None, shard_count=settings.discovery_shards, max_failures=settings.discovery_max_failures
    )
    run, _ = runs.create_run(
        conn, kind="jobs_scan", items=[(scan.ITEM_KIND, i, {}) for i in ids], created_by=body.createdBy
    )
    return {"runId": run["id"], "sources": len(ids), "resumed": False}


@router.post("/admin/runs/people-import", dependencies=[Auth])
def admin_people_import(body: PeopleImportBody, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    try:
        return importer.create_import_run(
            conn, get_settings(), body.csv, created_by=body.createdBy, source=body.source[:60]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/admin/runs/{run_id}", dependencies=[Auth])
def admin_run(run_id: str, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    run = runs.get_run(conn, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@router.post("/admin/runs/{run_id}/retry", dependencies=[Auth])
def admin_retry(run_id: str, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    return {"requeued": runs.retry_failed(conn, run_id)}


@router.post("/admin/tick", dependencies=[Auth])
def admin_tick(body: TickBody, conn: psycopg.Connection = Conn) -> dict[str, Any]:
    return process_tick(conn, get_settings(), budget_seconds=body.budgetSeconds)


@router.post("/admin/expire", dependencies=[Auth])
def admin_expire(conn: psycopg.Connection = Conn) -> dict[str, Any]:
    return expiry.run_expiry(conn, get_settings())


@router.post("/admin/rank", dependencies=[Auth])
def admin_rank(conn: psycopg.Connection = Conn) -> dict[str, Any]:
    people_store.backfill_people_keys(conn)
    created = ranking.recommend(conn, get_settings(), job_ids=None)
    return {"recommended": sum(created.values()), "users": len(created)}
