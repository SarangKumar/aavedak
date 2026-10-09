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
    """Static DDL statements from app-db.ts (parameterized data statements are skipped)."""
    blocks = re.findall(r"await db`([\s\S]*?)`;", APP_DB_TS.read_text(encoding="utf-8"))
    return [b for b in blocks if "${" not in b]


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
    return DiscoverySettings(_env_file=None, discovery_daily_limit=3, discovery_min_match_score=0)


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


def test_expiry_rejects_early_applications_once(conn, settings):
    target = make_source(conn)
    store.ingest_company(conn, target, [njob("e:1", title="Firmware Engineer")], complete=True,
                         scan_started_at=iso_minus(5), expiry_days=30)
    job_id = conn.execute("SELECT job_id FROM job_sources WHERE external_id = 'e:1'").fetchone()["job_id"]
    conn.execute("UPDATE jobs SET posted_at = %s WHERE id = %s", (to_iso(utcnow() - timedelta(days=31)), job_id))
    now = now_iso()
    for app_id, status in (("app_applied", "applied"), ("app_interview", "interview")):
        conn.execute(
            """INSERT INTO applications (id, user_id, company_name, role, location, job_id, status, created_at, updated_at)
               VALUES (%s, 'u1', 'Acme', 'Firmware Engineer', 'Pune', %s, %s, %s, %s)""",
            (app_id, job_id, status, now, now),
        )
    # A manual (user-owned) job never expires.
    conn.execute("""INSERT INTO jobs (id, user_id, title, company, location, created_at, updated_at, posted_at)
                    VALUES ('manual1', 'u1', 'Old manual', 'X', 'Y', %s, %s, '2020-01-01T00:00:00.000Z')""", (now, now))

    result = expiry.run_expiry(conn, settings)
    assert result == {"jobsExpired": 1, "applicationsRejected": 1}
    rows = {r["id"]: r for r in conn.execute("SELECT id, status, status_reason FROM applications").fetchall()}
    assert rows["app_applied"]["status"] == "rejected" and rows["app_applied"]["status_reason"] == "job_expired"
    assert rows["app_interview"]["status"] == "interview"
    assert conn.execute("SELECT expired_at FROM jobs WHERE id = 'manual1'").fetchone()["expired_at"] is None

    # User reopens → never re-rejected; re-running is a no-op.
    conn.execute("UPDATE applications SET status = 'applied' WHERE id = 'app_applied'")
    assert expiry.run_expiry(conn, settings) == {"jobsExpired": 0, "applicationsRejected": 0}
    events = conn.execute("SELECT COUNT(*) AS n FROM application_events WHERE application_id = 'app_applied'").fetchone()
    assert events["n"] == 1


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
