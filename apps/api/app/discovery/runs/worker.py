"""Budgeted tick: claim leased items, dispatch by kind, record outcomes, repeat until the
time budget is used. Anything left waits for the next tick (scan/drain crons, or the admin
page while it is open), so no single request runs unbounded."""

from __future__ import annotations

import logging
import time
from typing import Any

import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.jobs import scan
from app.discovery.people import importer
from app.discovery.runs import store
from app.discovery.runs.store import ClaimedItem, ItemOutcome

logger = logging.getLogger("aavedak.discovery.worker")

HANDLERS = {
    scan.ITEM_KIND: lambda conn, settings, items: scan.scan_items(conn, settings, items),
    importer.ITEM_KIND: lambda conn, settings, items: importer.process_items(conn, items),
}


def process_tick(
    conn: psycopg.Connection,
    settings: DiscoverySettings,
    *,
    budget_seconds: float | None = None,
    kinds: list[str] | None = None,
) -> dict[str, Any]:
    started = time.monotonic()
    budget = budget_seconds if budget_seconds is not None else settings.discovery_tick_budget_seconds
    # Stop claiming new work when a batch might not finish inside the budget.
    reserve = settings.discovery_http_timeout_seconds + 5
    processed = succeeded = failed = 0
    touched_runs: set[str] = set(store.sweep_exhausted(conn, max_attempts=settings.discovery_max_attempts))

    while time.monotonic() - started < max(budget - reserve, 1):
        items = store.claim_items(
            conn,
            limit=settings.discovery_fetch_concurrency,
            lease_seconds=settings.discovery_lease_seconds,
            max_attempts=settings.discovery_max_attempts,
            kinds=kinds,
        )
        if not items:
            break
        by_kind: dict[str, list[ClaimedItem]] = {}
        for item in items:
            by_kind.setdefault(item.kind, []).append(item)
            touched_runs.add(item.run_id)
        for kind, group in by_kind.items():
            handler = HANDLERS.get(kind)
            if handler is None:
                outcomes = {i.id: ItemOutcome(False, {}, f"No handler for {kind}", retryable=False) for i in group}
            else:
                outcomes = handler(conn, settings, group)
            for item in group:
                outcome = outcomes.get(item.id) or ItemOutcome(False, {}, "Handler returned no outcome")
                processed += 1
                if outcome.ok:
                    succeeded += 1
                    store.complete_item(conn, item.id, outcome.result)
                else:
                    failed += 1
                    store.fail_item(
                        conn,
                        item,
                        outcome.error or "failed",
                        max_attempts=settings.discovery_max_attempts,
                        retryable=outcome.retryable,
                    )

    for run_id in touched_runs:
        store.refresh_run(conn, run_id)
    remaining = store.open_item_count(conn, max_attempts=settings.discovery_max_attempts)
    elapsed = round(time.monotonic() - started, 2)
    logger.info("tick processed=%s ok=%s failed=%s remaining=%s in %ss", processed, succeeded, failed, remaining, elapsed)
    return {
        "processed": processed,
        "succeeded": succeeded,
        "failed": failed,
        "remaining": remaining,
        "elapsedSeconds": elapsed,
    }
