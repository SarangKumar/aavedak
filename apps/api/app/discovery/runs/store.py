"""Persistent, resumable runs.

A run is a set of items (one company source, or one batch of people rows). Workers claim
items with a lease (`FOR UPDATE SKIP LOCKED`), so concurrent ticks never double-process and
a crashed tick's items become claimable again once the lease expires. Failed items retry
up to `discovery_max_attempts`; a failed item never fails the whole run.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from typing import Any

import psycopg

from app.discovery.db import new_id
from app.discovery.timeutil import iso_plus, now_iso

OPEN_STATUSES = ("pending", "running")


@dataclass
class ItemOutcome:
    """What a handler reports for one claimed item."""

    ok: bool
    result: dict[str, Any]
    error: str | None = None
    retryable: bool = True


@dataclass(frozen=True)
class ClaimedItem:
    id: str
    run_id: str
    kind: str
    ref_id: str | None
    payload: dict[str, Any]
    attempts: int


def create_run(
    conn: psycopg.Connection,
    *,
    kind: str,
    items: list[tuple[str, str | None, dict[str, Any]]],
    run_key: str | None = None,
    created_by: str | None = None,
) -> tuple[dict[str, Any], bool]:
    """Create a run with items `(item_kind, ref_id, payload)`. With `run_key`, an existing
    run is returned instead (idempotent daily crons). Returns (run, created)."""
    if run_key:
        existing = conn.execute("SELECT * FROM discovery_runs WHERE run_key = %s", (run_key,)).fetchone()
        if existing:
            return existing, False
    now = now_iso()
    run_id = new_id()
    with conn.transaction():
        cur = conn.execute(
            """INSERT INTO discovery_runs
                 (id, kind, run_key, status, total_items, created_by, created_at, updated_at, finished_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (run_key) DO NOTHING""",
            (run_id, kind, run_key, "running" if items else "done", len(items), created_by, now, now,
             None if items else now),
        )
        if not cur.rowcount:  # lost a race on run_key
            return conn.execute("SELECT * FROM discovery_runs WHERE run_key = %s", (run_key,)).fetchone(), False
        with conn.cursor() as c:
            c.executemany(
                """INSERT INTO discovery_run_items
                     (id, run_id, kind, ref_id, payload_json, status, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, 'pending', %s, %s)""",
                [(new_id(), run_id, k, ref, json.dumps(payload), now, now) for k, ref, payload in items],
            )
    return conn.execute("SELECT * FROM discovery_runs WHERE id = %s", (run_id,)).fetchone(), True


def claim_items(
    conn: psycopg.Connection, *, limit: int, lease_seconds: int, max_attempts: int, kinds: list[str] | None = None
) -> list[ClaimedItem]:
    now = now_iso()
    params: dict[str, Any] = {
        "now": now,
        "lease": iso_plus(lease_seconds),
        "max": max_attempts,
        "limit": limit,
    }
    kind_filter = ""
    if kinds:
        kind_filter = "AND kind = ANY(%(kinds)s)"
        params["kinds"] = kinds
    rows = conn.execute(
        f"""UPDATE discovery_run_items
            SET status = 'running', lease_until = %(lease)s, attempts = attempts + 1, updated_at = %(now)s
            WHERE id IN (
              SELECT id FROM discovery_run_items
              WHERE (status = 'pending' OR (status = 'running' AND lease_until < %(now)s))
                AND attempts < %(max)s {kind_filter}
              ORDER BY created_at
              LIMIT %(limit)s
              FOR UPDATE SKIP LOCKED)
            RETURNING id, run_id, kind, ref_id, payload_json, attempts""",
        params,
    ).fetchall()
    return [
        ClaimedItem(r["id"], r["run_id"], r["kind"], r["ref_id"], json.loads(r["payload_json"] or "{}"), r["attempts"])
        for r in rows
    ]


def sweep_exhausted(conn: psycopg.Connection, *, max_attempts: int) -> set[str]:
    """Items whose lease expired after their last attempt are failed for good."""
    rows = conn.execute(
        """UPDATE discovery_run_items
           SET status = 'failed', last_error = COALESCE(last_error, 'Lease expired (worker timed out).'),
               updated_at = %(now)s
           WHERE status = 'running' AND lease_until < %(now)s AND attempts >= %(max)s
           RETURNING run_id""",
        {"now": now_iso(), "max": max_attempts},
    ).fetchall()
    return {r["run_id"] for r in rows}


def complete_item(conn: psycopg.Connection, item_id: str, result: dict[str, Any]) -> None:
    conn.execute(
        """UPDATE discovery_run_items SET status = 'done', lease_until = NULL, last_error = NULL,
             result_json = %s, updated_at = %s WHERE id = %s""",
        (json.dumps(result, default=str), now_iso(), item_id),
    )


def fail_item(
    conn: psycopg.Connection, item: ClaimedItem, error: str, *, max_attempts: int, retryable: bool = True
) -> None:
    final = not retryable or item.attempts >= max_attempts
    conn.execute(
        """UPDATE discovery_run_items SET status = %s, lease_until = NULL, last_error = %s, updated_at = %s
           WHERE id = %s""",
        ("failed" if final else "pending", error[:500], now_iso(), item.id),
    )


def refresh_run(conn: psycopg.Connection, run_id: str) -> None:
    now = now_iso()
    conn.execute(
        """UPDATE discovery_runs r SET
             done_items = c.done, failed_items = c.failed,
             status = CASE WHEN c.open > 0 THEN 'running'
                           WHEN c.done = 0 AND c.failed > 0 THEN 'failed'
                           ELSE 'done' END,
             finished_at = CASE WHEN c.open = 0 THEN COALESCE(r.finished_at, %(now)s) ELSE NULL END,
             updated_at = %(now)s
           FROM (SELECT COUNT(*) FILTER (WHERE status = 'done') AS done,
                        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                        COUNT(*) FILTER (WHERE status IN ('pending', 'running')) AS open
                 FROM discovery_run_items WHERE run_id = %(run)s) c
           WHERE r.id = %(run)s""",
        {"now": now, "run": run_id},
    )


def retry_failed(conn: psycopg.Connection, run_id: str) -> int:
    cur = conn.execute(
        """UPDATE discovery_run_items SET status = 'pending', attempts = 0, last_error = NULL, updated_at = %s
           WHERE run_id = %s AND status = 'failed'""",
        (now_iso(), run_id),
    )
    refresh_run(conn, run_id)
    return cur.rowcount or 0


def open_item_count(conn: psycopg.Connection, *, max_attempts: int) -> int:
    return conn.execute(
        """SELECT COUNT(*) AS n FROM discovery_run_items
           WHERE attempts < %s AND (status = 'pending' OR (status = 'running' AND lease_until < %s))""",
        (max_attempts, now_iso()),
    ).fetchone()["n"]


def _run_dto(run: dict[str, Any], totals: Counter | None = None, errors: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "id": run["id"],
        "kind": run["kind"],
        "runKey": run["run_key"],
        "status": run["status"],
        "totalItems": run["total_items"],
        "doneItems": run["done_items"],
        "failedItems": run["failed_items"],
        "createdBy": run["created_by"],
        "createdAt": run["created_at"],
        "updatedAt": run["updated_at"],
        "finishedAt": run["finished_at"],
        "totals": dict(totals or {}),
        "recentErrors": errors or [],
    }


def _sum_results(conn: psycopg.Connection, run_ids: list[str]) -> dict[str, Counter]:
    totals: dict[str, Counter] = {rid: Counter() for rid in run_ids}
    if not run_ids:
        return totals
    for row in conn.execute(
        "SELECT run_id, result_json FROM discovery_run_items WHERE run_id = ANY(%s) AND result_json IS NOT NULL",
        (run_ids,),
    ).fetchall():
        try:
            data = json.loads(row["result_json"])
        except ValueError:
            continue
        for key, value in data.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                totals[row["run_id"]][key] += value
    return totals


def list_runs(conn: psycopg.Connection, *, limit: int = 20) -> list[dict[str, Any]]:
    runs = conn.execute("SELECT * FROM discovery_runs ORDER BY created_at DESC LIMIT %s", (limit,)).fetchall()
    totals = _sum_results(conn, [r["id"] for r in runs])
    return [_run_dto(r, totals.get(r["id"])) for r in runs]


def get_run(conn: psycopg.Connection, run_id: str) -> dict[str, Any] | None:
    run = conn.execute("SELECT * FROM discovery_runs WHERE id = %s", (run_id,)).fetchone()
    if not run:
        return None
    errors = conn.execute(
        """SELECT ref_id, last_error, attempts, status FROM discovery_run_items
           WHERE run_id = %s AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 25""",
        (run_id,),
    ).fetchall()
    return _run_dto(
        run,
        _sum_results(conn, [run_id]).get(run_id),
        [{"refId": e["ref_id"], "error": e["last_error"], "attempts": e["attempts"], "status": e["status"]} for e in errors],
    )
