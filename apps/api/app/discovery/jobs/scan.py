"""Scan company sources: fetch + normalize in worker threads (network-bound, pure), then
write each company's results on the main connection as soon as it finishes.

Per company: ingest (incremental upsert) → recommend its new jobs → record source status.
A failing source only fails its own run item.
"""

from __future__ import annotations

import logging
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import httpx
import psycopg

from app.discovery.config import DiscoverySettings
from app.discovery.jobs import ranking, registry, store
from app.discovery.jobs.models import FetchResult, SourceTarget
from app.discovery.jobs.normalize import NormalizeResult, normalize_postings
from app.discovery.jobs.providers import ProviderError, UnsupportedPage, get_provider
from app.discovery.jobs.providers.base import make_client
from app.discovery.jobs.providers.jsonld import JsonLdProvider
from app.discovery.jobs.providers.smartrecruiters import SmartRecruitersProvider
from app.discovery.people import store as people_store
from app.discovery.runs.store import ClaimedItem, ItemOutcome
from app.discovery.timeutil import now_iso

logger = logging.getLogger("aavedak.discovery.scan")

ITEM_KIND = "job_source"


@dataclass
class OfficialRead:
    """One read of a company's official careers page (the primary source of truth)."""

    target: SourceTarget
    status: str  # ok | no_job_data | blocked | error
    fetched: int = 0
    normalized: NormalizeResult | None = None
    error: str | None = None


def official_target(target: SourceTarget) -> SourceTarget:
    """The official page as a career-page (`jsonld`) source of the same company source.
    Its own token keeps its posting ids apart from the board's."""
    return SourceTarget(
        id=target.id,
        company_name=target.company_name,
        provider="jsonld",
        token=f"official-{target.token}",
        careers_url=target.official_careers_url or "",
        company_id=target.company_id,
    )


def _normalize(postings, settings: DiscoverySettings) -> NormalizeResult:
    return normalize_postings(
        postings,
        max_min_years=settings.ingest_max_min_years,
        include_internships=settings.include_internships,
        max_age_days=settings.job_expiry_days,
    )


def _read_official(
    client: httpx.Client, target: SourceTarget, company_name: str, settings: DiscoverySettings
) -> OfficialRead:
    """Read the official page's published job data. Never raises: a page without job data,
    blocked by robots.txt or failing only sets its status — the board result still counts."""
    page = official_target(target)
    try:
        fetched = JsonLdProvider().fetch(client, page)
    except UnsupportedPage:
        return OfficialRead(page, "no_job_data")
    except ProviderError as exc:
        status = "blocked" if "robots" in str(exc).lower() else "error"
        return OfficialRead(page, status, error=str(exc))
    except Exception as exc:  # noqa: BLE001 — a page parser bug must not fail the board scan
        logger.exception("official page read failed for %s", target.official_careers_url)
        return OfficialRead(page, "error", error=f"Unexpected error: {exc.__class__.__name__}")
    # Use the board's company name so the same role merges into one job (dedupe key).
    for posting in fetched.postings:
        posting.company_name = company_name
    return OfficialRead(page, "ok", len(fetched.postings), _normalize(fetched.postings, settings))


def _fetch_and_normalize(
    client: httpx.Client, target: SourceTarget, known: frozenset[str], settings: DiscoverySettings
) -> tuple[FetchResult, NormalizeResult, OfficialRead | None]:
    provider = get_provider(target.provider)
    if isinstance(provider, SmartRecruitersProvider):
        fetched = provider.fetch(client, target, known)
    else:
        fetched = provider.fetch(client, target)
    normalized = _normalize(fetched.postings, settings)
    official = None
    if registry.official_page_due(target):
        names = Counter(p.company_name for p in fetched.postings if p.company_name)
        company_name = names.most_common(1)[0][0] if names else target.company_name
        official = _read_official(client, target, company_name, settings)
    return fetched, normalized, official


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
                fetched, normalized, official = future.result()
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
                new_job_ids = list(stats.new_job_ids)
                official_stats = None
                if official and official.status == "ok" and official.normalized and official.normalized.jobs:
                    # After the board, so page postings link to (and re-point) the board's jobs.
                    official_stats = store.ingest_company(
                        conn,
                        official.target,
                        official.normalized.jobs,
                        complete=False,  # pages may paginate: never close jobs from a page read
                        scan_started_at=scan_started,
                        expiry_days=settings.job_expiry_days,
                    )
                    new_job_ids += official_stats.new_job_ids
                registry.record_official(
                    conn,
                    target.id,
                    status=official.status if official else None,
                    hint=fetched.official_url_hint,
                )
                recommended = ranking.recommend(
                    conn, settings, job_ids=new_job_ids, contexts=user_contexts
                )
                people_links = people_store.link_jobs_to_company_people(conn, new_job_ids)
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
            if official:
                counts["officialPage"] = {
                    "status": official.status,
                    "fetched": official.fetched,
                    "kept": len(official.normalized.jobs) if official.normalized else 0,
                    **(official_stats.as_dict() if official_stats else {}),
                    **({"error": official.error} if official.error else {}),
                }
            registry.record_scan(conn, target.id, ok=True, error=None, counts=counts)
            outcomes[item_id] = ItemOutcome(
                True,
                {
                    "fetched": counts["fetched"],
                    "kept": counts["kept"],
                    "inserted": stats.inserted + (official_stats.inserted if official_stats else 0),
                    "linked": stats.linked + (official_stats.linked if official_stats else 0),
                    "officialLinks": official_stats.official_links if official_stats else 0,
                    "updated": stats.updated,
                    "unchanged": stats.unchanged,
                    "closed": stats.closed,
                    "recommended": counts["recommended"],
                    "peopleLinks": people_links,
                    "skipped": sum(skipped.values()),
                },
            )
    return outcomes
