"""Integration tests for the SQL paths (ingest, ranking, expiry, runs, scan, people).

Needs a disposable Postgres: set TEST_DATABASE_URL (a superuser URL; a fresh database is
created per module and dropped afterwards). Skipped otherwise. The web schema is applied by
executing the DDL in apps/web/lib/app-db.ts, so these tests also exercise that file.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import timedelta
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row

from app.discovery import schema
from app.discovery.config import DiscoverySettings
from app.discovery.jobs import expiry, ranking, registry, scan, store
from app.discovery.jobs.models import FetchResult, NormalizedJob, RawPosting, SourceTarget
from app.discovery.jobs.text import content_hash, dedupe_key
from app.discovery.people import importer
from app.discovery.runs import store as runs
from app.discovery.runs.worker import process_tick
from app.discovery.timeutil import iso_minus, now_iso, to_iso, utcnow

ADMIN_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not ADMIN_URL, reason="TEST_DATABASE_URL not set")
APP_DB_TS = Path(__file__).resolve().parents[2] / "web" / "lib" / "app-db.ts"


def web_ddl() -> list[str]:
    """Static DDL statements from app-db.ts (parameterized statements and queries are skipped)."""
    # Up to the first closing backtick, so a query chained with `.catch(...)` stays one block.
    blocks = re.findall(r"await db`([^`]*)`", APP_DB_TS.read_text(encoding="utf-8"))
    return [b for b in blocks if "${" not in b and not b.lstrip().upper().startswith("SELECT")]


@pytest.fixture(scope="module")
def conn():
    name = f"disc_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f'CREATE DATABASE "{name}"')
    url = re.sub(r"/[^/?]*(\?|$)", f"/{name}\\1", ADMIN_URL, count=1) if "/postgres" in ADMIN_URL else ADMIN_URL
    c = psycopg.connect(url, autocommit=True, row_factory=dict_row, prepare_threshold=None)
    for stmt in web_ddl():
        c.execute(stmt)
    schema._ready = False
    schema.ensure_schema(c)
    yield c
    c.close()
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


@pytest.fixture
def settings() -> DiscoverySettings:
    return DiscoverySettings(discovery_daily_limit=3, discovery_min_match_score=0)


def make_source(conn, provider="greenhouse", token=None) -> SourceTarget:
    token = token or f"acme{uuid.uuid4().hex[:6]}"
    registry._insert(conn, company_name="Acme", provider=provider, token=token,
                     careers_url=f"https://job-boards.greenhouse.io/{token}", sector="software", origin="test")
    row = conn.execute("SELECT id FROM company_sources WHERE provider = %s AND token = %s", (provider, token)).fetchone()
    return registry.load_target(conn, row["id"])


def njob(ext: str, title="Software Engineer I", posted: str | None = None, desc="Python services", loc="Bengaluru") -> NormalizedJob:
    return NormalizedJob(
        external_id=ext, title=title, company_name="Acme", location=loc, url=f"https://acme.example/{ext}",
        description=desc, posted_at=posted, min_years=0, dedupe_key=dedupe_key("Acme", title, loc),
        content_hash=content_hash({"t": title, "d": desc, "p": posted, "l": loc}),
    )


def add_user(conn, *, skills=("python",), enabled=True) -> str:
    user_id = f"u_{uuid.uuid4().hex[:8]}"
    now = now_iso()
    conn.execute(
        """INSERT INTO profiles (user_id, username, created_at, updated_at, onboarding_complete,
             approval_status, skills_json) VALUES (%s, %s, %s, %s, 1, 'approved', %s)""",
        (user_id, user_id, now, now, json.dumps(list(skills))),
    )
    if not enabled:
        conn.execute(
            """INSERT INTO user_preferences (user_id, updated_at, discovery_enabled) VALUES (%s, %s, 0)""",
            (user_id, now),
        )
    return user_id


# --- ingest --------------------------------------------------------------------------------


def test_ingest_insert_unchanged_update_close_reopen(conn):
    target = make_source(conn)
    t0 = iso_minus(5)
    stats = store.ingest_company(conn, target, [njob("a:1", posted="2026-10-01T00:00:00.000Z"), njob("a:2", title="QA Engineer")],
                                 complete=True, scan_started_at=t0, expiry_days=30)
    assert (stats.inserted, len(stats.new_job_ids)) == (2, 2)

    # Same content → unchanged only.
    stats = store.ingest_company(conn, target, [njob("a:1", posted="2026-10-01T00:00:00.000Z"), njob("a:2", title="QA Engineer")],
                                 complete=True, scan_started_at=iso_minus(1), expiry_days=30)
    assert (stats.inserted, stats.updated, stats.unchanged) == (0, 0, 2)

    # Changed description + later posted date: updated, posted_at stays the earliest.
    changed = njob("a:1", posted="2026-10-05T00:00:00.000Z", desc="New description")
    stats = store.ingest_company(conn, target, [changed, njob("a:2", title="QA Engineer")],
                                 complete=True, scan_started_at=iso_minus(1), expiry_days=30)
    assert stats.updated == 1
    job = conn.execute("""SELECT j.* FROM jobs j JOIN job_sources s ON s.job_id = j.id
                          WHERE s.external_id = 'a:1'""").fetchone()
    assert job["description"] == "New description" and job["posted_at"] == "2026-10-01T00:00:00.000Z"

    # a:2 disappears from a complete fetch → closed; it reappears → reopened.
    scan_start = now_iso()
    stats = store.ingest_company(conn, target, [changed], complete=True, scan_started_at=scan_start, expiry_days=30)
    assert stats.closed == 1
    stats = store.ingest_company(conn, target, [changed, njob("a:2", title="QA Engineer")],
                                 complete=True, scan_started_at=now_iso(), expiry_days=30)
    assert stats.reopened == 1


def test_incomplete_fetch_never_closes(conn):
    target = make_source(conn)
    store.ingest_company(conn, target, [njob("b:1")], complete=True, scan_started_at=iso_minus(5), expiry_days=30)
    stats = store.ingest_company(conn, target, [], complete=False, scan_started_at=now_iso(), expiry_days=30)
    assert stats.closed == 0


def test_cross_source_duplicate_links_and_already_expired_is_skipped(conn):
    first, second = make_source(conn), make_source(conn, provider="lever")
    store.ingest_company(conn, first, [njob("c:1", title="Data Engineer")], complete=True,
                         scan_started_at=iso_minus(5), expiry_days=30)
    old = to_iso(utcnow() - timedelta(days=40))
    stats = store.ingest_company(conn, second, [njob("d:1", title="Data Engineer"), njob("d:2", title="Old Role", posted=old)],
                                 complete=True, scan_started_at=iso_minus(5), expiry_days=30)
    assert stats.linked == 1 and stats.inserted == 0 and stats.skipped["already_expired"] == 1
    refs = conn.execute("""SELECT COUNT(DISTINCT job_id) AS jobs, COUNT(*) AS refs FROM job_sources
                           WHERE external_id IN ('c:1', 'd:1')""").fetchone()
    assert (refs["jobs"], refs["refs"]) == (1, 2)


def test_career_page_is_preferred_and_never_closed_by_the_board(conn):
    board = make_source(conn)
    page = scan.official_target(
        SourceTarget(id=board.id, company_name="Acme", provider=board.provider, token=board.token,
                     careers_url=board.careers_url, official_careers_url="https://acme.example/careers")
    )
    store.ingest_company(conn, board, [njob("e:1", title="Platform Engineer")], complete=True,
                         scan_started_at=iso_minus(5), expiry_days=30)

    # The careers page lists the same role (with pay): linked, and the job now links there.
    on_page = njob("official:e:1", title="Platform Engineer")
    on_page.url, on_page.salary = "https://acme.example/careers/platform-engineer", "₹8 L / year"
    only_on_page = njob("official:e:2", title="Site Reliability Engineer")
    stats = store.ingest_company(conn, page, [on_page, only_on_page], complete=False,
                                 scan_started_at=now_iso(), expiry_days=30)
    assert (stats.linked, stats.inserted) == (1, 1) and stats.official_links >= 1
    job = conn.execute("""SELECT j.url, j.salary FROM jobs j JOIN job_sources s ON s.job_id = j.id
                          WHERE s.external_id = 'e:1'""").fetchone()
    assert (job["url"], job["salary"]) == ("https://acme.example/careers/platform-engineer", "₹8 L / year")

    # A later board change keeps the careers-page link, and a complete board scan never
    # closes the role that only the careers page lists.
    changed = njob("e:1", title="Platform Engineer", desc="Updated description")
    stats = store.ingest_company(conn, board, [changed], complete=True, scan_started_at=now_iso(), expiry_days=30)
    assert stats.updated == 1 and stats.closed == 0
    job = conn.execute("""SELECT j.url, j.salary FROM jobs j JOIN job_sources s ON s.job_id = j.id
                          WHERE s.external_id = 'e:1'""").fetchone()
    assert job["url"] == "https://acme.example/careers/platform-engineer"
    assert job["salary"] == "₹8 L / year"  # an update without pay never erases it
    page_only = conn.execute("""SELECT j.closed_at FROM jobs j JOIN job_sources s ON s.job_id = j.id
                                WHERE s.external_id = 'official:e:2'""").fetchone()
    assert page_only["closed_at"] is None


def test_career_page_posting_links_to_board_job_by_url(conn):
    board = make_source(conn)
    hosted = njob("f:1", title="Backend Engineer", loc="Bangalore")
    hosted.url = "https://acme.example/jobs/42"
    store.ingest_company(conn, board, [hosted], complete=True, scan_started_at=iso_minus(5), expiry_days=30)
    page = scan.official_target(
        SourceTarget(id=board.id, company_name="Acme", provider=board.provider, token=board.token,
                     careers_url=board.careers_url, official_careers_url="https://acme.example/jobs")
    )
    # Different city spelling, so the dedupe key differs — the identical URL still links it.
    same = njob("official:f:1", title="Backend Engineer", loc="Bengaluru")
    same.url = "https://acme.example/jobs/42"
    stats = store.ingest_company(conn, page, [same], complete=False, scan_started_at=now_iso(), expiry_days=30)
    assert (stats.linked, stats.inserted) == (1, 0)


def test_official_page_tracking(conn):
    target = make_source(conn)
    registry.record_official(conn, target.id, status=None, hint="https://careers.acme.example/")
    row = conn.execute("SELECT * FROM company_sources WHERE id = %s", (target.id,)).fetchone()
    assert (row["official_careers_url"], row["official_careers_origin"]) == ("https://careers.acme.example/", "detected")

    # An admin URL replaces it; a later hint never overwrites a known page.
    assert registry.set_official_url(conn, target.id, "https://acme.example/careers")
    registry.record_official(conn, target.id, status="no_job_data", hint="https://other.example/")
    row = conn.execute("SELECT * FROM company_sources WHERE id = %s", (target.id,)).fetchone()
    assert (row["official_careers_url"], row["official_careers_origin"], row["official_status"]) == (
        "https://acme.example/careers", "admin", "no_job_data")
    loaded = registry.load_target(conn, target.id)
    assert not registry.official_page_due(loaded)  # re-checked weekly, not every scan

    assert registry.set_official_url(conn, target.id, None)
    assert registry.load_target(conn, target.id).official_careers_url is None


# --- ranking ---------------------------------------------------------------------------------


def test_recommend_respects_cap_preference_and_is_idempotent(conn, settings):
    user = add_user(conn)
    disabled = add_user(conn, enabled=False)
    target = make_source(conn)
    stats = store.ingest_company(conn, target, [njob(f"r:{i}", title=f"Python Engineer {i}") for i in range(5)],
                                 complete=True, scan_started_at=iso_minus(5), expiry_days=30)
    created = ranking.recommend(conn, settings, job_ids=stats.new_job_ids)
    assert created.get(user) == 3 and disabled not in created
    assert ranking.recommend(conn, settings, job_ids=None).get(user) is None  # cap reached today
    n = conn.execute("SELECT COUNT(*) AS n FROM user_job_state WHERE user_id = %s", (user,)).fetchone()["n"]
    assert n == 3
    scores = conn.execute("SELECT COUNT(*) AS n FROM job_scores WHERE user_id = %s", (user,)).fetchone()["n"]
    assert scores == 3


# --- expiry ------------------------------------------------------------------------------------


def test_expiry_marks_jobs_only_and_never_changes_application_status(conn, settings):
    target = make_source(conn)
    store.ingest_company(conn, target, [njob("e:1", title="Firmware Engineer")], complete=True,
                         scan_started_at=iso_minus(5), expiry_days=30)
    job_id = conn.execute("SELECT job_id FROM job_sources WHERE external_id = 'e:1'").fetchone()["job_id"]
    conn.execute("UPDATE jobs SET posted_at = %s WHERE id = %s", (to_iso(utcnow() - timedelta(days=31)), job_id))
    now = now_iso()
    statuses = {"app_bookmarked": "bookmarked", "app_applied": "applied", "app_ghosted": "ghosted",
                "app_interview": "interview"}
    for app_id, status in statuses.items():
        conn.execute(
            """INSERT INTO applications (id, user_id, company_name, role, location, job_id, status, created_at, updated_at)
               VALUES (%s, 'u1', 'Acme', 'Firmware Engineer', 'Pune', %s, %s, %s, %s)""",
            (app_id, job_id, status, now, now),
        )
    # A manual (user-owned) job never expires.
    conn.execute("""INSERT INTO jobs (id, user_id, title, company, location, created_at, updated_at, posted_at)
                    VALUES ('manual1', 'u1', 'Old manual', 'X', 'Y', %s, %s, '2020-01-01T00:00:00.000Z')""", (now, now))

    result = expiry.run_expiry(conn, settings)
    assert result["jobsExpired"] == 1 and "applicationsRejected" not in result
    assert conn.execute("SELECT expired_at FROM jobs WHERE id = %s", (job_id,)).fetchone()["expired_at"] is not None
    rows = {r["id"]: r for r in conn.execute(
        "SELECT id, status, status_reason FROM applications WHERE job_id = %s", (job_id,)).fetchall()}
    assert {k: r["status"] for k, r in rows.items()} == statuses
    assert all(r["status_reason"] is None for r in rows.values())
    events = conn.execute("SELECT COUNT(*) AS n FROM application_events WHERE application_id = ANY(%s)",
                          (list(statuses),)).fetchone()
    assert events["n"] == 0
    assert conn.execute("SELECT expired_at FROM jobs WHERE id = 'manual1'").fetchone()["expired_at"] is None
    # Re-running is a no-op.
    assert expiry.run_expiry(conn, settings)["jobsExpired"] == 0


# --- runs ---------------------------------------------------------------------------------------


def test_run_leasing_retry_and_idempotent_key(conn):
    run, created = runs.create_run(conn, kind="test", run_key="k1", items=[("noop", "a", {}), ("noop", "b", {})])
    again, created_again = runs.create_run(conn, kind="test", run_key="k1", items=[("noop", "c", {})])
    assert created and not created_again and again["id"] == run["id"]

    claimed = runs.claim_items(conn, limit=10, lease_seconds=60, max_attempts=2, kinds=["noop"])
    assert {c.ref_id for c in claimed} == {"a", "b"}
    assert runs.claim_items(conn, limit=10, lease_seconds=60, max_attempts=2, kinds=["noop"]) == []

    a, b = sorted(claimed, key=lambda c: c.ref_id)
    runs.complete_item(conn, a.id, {"inserted": 2})
    runs.fail_item(conn, b, "boom", max_attempts=2)  # attempt 1 of 2 → back to pending
    [retry] = runs.claim_items(conn, limit=10, lease_seconds=60, max_attempts=2, kinds=["noop"])
    runs.fail_item(conn, retry, "boom again", max_attempts=2)  # attempt 2 → failed
    runs.refresh_run(conn, run["id"])
    detail = runs.get_run(conn, run["id"])
    assert (detail["status"], detail["doneItems"], detail["failedItems"]) == ("done", 1, 1)
    assert detail["totals"]["inserted"] == 2
    assert runs.retry_failed(conn, run["id"]) == 1


# --- scan + worker (provider stubbed; no network) --------------------------------------------------


class FakeProvider:
    key = "greenhouse"

    def fetch(self, client, target):
        return FetchResult([
            RawPosting(external_id=f"{target.token}:1", title="Graduate Engineer Trainee", company_name="Acme",
                       url="https://acme.example/1", locations=["Chennai, India"], description="Freshers welcome",
                       posted_at=now_iso()),
            RawPosting(external_id=f"{target.token}:2", title="Senior Engineer", company_name="Acme",
                       url=None, locations=["Chennai, India"]),
        ])


def test_tick_scans_sources_end_to_end(conn, settings, monkeypatch):
    monkeypatch.setattr(scan, "get_provider", lambda key: FakeProvider())
    target = make_source(conn)
    run, _ = runs.create_run(conn, kind="jobs_scan", items=[(scan.ITEM_KIND, target.id, {})])
    result = process_tick(conn, settings, budget_seconds=60, kinds=[scan.ITEM_KIND])
    assert result["succeeded"] >= 1
    detail = runs.get_run(conn, run["id"])
    assert detail["status"] == "done" and detail["totals"]["inserted"] == 1 and detail["totals"]["skipped"] == 1
    source = conn.execute("SELECT last_error, last_counts_json FROM company_sources WHERE id = %s", (target.id,)).fetchone()
    assert source["last_error"] is None and json.loads(source["last_counts_json"])["kept"] == 1


# --- people -------------------------------------------------------------------------------------------


def test_people_import_enriches_without_overwriting_and_links_jobs(conn, settings):
    target = make_source(conn)
    store.ingest_company(conn, target, [njob("p:1", title="Backend Engineer")], complete=True,
                         scan_started_at=iso_minus(5), expiry_days=30)
    now = now_iso()
    conn.execute(
        """INSERT INTO people (id, user_id, name, email, company, role_title, status, created_at, updated_at)
           VALUES ('p_user', 'u1', 'Jane Doe', NULL, 'Acme', 'Recruiter (user note)', 'active', %s, %s)""",
        (now, now),
    )
    csv_text = (
        "name,company,role,email,linkedin\n"
        "Jane Doe,Acme,Talent Acquisition,jane@acme.com,linkedin.com/in/janedoe\n"
        "Ravi Kumar,Acme,Backend Engineer,,\n"
    )
    info = importer.create_import_run(conn, settings, csv_text, created_by="admin@x", source="test")
    assert info["rows"] == 2
    process_tick(conn, settings, budget_seconds=60, kinds=[importer.ITEM_KIND])
    jane = conn.execute("SELECT * FROM people WHERE id = 'p_user'").fetchone()
    assert jane["role_title"] == "Recruiter (user note)"  # user value kept
    assert jane["email"] == "jane@acme.com" and jane["linkedin_url_normalized"] == "linkedin.com/in/janedoe"
    contact = conn.execute("SELECT verification FROM person_contacts WHERE person_id = 'p_user' AND kind = 'email'").fetchone()
    assert contact["verification"] == "unverified"
    links = conn.execute("SELECT COUNT(*) AS n FROM job_person_relevance").fetchone()["n"]
    assert links >= 2
    run = runs.get_run(conn, info["runId"])
    assert run["status"] == "done" and run["totals"]["created"] == 1 and run["totals"]["enriched"] == 1


# --- registry seed + manual scan guard ----------------------------------------------------------


def test_seed_import_is_batched_and_idempotent(conn):
    first = registry.import_seed(conn)
    again = registry.import_seed(conn)
    seed_size = len(registry.load_seed())
    assert first["added"] + first["existing"] == seed_size
    assert again == {"added": 0, "existing": seed_size}


def test_seed_import_skips_company_already_present_under_another_board(conn):
    row = registry.load_seed()[0]
    conn.execute(
        """INSERT INTO company_sources (id, company_name, provider, token, careers_url, origin,
             enabled, shard_seed, created_at, updated_at)
           VALUES ('cs_admin', %s, 'lever', 'admin-token', 'https://jobs.lever.co/admin-token',
                   'admin', 1, 1, '2026-01-01', '2026-01-01')""",
        (row["name"].upper() + "!",),
    )
    registry.import_seed(conn)
    same_name = conn.execute(
        "SELECT COUNT(*) AS n FROM company_sources WHERE provider = %s AND token = %s",
        (row["provider"], row["token"]),
    ).fetchone()["n"]
    assert same_name == 0


def test_manual_scan_resumes_instead_of_duplicating(conn):
    from app.discovery import router

    first = router.admin_scan_run(router.ScanRunBody(createdBy="admin@x"), conn)
    second = router.admin_scan_run(router.ScanRunBody(createdBy="admin@x"), conn)
    assert first["resumed"] is False and first["sources"] > 0
    assert second == {"runId": first["runId"], "sources": first["sources"], "resumed": True}


# --- careers pages (company's own site as the primary source) --------------------------------


def test_careers_seed_import_is_idempotent_and_links_board_by_name(conn):
    from app.discovery.jobs import career_pages

    career_pages.import_seed(conn)  # earlier tests may have synced it already (scan crons do)
    total = conn.execute("SELECT COUNT(*) AS n FROM career_pages WHERE origin = 'seed'").fetchone()["n"]
    assert total == len(career_pages.load_seed()) > 500
    assert career_pages.import_seed(conn)["added"] == 0
    assert conn.execute("SELECT COUNT(*) AS n FROM career_pages WHERE origin = 'seed'").fetchone()["n"] == total


def test_careers_page_job_links_to_board_job_and_wins_the_link(conn):
    from app.discovery.jobs import career_pages, careers_scan
    from app.discovery.jobs.careers_crawl import CareerPage, CrawlResult, Embed

    board = make_source(conn)
    board_job = njob("acme:900", title="Careers Path Engineer")
    store.ingest_company(conn, board, [board_job], complete=True, scan_started_at=now_iso(), expiry_days=30)
    page_id = f"pg_{uuid.uuid4().hex[:6]}"
    now = now_iso()
    conn.execute(
        """INSERT INTO career_pages (id, company_name, careers_url, domain, created_at, updated_at, company_source_id)
           VALUES (%s, 'Acme', %s, 'acme.example', %s, %s, %s)""",
        (page_id, f"https://acme.example/careers/{page_id}", now, now, board.id),
    )
    page = CareerPage(page_id, "Acme", f"https://acme.example/careers/{page_id}", "acme.example")
    # Same role (title + city) on the company's page, linking to the company's own site.
    page_job = NormalizedJob(**{**board_job.__dict__, "external_id": f"{page_id}:jsonld:9",
                                "url": "https://acme.example/careers/careers-path-engineer-9"})
    target = careers_scan.page_target(page, "Acme", page.careers_url)
    stats = store.ingest_company(conn, target, [page_job], complete=False, scan_started_at=now_iso(), expiry_days=30)
    assert stats.inserted == 0 and stats.linked == 1
    rows = conn.execute(
        "SELECT id, url, feed_source FROM jobs WHERE dedupe_key = %s", (board_job.dedupe_key,)
    ).fetchall()
    assert len(rows) == 1  # stored once
    assert rows[0]["url"] == "https://acme.example/careers/careers-path-engineer-9"
    assert rows[0]["feed_source"] == "greenhouse"
    keys = {r["source_key"] for r in conn.execute("SELECT source_key FROM job_sources WHERE job_id = %s", (rows[0]["id"],))}
    assert keys == {"greenhouse", "careers"}

    # A board update never takes the link back.
    changed = NormalizedJob(**{**board_job.__dict__, "description": "Python and Go", "content_hash": "changed"})
    store.ingest_company(conn, board, [changed], complete=True, scan_started_at=now_iso(), expiry_days=30)
    url = conn.execute("SELECT url FROM jobs WHERE id = %s", (rows[0]["id"],)).fetchone()["url"]
    assert url == "https://acme.example/careers/careers-path-engineer-9"

    # A complete careers read makes the board a fallback: it is no longer scheduled.
    assert board.id in registry.scheduled_source_ids(conn, shard=None, shard_count=6, max_failures=5)
    career_pages.record(conn, page_id, CrawlResult("ok", "greenhouse", [], True, page.careers_url, Embed("greenhouse", board.token)),
                        kept=1, counts={})
    assert board.id not in registry.scheduled_source_ids(conn, shard=None, shard_count=6, max_failures=5)
    row = conn.execute("SELECT strategy, last_status, last_complete FROM career_pages WHERE id = %s", (page_id,)).fetchone()
    assert (row["strategy"], row["last_status"], row["last_complete"]) == ("greenhouse", "ok", 1)
    # A page that stops publishing job data hands the company back to the board.
    career_pages.record(conn, page_id, CrawlResult("no_job_data"), kept=0, counts={})
    assert board.id in registry.scheduled_source_ids(conn, shard=None, shard_count=6, max_failures=5)


def test_careers_page_postings_sharing_the_listing_url_are_not_merged(conn):
    from app.discovery.jobs import careers_scan
    from app.discovery.jobs.careers_crawl import CareerPage

    page = CareerPage(f"pg_{uuid.uuid4().hex[:6]}", "Acme", "https://acme.example/careers", "acme.example")
    target = careers_scan.page_target(page, "Acme", page.careers_url)

    def listed(i: int, title: str) -> NormalizedJob:
        return NormalizedJob(**{**njob(f"{page.id}:embedded_json:{i}", title=title).__dict__, "url": page.careers_url})

    first = store.ingest_company(conn, target, [listed(0, "Listing Url Engineer Z")], complete=False,
                                 scan_started_at=now_iso(), expiry_days=30)
    assert first.inserted == 1
    # Two other roles whose only link is the same listing page: never linked to job Z by URL.
    stats = store.ingest_company(conn, target, [listed(1, "Listing Url Engineer A"), listed(2, "Listing Url Engineer B")],
                                 complete=False, scan_started_at=now_iso(), expiry_days=30)
    assert stats.inserted == 2 and stats.linked == 0


# --- onboarding / re-ranking -------------------------------------------------------------------


def isolate_pool(conn) -> None:
    """Close every shared job left by earlier tests, so ranking sees only this test's jobs."""
    conn.execute("UPDATE jobs SET closed_at = %s WHERE user_id IS NULL AND closed_at IS NULL", (now_iso(),))


def pool_job(conn, target, ext: str, *, region: str, min_years: int | None, loc: str,
             title: str | None = None) -> str:
    store.ingest_company(conn, target, [njob(ext, title=title or f"Python Engineer {ext}", loc=loc)],
                         complete=False, scan_started_at=iso_minus(5), expiry_days=30)
    job_id = conn.execute("SELECT job_id FROM job_sources WHERE external_id = %s", (ext,)).fetchone()["job_id"]
    conn.execute("UPDATE jobs SET region = %s, min_years = %s WHERE id = %s", (region, min_years, job_id))
    return job_id


def recommended(conn, user: str) -> set[str]:
    rows = conn.execute(
        "SELECT job_id FROM user_job_state WHERE user_id = %s AND recommended_at IS NOT NULL", (user,)
    ).fetchall()
    return {r["job_id"] for r in rows}


def test_onboarding_completion_ranks_existing_pool(conn):
    isolate_pool(conn)
    target = make_source(conn)
    tag = uuid.uuid4().hex[:6]
    india = pool_job(conn, target, f"ob-in-{tag}", region="india", min_years=1, loc="Bengaluru")
    remote = pool_job(conn, target, f"ob-rm-{tag}", region="india_remote", min_years=2, loc="Remote, India")
    world = pool_job(conn, target, f"ob-gl-{tag}", region="global", min_years=0, loc="Berlin")
    too_senior = pool_job(conn, target, f"ob-sr-{tag}", region="india", min_years=4, loc="Pune")

    user = add_user(conn)
    conn.execute("UPDATE profiles SET onboarding_complete = 0, years_experience = 1 WHERE user_id = %s", (user,))
    cap2 = DiscoverySettings(discovery_daily_limit=2, discovery_min_match_score=0)

    # The career save during onboarding re-ranks before the flag is set: nothing yet.
    before = ranking.rerank_user(conn, cap2, user)
    assert before["rescored"] == before["dropped"] == before["added"] == 0
    assert recommended(conn, user) == set()

    # /api/onboarding/complete sets the flag, then re-ranks: today's list fills from the pool.
    conn.execute("UPDATE profiles SET onboarding_complete = 1 WHERE user_id = %s", (user,))
    result = ranking.rerank_user(conn, cap2, user)
    assert result["added"] == 2
    # Cap 2, India first; 4 years asked > 1 + 2 window, so never offered.
    assert recommended(conn, user) == {india, remote}
    assert too_senior not in recommended(conn, user) and world not in recommended(conn, user)
    # Idempotent: a second call within the day adds nothing (cap reached).
    assert ranking.rerank_user(conn, cap2, user)["added"] == 0


def test_rerank_restores_system_hidden_jobs_but_never_user_choices(conn):
    isolate_pool(conn)
    target = make_source(conn)
    tag = uuid.uuid4().hex[:6]
    fits = pool_job(conn, target, f"rr-fit-{tag}", region="india", min_years=1, loc="Bengaluru")
    stretch = pool_job(conn, target, f"rr-str-{tag}", region="india", min_years=3, loc="Pune")
    ignored = pool_job(conn, target, f"rr-ign-{tag}", region="india", min_years=3, loc="Chennai")
    saved = pool_job(conn, target, f"rr-sav-{tag}", region="india", min_years=3, loc="Delhi")
    user = add_user(conn)
    conn.execute("UPDATE profiles SET years_experience = 1 WHERE user_id = %s", (user,))
    cfg = DiscoverySettings(discovery_daily_limit=10, discovery_min_match_score=0)
    ranking.recommend(conn, cfg, user_ids=[user])
    assert recommended(conn, user) == {fits, stretch, ignored, saved}

    # The user ignores one and bookmarks another (application row linked to the job state).
    now = now_iso()
    conn.execute("UPDATE user_job_state SET ignored = 1 WHERE user_id = %s AND job_id = %s", (user, ignored))
    conn.execute(
        """INSERT INTO applications (id, user_id, company_name, role, location, job_id, status, created_at, updated_at)
           VALUES (%s, %s, 'Acme', 'Python Engineer', 'Delhi', %s, 'bookmarked', %s, %s)""",
        (f"app-{tag}", user, saved, now, now),
    )
    conn.execute("UPDATE user_job_state SET application_id = %s WHERE user_id = %s AND job_id = %s",
                 (f"app-{tag}", user, saved))

    # Years drop to 0: the 3-year job is now outside 0 + 2 and is hidden by ranking.
    conn.execute("UPDATE profiles SET years_experience = 0 WHERE user_id = %s", (user,))
    result = ranking.rerank_user(conn, cfg, user)
    assert result["dropped"] == 1 and result["restored"] == 0
    row = conn.execute("SELECT recommended_at, hidden_reason FROM user_job_state WHERE user_id = %s AND job_id = %s",
                       (user, stretch)).fetchone()
    assert row["recommended_at"] is None and row["hidden_reason"] == "rerank"
    # Same profile again: still hidden, no flip-flop.
    assert ranking.rerank_user(conn, cfg, user)["restored"] == 0

    # Years back to 1: the hidden job fits again and returns; user choices are untouched.
    conn.execute("UPDATE profiles SET years_experience = 1 WHERE user_id = %s", (user,))
    result = ranking.rerank_user(conn, cfg, user)
    assert result["restored"] == 1 and result["added"] == 1
    row = conn.execute("SELECT recommended_at, hidden_reason, score FROM user_job_state WHERE user_id = %s AND job_id = %s",
                       (user, stretch)).fetchone()
    assert row["recommended_at"] is not None and row["hidden_reason"] is None and row["score"] is not None
    states = {r["job_id"]: r for r in conn.execute(
        "SELECT job_id, ignored, application_id FROM user_job_state WHERE user_id = %s", (user,)).fetchall()}
    assert states[ignored]["ignored"] == 1 and states[saved]["application_id"] == f"app-{tag}"
    count = conn.execute("SELECT COUNT(*) AS n FROM user_job_state WHERE user_id = %s", (user,)).fetchone()["n"]
    assert count == 4  # reused the hidden row, no duplicates


def test_the_same_role_in_two_cities_is_offered_once(conn):
    """Ingest keeps both rows (their dedupe keys differ by location); ranking offers the
    better-matching one, so Discover does not repeat a role."""
    isolate_pool(conn)
    target = make_source(conn)
    tag = uuid.uuid4().hex[:6]
    title = f"Platform Engineer {tag}"
    blr = pool_job(conn, target, f"dup-a-{tag}", region="india", min_years=1, loc="Bengaluru", title=title)
    pune = pool_job(conn, target, f"dup-b-{tag}", region="india", min_years=1, loc="Pune", title=title)
    other = pool_job(conn, target, f"dup-c-{tag}", region="india", min_years=1, loc="Bengaluru",
                     title=f"Data Engineer {tag}")
    user = add_user(conn)
    cfg = DiscoverySettings(discovery_daily_limit=10, discovery_min_match_score=0)
    ranking.recommend(conn, cfg, user_ids=[user])
    offered = recommended(conn, user)
    assert len(offered & {blr, pune}) == 1 and other in offered


def test_rerank_skips_jobs_whose_inputs_are_unchanged(conn):
    """`inputs_key` is the cache: an unchanged job + profile is never re-scored, and a resume
    edit invalidates exactly that user's rows."""
    isolate_pool(conn)
    target = make_source(conn)
    tag = uuid.uuid4().hex[:6]
    job_id = pool_job(conn, target, f"ck-{tag}", region="india", min_years=1, loc="Bengaluru")
    user = add_user(conn)
    cfg = DiscoverySettings(discovery_daily_limit=10, discovery_min_match_score=0)
    ranking.recommend(conn, cfg, user_ids=[user])

    def stored() -> dict:
        return conn.execute(
            "SELECT inputs_key, updated_at FROM job_scores WHERE user_id = %s AND job_id = %s",
            (user, job_id),
        ).fetchone()

    first = stored()
    assert first["inputs_key"]
    # Nothing changed: no re-score, no write.
    counts = ranking.rerank_user(conn, cfg, user)
    assert counts["unchanged"] >= 1 and counts["rescored"] == 0
    assert stored() == first

    # A resume with text changes the candidate, so the row is scored again under a new key.
    now = now_iso()
    conn.execute(
        """INSERT INTO resumes (id, user_id, display_name, status, storage_path, original_filename,
             byte_size, created_at, updated_at, extracted_text)
           VALUES (%s, %s, %s, 'active', 'resumes/x.pdf', 'x.pdf', 1024, %s, %s, %s)""",
        (f"res-{tag}", user, f"Resume {tag}", now, now, "Python Django PostgreSQL Docker engineer resume text."),
    )
    counts = ranking.rerank_user(conn, cfg, user)
    assert counts["rescored"] >= 1
    assert stored()["inputs_key"] != first["inputs_key"]


def test_legacy_rerank_hidden_rows_are_tagged_by_the_migration(conn):
    user = add_user(conn)
    now = now_iso()
    conn.execute(
        """INSERT INTO user_job_state (user_id, job_id, ignored, application_id, updated_at, recommended_at)
           VALUES (%s, 'legacy-hidden', 0, NULL, %s, NULL), (%s, 'legacy-ignored', 1, NULL, %s, NULL),
                  (%s, 'legacy-open', 0, NULL, %s, %s)""",
        (user, now, user, now, user, now, now),
    )
    backfill = next(s for s in schema.SHARED_BACKFILLS if s.startswith("UPDATE user_job_state SET hidden_reason"))
    conn.execute(backfill)
    tags = {r["job_id"]: r["hidden_reason"] for r in conn.execute(
        "SELECT job_id, hidden_reason FROM user_job_state WHERE user_id = %s", (user,)).fetchall()}
    assert tags == {"legacy-hidden": "rerank", "legacy-ignored": None, "legacy-open": None}


# --- outage guard, refresh safety, company discovery ---------------------------------------


class CollapsingProvider:
    """A board that listed many roles and now answers with (almost) none — the shape of an
    outage, not of a company that closed everything."""

    key = "greenhouse"

    def __init__(self, count: int) -> None:
        self.count = count

    def fetch(self, client, target):
        return FetchResult([
            RawPosting(external_id=f"{target.token}:{i}", title="Software Engineer I", company_name="Acme",
                       url=f"https://acme.example/{i}", locations=["Chennai, India"],
                       description="Python services", posted_at=now_iso())
            for i in range(self.count)
        ])


def test_outage_guard_keeps_a_collapsed_board_from_closing_every_job(conn, settings, monkeypatch):
    target = make_source(conn)

    def run_scan(count: int) -> dict:
        monkeypatch.setattr(scan, "get_provider", lambda key: CollapsingProvider(count))
        run, _ = runs.create_run(conn, kind="jobs_scan", items=[(scan.ITEM_KIND, target.id, {})])
        process_tick(conn, settings, budget_seconds=60, kinds=[scan.ITEM_KIND])
        return json.loads(conn.execute(
            "SELECT last_counts_json FROM company_sources WHERE id = %s", (target.id,)).fetchone()["last_counts_json"])

    first = run_scan(20)
    assert first["inserted"] == 20
    assert conn.execute(
        "SELECT last_posting_count AS n FROM company_sources WHERE id = %s", (target.id,)
    ).fetchone()["n"] == 20

    second = run_scan(1)
    assert second["outageGuard"] == {"previous": 20, "fetched": 1}
    # The collapsed count must not become the new baseline, or a second day of the same
    # outage would look like a normal scan and close everything.
    assert conn.execute(
        "SELECT last_posting_count AS n FROM company_sources WHERE id = %s", (target.id,)
    ).fetchone()["n"] == 20
    open_jobs = conn.execute(
        """SELECT COUNT(*) AS n FROM jobs j JOIN job_sources s ON s.job_id = j.id
           WHERE s.company_source_id = %s AND j.closed_at IS NULL""", (target.id,)).fetchone()
    assert open_jobs["n"] == 20  # nothing closed while the source looks broken

    # Once the board answers normally again, the jobs it really dropped do close.
    third = run_scan(20)
    assert "outageGuard" not in third
    fourth = run_scan(12)
    assert "outageGuard" not in fourth and fourth["closed"] == 8


def test_refreshing_a_job_keeps_the_user_s_application_state(conn, settings):
    target = make_source(conn)
    store.ingest_company(conn, target, [njob("g:1", title="Backend Engineer")], complete=True,
                         scan_started_at=iso_minus(5), expiry_days=30)
    job_id = conn.execute("SELECT job_id FROM job_sources WHERE external_id = 'g:1'").fetchone()["job_id"]
    user = add_user(conn)
    now = now_iso()
    conn.execute(
        """INSERT INTO applications (id, user_id, company_name, role, location, job_id, status, notes,
             created_at, updated_at)
           VALUES ('app_keep', %s, 'Acme', 'Backend Engineer', 'Bengaluru', %s, 'applied', 'Referred by Asha',
                   %s, %s)""",
        (user, job_id, now, now),
    )
    conn.execute(
        """INSERT INTO user_job_state (user_id, job_id, ignored, application_id, updated_at, recommended_at, score)
           VALUES (%s, %s, 0, 'app_keep', %s, %s, 77)""",
        (user, job_id, now, now),
    )

    changed = njob("g:1", title="Backend Engineer", desc="Rewritten description", posted="2026-10-02T00:00:00.000Z")
    stats = store.ingest_company(conn, target, [changed], complete=True,
                                 scan_started_at=now_iso(), expiry_days=30)
    assert stats.updated == 1
    job = conn.execute("SELECT description, first_seen_at FROM jobs WHERE id = %s", (job_id,)).fetchone()
    assert job["description"] == "Rewritten description"
    app = conn.execute("SELECT status, notes, job_id FROM applications WHERE id = 'app_keep'").fetchone()
    assert (app["status"], app["notes"], app["job_id"]) == ("applied", "Referred by Asha", job_id)
    state = conn.execute(
        "SELECT application_id, score, recommended_at FROM user_job_state WHERE user_id = %s AND job_id = %s",
        (user, job_id)).fetchone()
    assert state["application_id"] == "app_keep" and state["score"] == 77 and state["recommended_at"] is not None


def test_index_sources_are_imported_once_and_scheduled_like_any_source(conn):
    from app.discovery.jobs.providers.workable_index import INDEX_TOKENS

    first = registry.import_index_sources(conn)
    second = registry.import_index_sources(conn)
    assert first["added"] == len(INDEX_TOKENS) and second["added"] == 0
    rows = conn.execute(
        "SELECT token, origin, enabled FROM company_sources WHERE provider = 'workable_index'").fetchall()
    assert {r["token"] for r in rows} == set(INDEX_TOKENS)
    assert all(r["origin"] == "index" and r["enabled"] == 1 for r in rows)
    scheduled = registry.scheduled_source_ids(conn, shard=None, shard_count=6, max_failures=5)
    index_ids = {r["id"] for r in conn.execute(
        "SELECT id FROM company_sources WHERE provider = 'workable_index'").fetchall()}
    assert index_ids <= set(scheduled)


def test_company_candidates_skip_companies_already_covered(conn):
    from app.discovery.jobs import company_discovery

    make_source(conn, token="coveredco")  # a board source named "Acme"
    added = company_discovery.record_hints(
        conn,
        [("Acme", "https://acme.example/"), ("Fresh Co", "https://fresh.example/"),
         ("Fresh Co", "https://fresh.example/"), ("Platform Only", "https://x.workable.com/")],
    )
    assert added == 2  # "Acme" is already a source; the repeated name is one candidate
    rows = {r["name"]: r for r in conn.execute(
        "SELECT name, domain, discovery_source, status FROM discovered_companies").fetchall()}
    assert set(rows) == {"Fresh Co", "Platform Only"}
    assert rows["Fresh Co"]["domain"] == "fresh.example"
    # A hiring-platform host is not a company website, so no domain is stored for it.
    assert rows["Platform Only"]["domain"] is None
    assert all(r["status"] == "pending" and r["discovery_source"] == "workable_index" for r in rows.values())

    # Re-recording is idempotent and never duplicates a candidate.
    assert company_discovery.record_hints(conn, [("Fresh Co", None)]) == 0


def test_resolved_candidate_is_registered_as_a_board_and_a_careers_page(conn):
    from app.discovery.jobs import company_discovery

    company_discovery.record_hints(conn, [("Registerme Inc", "https://registerme.example/")])
    candidate_id = conn.execute(
        "SELECT id FROM discovered_companies WHERE name = 'Registerme Inc'").fetchone()["id"]
    candidate = company_discovery.load(conn, candidate_id)
    assert candidate is not None and candidate.domain == "registerme.example"

    outcome = company_discovery._apply(
        conn,
        candidate,
        company_discovery.Resolution(
            "board", "https://registerme.example/careers", "greenhouse", "registermeinc", requests=3
        ),
    )
    assert outcome.ok and outcome.result["registeredBoard"] and outcome.result["registeredPage"]

    source = conn.execute(
        "SELECT company_name, origin, enabled, official_careers_url, official_careers_origin"
        " FROM company_sources WHERE provider = 'greenhouse' AND token = 'registermeinc'").fetchone()
    assert source["company_name"] == "Registerme Inc" and source["origin"] == "discovered"
    assert source["enabled"] == 1
    assert source["official_careers_url"] == "https://registerme.example/careers"
    assert source["official_careers_origin"] == "detected"

    page = conn.execute(
        "SELECT company_name, domain, origin, company_source_id FROM career_pages"
        " WHERE careers_url = 'https://registerme.example/careers'").fetchone()
    assert page["origin"] == "discovered" and page["domain"] == "registerme.example"
    assert page["company_source_id"] is not None

    ledger = conn.execute(
        "SELECT status, ats, ats_token, attempts, promoted_source_id, promoted_page_id, checked_at"
        " FROM discovered_companies WHERE id = %s", (candidate_id,)).fetchone()
    assert ledger["status"] == "board" and (ledger["ats"], ledger["ats_token"]) == ("greenhouse", "registermeinc")
    assert ledger["attempts"] == 1 and ledger["checked_at"] is not None
    assert ledger["promoted_source_id"] and ledger["promoted_page_id"]

    # Re-resolving the same candidate never creates a second registry row.
    again = company_discovery._apply(
        conn, candidate,
        company_discovery.Resolution("board", "https://registerme.example/careers", "greenhouse", "registermeinc"),
    )
    assert again.result["registeredBoard"] is False and again.result["registeredPage"] is False
    assert conn.execute(
        "SELECT COUNT(*) AS n FROM company_sources WHERE token = 'registermeinc'").fetchone()["n"] == 1

    # A candidate that resolved is not queued again while it is fresh.
    assert candidate_id not in company_discovery.scheduled_ids(conn, limit=200)


def test_unresolved_candidates_are_retried_and_then_given_up_on(conn):
    from app.discovery.jobs import company_discovery

    company_discovery.record_hints(conn, [("Nothing Found Ltd", None)])
    candidate_id = conn.execute(
        "SELECT id FROM discovered_companies WHERE name = 'Nothing Found Ltd'").fetchone()["id"]
    candidate = company_discovery.load(conn, candidate_id)
    for _ in range(company_discovery.MAX_ATTEMPTS):
        company_discovery._apply(conn, candidate, company_discovery.Resolution("none", error="nothing"))
        # Still due only once the recheck window has passed.
        assert candidate_id not in company_discovery.scheduled_ids(conn, limit=200)
        conn.execute(
            "UPDATE discovered_companies SET checked_at = %s WHERE id = %s",
            (iso_minus(company_discovery.RECHECK_SECONDS + 60), candidate_id),
        )
    # Attempts exhausted: it is never queued again.
    assert candidate_id not in company_discovery.scheduled_ids(conn, limit=200)
    row = conn.execute(
        "SELECT attempts, status, last_error FROM discovered_companies WHERE id = %s", (candidate_id,)).fetchone()
    assert row["attempts"] == company_discovery.MAX_ATTEMPTS and row["status"] == "none"


def test_health_report_counts_sources_pages_and_validation_problems(conn, settings):
    from app.discovery.jobs import health

    target = make_source(conn, token="healthco")
    store.ingest_company(conn, target, [njob("h:1", title="Platform Engineer")], complete=True,
                         scan_started_at=iso_minus(5), expiry_days=30)
    registry.record_scan(conn, target.id, ok=True, error=None, counts={"kept": 1}, posting_count=1)

    report = health.source_health(conn, expiry_days=settings.job_expiry_days)
    assert report["boards"]["configured"] >= 1 and report["boards"]["everSucceeded"] >= 1
    assert any(r["ats"] == "greenhouse" for r in report["boardsByAts"])
    assert report["jobs"]["active"] >= 1 and report["jobs"]["expiryDays"] == settings.job_expiry_days
    for key in ("invalidUrl", "invalidTitle", "emptyDescription", "notRelistedRecently", "duplicateGroups"):
        assert isinstance(report["validation"][key], int)
    assert "careersPages" in report and "companyDiscovery" in report
