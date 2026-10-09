"""Admin bulk people discovery: a CSV becomes a persistent run of fixed-size batches that
the tick worker processes (thousands of rows never hold one HTTP request open)."""

from __future__ import annotations

from typing import Any

import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.people import store
from app.discovery.people.normalize import PersonRow, parse_people_csv
from app.discovery.runs.store import ClaimedItem, ItemOutcome, create_run

RUN_KIND = "people_import"
ITEM_KIND = "people_batch"
MAX_ROWS = 50_000


def create_import_run(
    conn: psycopg.Connection, settings: DiscoverySettings, csv_text: str, *, created_by: str | None, source: str
) -> dict[str, Any]:
    parsed = parse_people_csv(csv_text)
    if parsed.header_error:
        raise ValueError(parsed.header_error)
    if not parsed.rows:
        raise ValueError("No valid rows (each row needs a name).")
    if len(parsed.rows) > MAX_ROWS:
        raise ValueError(f"Too many rows ({len(parsed.rows)}); split into files of at most {MAX_ROWS}.")
    size = settings.people_batch_size
    batches = [parsed.rows[i : i + size] for i in range(0, len(parsed.rows), size)]
    run, _ = create_run(
        conn,
        kind=RUN_KIND,
        items=[
            (ITEM_KIND, None, {"source": source, "rows": [r.to_payload() for r in batch]})
            for batch in batches
        ],
        created_by=created_by,
    )
    return {
        "runId": run["id"],
        "rows": len(parsed.rows),
        "batches": len(batches),
        "invalidRows": len(parsed.invalid),
        "phonesIgnored": parsed.phones_ignored,
    }


def process_items(conn: psycopg.Connection, items: list[ClaimedItem]) -> dict[str, ItemOutcome]:
    store.backfill_people_keys(conn)
    outcomes: dict[str, ItemOutcome] = {}
    company_cache: dict[str, str] = {}
    for item in items:
        counts = {"created": 0, "enriched": 0, "unchanged": 0, "ambiguous": 0, "relevanceLinks": 0}
        try:
            with conn.transaction():
                touched: list[str] = []
                source = str(item.payload.get("source") or "admin_import")
                for raw in item.payload.get("rows", []):
                    row = PersonRow(**{k: raw.get(k) for k in PersonRow.__dataclass_fields__})
                    outcome = store.upsert_person(conn, row, source=source, company_cache=company_cache)
                    counts[outcome.action] += 1
                    counts["ambiguous"] += int(outcome.ambiguous)
                    touched.append(outcome.person_id)
                counts["relevanceLinks"] = store.link_person_to_company_jobs(conn, touched)
        except psycopg.Error as exc:
            company_cache.clear()  # rolled back; cached ids may not exist
            outcomes[item.id] = ItemOutcome(False, {}, f"Database error: {exc.__class__.__name__}: {exc}"[:300])
            continue
        outcomes[item.id] = ItemOutcome(True, counts)
    return outcomes
