"""Scan company sources: fetch + normalize in worker threads (network-bound, pure), then
write each company's results on the main connection as soon as it finishes.

Per company: ingest (incremental upsert) → recommend its new jobs → record source status.
A failing source only fails its own run item.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import httpx
import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.jobs import ranking, registry, store
from app.discovery.jobs.models import FetchResult, SourceTarget
from app.discovery.jobs.normalize import NormalizeResult, normalize_postings
from app.discovery.jobs.providers import ProviderError, UnsupportedPage, get_provider
from app.discovery.jobs.providers.base import make_client
from app.discovery.jobs.providers.smartrecruiters import SmartRecruitersProvider
from app.discovery.people import store as people_store
from app.discovery.runs.store import ClaimedItem, ItemOutcome
from app.discovery.timeutil import now_iso

logger = logging.getLogger("aavedak.discovery.scan")

ITEM_KIND = "job_source"


def _fetch_and_normalize(
    client: httpx.Client, target: SourceTarget, known: frozenset[str], settings: DiscoverySettings
) -> tuple[FetchResult, NormalizeResult]:
    provider = get_provider(target.provider)
    if isinstance(provider, SmartRecruitersProvider):
        fetched = provider.fetch(client, target, known)
    else:
        fetched = provider.fetch(client, target)
    normalized = normalize_postings(
        fetched.postings,
        max_years_exclusive=settings.junior_max_years_exclusive,
        include_internships=settings.include_internships,
    )
    return fetched, normalized


def scan_items(
    conn: psycopg.Connection, settings: DiscoverySettings, items: list[ClaimedItem]
) -> dict[str, ItemOutcome]:
    outcomes: dict[str, ItemOutcome] = {}
    targets: dict[str, SourceTarget] = {}
    for item in items:
        target = registry.load_target(conn, item.ref_id or "")
        if target is None:
            outcomes[item.id] = ItemOutcome(True, {"skipped": 1, "reason": "source_removed"})
        else:
            targets[item.id] = target
    if not targets:
        return outcomes

    known = {
        item_id: store.known_external_ids(conn, t.provider, t.id) if t.provider == "smartrecruiters" else frozenset()
        for item_id, t in targets.items()
    }
    scan_started = now_iso()
    user_contexts: dict[str, ranking.UserContext] = {}

    with make_client() as client, ThreadPoolExecutor(max_workers=settings.discovery_fetch_concurrency) as pool:
        futures = {
            pool.submit(_fetch_and_normalize, client, target, known[item_id], settings): item_id
            for item_id, target in targets.items()
        }
        for future in as_completed(futures):
            item_id = futures[future]
            target = targets[item_id]
            try:
                fetched, normalized = future.result()
            except UnsupportedPage as exc:
                registry.record_scan(conn, target.id, ok=False, error=str(exc), counts={"unsupported": 1})
                outcomes[item_id] = ItemOutcome(False, {}, str(exc), retryable=False)
                continue
            except ProviderError as exc:
                registry.record_scan(conn, target.id, ok=False, error=str(exc), counts={})
                outcomes[item_id] = ItemOutcome(False, {}, str(exc), retryable=exc.retryable)
                continue
            except Exception as exc:  # noqa: BLE001 — unexpected parser bug: isolate to this source
                logger.exception("scan failed for %s/%s", target.provider, target.token)
                registry.record_scan(conn, target.id, ok=False, error=f"Unexpected error: {exc}", counts={})
                outcomes[item_id] = ItemOutcome(False, {}, f"Unexpected error: {exc.__class__.__name__}")
                continue

            try:
                stats = store.ingest_company(
                    conn,
                    target,
                    normalized.jobs,
                    complete=fetched.complete,
                    scan_started_at=scan_started,
                    expiry_days=settings.job_expiry_days,
                )
                recommended = ranking.recommend(
                    conn, settings, job_ids=stats.new_job_ids, contexts=user_contexts
                )
                people_links = people_store.link_jobs_to_company_people(conn, stats.new_job_ids)
            except psycopg.Error as exc:
                logger.exception("ingest failed for %s/%s", target.provider, target.token)
                outcomes[item_id] = ItemOutcome(False, {}, f"Database error: {exc.__class__.__name__}")
                continue

            skipped = normalized.skipped + stats.skipped
            counts = {
                "fetched": len(fetched.postings),
                "kept": len(normalized.jobs),
                **stats.as_dict(),
                "skipped": dict(skipped),
                "recommended": sum(recommended.values()),
                "peopleLinks": people_links,
            }
            registry.record_scan(conn, target.id, ok=True, error=None, counts=counts)
            outcomes[item_id] = ItemOutcome(
                True,
                {
                    "fetched": counts["fetched"],
                    "kept": counts["kept"],
                    "inserted": stats.inserted,
                    "linked": stats.linked,
                    "updated": stats.updated,
                    "unchanged": stats.unchanged,
                    "closed": stats.closed,
                    "recommended": counts["recommended"],
                    "peopleLinks": people_links,
                    "skipped": sum(skipped.values()),
                },
            )
    return outcomes
