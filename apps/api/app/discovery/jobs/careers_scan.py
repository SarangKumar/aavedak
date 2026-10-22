"""Run items of kind `career_page`: crawl each company's own careers page in worker
threads (network-bound), then write its jobs on the main connection as each finishes.

Jobs are stored under source key `careers` (job_sources.source_key / jobs.feed_source),
with the page row as `company_source_id`. Store rules treat it like a career-page source:
its link wins over a board's, a posting with a stored job's exact URL links to that job,
and only a complete read (an embedded platform's full list) may close jobs.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout

import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.jobs import career_pages, company_discovery, health, ranking, store
from app.discovery.jobs.careers_crawl import CareerPage, CrawlResult, crawl, make_crawl_client
from app.discovery.jobs.models import SourceTarget
from app.discovery.jobs.normalize import normalize_postings
from app.discovery.people import store as people_store
from app.discovery.runs.store import ClaimedItem, ItemOutcome
from app.discovery.timeutil import now_iso

logger = logging.getLogger("aavedak.discovery.careers")

ITEM_KIND = "career_page"
SOURCE_KEY = "careers"

CRAWL_SECONDS = 45.0  # per-page crawl deadline when the tick has room
WRITE_RESERVE_SECONDS = 12.0  # kept back for ingest/record writes after the crawls
MIN_TICK_SECONDS = 35.0  # the worker claims careers items only with this much tick time left
DEFAULT_BATCH_SECONDS = 90.0  # hard cap for a batch when no tick deadline is given


def page_target(page: CareerPage, company_name: str, url: str | None) -> SourceTarget:
    return SourceTarget(
        id=page.id,
        company_name=company_name,
        provider=SOURCE_KEY,
        token=page.domain,
        careers_url=url or page.careers_url,
    )


def _crawl_safe(client, page: CareerPage, deadline_seconds: float) -> CrawlResult:
    try:
        return crawl(client, page, deadline_seconds=deadline_seconds)
    except Exception as exc:  # noqa: BLE001 — a parser bug only fails this page
        logger.exception("careers crawl failed for %s", page.careers_url)
        return CrawlResult("error", error=f"Unexpected error: {exc.__class__.__name__}")


def process_items(
    conn: psycopg.Connection,
    settings: DiscoverySettings,
    items: list[ClaimedItem],
    *,
    deadline: float | None = None,
) -> dict[str, ItemOutcome]:
    """`deadline` is the tick's `time.monotonic()` end. Each page's crawl is sized to finish
    before it, and the batch is hard-capped there too: a page still running (a stalled
    socket, a slow platform API) is left for the next tick, retryable, never recorded."""
    outcomes: dict[str, ItemOutcome] = {}
    pages: dict[str, tuple[CareerPage, str]] = {}
    for item in items:
        loaded = career_pages.load(conn, item.ref_id or "")
        if loaded is None:
            outcomes[item.id] = ItemOutcome(True, {"skipped": 1, "reason": "page_removed"})
            continue
        page, source_name = loaded
        pages[item.id] = (page, source_name or page.company_name)
    if not pages:
        return outcomes

    scan_started = now_iso()
    contexts: dict[str, ranking.UserContext] = {}
    end = deadline if deadline is not None else time.monotonic() + DEFAULT_BATCH_SECONDS
    crawl_seconds = max(10.0, min(CRAWL_SECONDS, end - time.monotonic() - WRITE_RESERVE_SECONDS))
    client = make_crawl_client(min(settings.discovery_http_timeout_seconds, 15.0))
    pool = ThreadPoolExecutor(max_workers=settings.discovery_fetch_concurrency)
    try:
        futures = {pool.submit(_crawl_safe, client, page, crawl_seconds): item_id for item_id, (page, _) in pages.items()}
        try:
            for future in as_completed(futures, timeout=max(1.0, end - time.monotonic() - 3)):
                _handle(conn, settings, futures[future], future.result(), pages, outcomes, scan_started, contexts)
        except FuturesTimeout:
            for item_id in futures.values():
                if item_id not in outcomes:
                    logger.warning("careers crawl did not finish in this tick: %s", pages[item_id][0].careers_url)
                    outcomes[item_id] = ItemOutcome(
                        False, {}, "Careers page read did not finish in this tick.", retryable=True
                    )
    finally:
        # Never wait for a stalled crawl: closing the client makes its pending request fail fast.
        pool.shutdown(wait=False, cancel_futures=True)
        client.close()
    return outcomes


def _handle(
    conn: psycopg.Connection,
    settings: DiscoverySettings,
    item_id: str,
    result: CrawlResult,
    pages: dict[str, tuple[CareerPage, str]],
    outcomes: dict[str, ItemOutcome],
    scan_started: str,
    contexts: dict[str, ranking.UserContext],
) -> None:
    page, company_name = pages[item_id]
    counts: dict[str, object] = {
        "status": result.status,
        "strategy": result.strategy,
        "fetched": len(result.postings),
        "requests": result.requests,
    }
    if result.status != "ok":
        career_pages.record(conn, page.id, result, kept=0, counts=counts)
        # No job data / blocked is an answer, not a failure worth retrying today.
        outcomes[item_id] = ItemOutcome(
            result.status != "error", counts, result.error, retryable=result.status == "error"
        )
        return
    for posting in result.postings:
        posting.company_name = company_name
    normalized = normalize_postings(
        result.postings,
        max_min_years=settings.ingest_max_min_years,
        include_internships=settings.include_internships,
        max_age_days=settings.job_expiry_days,
    )
    guard = health.guard_complete(
        complete=result.complete, fetched=len(result.postings), previous=page.last_posting_count
    )
    if guard.guarded:
        logger.warning(
            "outage guard: %s returned %s postings after %s — not closing jobs",
            page.careers_url, len(result.postings), guard.previous,
        )
        counts["outageGuard"] = {"previous": guard.previous, "fetched": len(result.postings)}
    try:
        stats = store.ingest_company(
            conn,
            page_target(page, company_name, result.final_url),
            normalized.jobs,
            complete=guard.complete,
            scan_started_at=scan_started,
            expiry_days=settings.job_expiry_days,
        )
        # The page runs on a hiring platform we can read but whose board is not registered:
        # add it, so the jobs survive the page switching to client-side rendering.
        registered_board = (
            company_discovery.register_embed(
                conn,
                company_name=company_name,
                provider=result.embed.provider,
                token=result.embed.token,
                careers_url=result.final_url or page.careers_url,
            )
            if result.embed
            else None
        )
        recommended = ranking.recommend(conn, settings, job_ids=list(stats.new_job_ids), contexts=contexts)
        people_links = people_store.link_jobs_to_company_people(conn, list(stats.new_job_ids))
    except psycopg.Error as exc:
        logger.exception("careers ingest failed for %s", page.careers_url)
        outcomes[item_id] = ItemOutcome(False, {}, f"Database error: {exc.__class__.__name__}")
        return
    skipped = normalized.skipped + stats.skipped
    counts.update(
        {
            "kept": len(normalized.jobs),
            **stats.as_dict(),
            "skipped": dict(skipped),
            "recommended": sum(recommended.values()),
            "peopleLinks": people_links,
        }
    )
    career_pages.record(
        conn, page.id, result, kept=len(normalized.jobs), counts=counts, guarded=guard.guarded
    )
    outcomes[item_id] = ItemOutcome(
        True,
        {
            "strategy": result.strategy,
            "fetched": len(result.postings),
            "kept": len(normalized.jobs),
            "inserted": stats.inserted,
            "linked": stats.linked,
            "officialLinks": stats.official_links,
            "updated": stats.updated,
            "unchanged": stats.unchanged,
            "closed": stats.closed,
            "recommended": counts["recommended"],
            "peopleLinks": people_links,
            "registeredBoard": bool(registered_board),
            "outageGuard": guard.guarded,
            "skipped": sum(skipped.values()),
        },
    )
