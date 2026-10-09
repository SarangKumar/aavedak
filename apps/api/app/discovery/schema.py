"""Idempotent schema for the discovery pipeline.

Two groups:
  * PIPELINE_STATEMENTS — tables only the API uses (registry, source refs, runs, contacts).
  * SHARED_STATEMENTS   — columns/tables on web-owned data that the pipeline writes. They are
    defined in apps/web/lib/app-db.ts (`runDiscoverySchema`) and mirrored here so a cron that
    runs before any web request still works. `tests/test_discovery_schema.py` checks the
    mirror stays in sync.

Base tables (jobs, applications, profiles, …) are created by the web app; if they are
missing we fail with a clear message instead of creating partial copies.
"""

from __future__ import annotations

import threading

import psycopg

SHARED_STATEMENTS: tuple[str, ...] = (
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posted_at TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posted_at_estimated INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS first_seen_at TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expired_at TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dedupe_key TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_years INTEGER",
    """CREATE INDEX IF NOT EXISTS jobs_shared_active_idx
       ON jobs (first_seen_at) WHERE user_id IS NULL AND expired_at IS NULL""",
    "CREATE INDEX IF NOT EXISTS jobs_dedupe_key_idx ON jobs (dedupe_key) WHERE user_id IS NULL",
    "CREATE INDEX IF NOT EXISTS jobs_company_id_idx ON jobs (company_id)",
    "ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS recommended_at TEXT",
    "ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS score INTEGER",
    "ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS reasons_json TEXT",
    """CREATE INDEX IF NOT EXISTS user_job_state_recommended_idx
       ON user_job_state (user_id, recommended_at)""",
    "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS discovery_enabled INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS status_reason TEXT",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS status_changed_at TEXT",
    "CREATE INDEX IF NOT EXISTS applications_job_id_idx ON applications (job_id)",
    """CREATE TABLE IF NOT EXISTS application_events (
      id TEXT PRIMARY KEY NOT NULL,
      application_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      reason TEXT,
      actor TEXT NOT NULL CHECK (actor IN ('user', 'system')),
      created_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS application_events_app_idx ON application_events (application_id)",
    """CREATE UNIQUE INDEX IF NOT EXISTS application_events_system_reason_uidx
       ON application_events (application_id, reason) WHERE actor = 'system'""",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS company_id TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'user'",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS dedupe_key TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS linkedin_url_normalized TEXT",
    """CREATE UNIQUE INDEX IF NOT EXISTS people_linkedin_uidx
       ON people (linkedin_url_normalized) WHERE linkedin_url_normalized IS NOT NULL""",
    "CREATE INDEX IF NOT EXISTS people_dedupe_key_idx ON people (dedupe_key)",
    "CREATE INDEX IF NOT EXISTS people_company_id_idx ON people (company_id)",
    """CREATE TABLE IF NOT EXISTS job_person_relevance (
      job_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (job_id, person_id)
    )""",
)

PIPELINE_STATEMENTS: tuple[str, ...] = (
    # Career-page registry (seeded from data/career_sources.json, editable by admins).
    """CREATE TABLE IF NOT EXISTS company_sources (
      id TEXT PRIMARY KEY NOT NULL,
      company_id TEXT,
      company_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      token TEXT NOT NULL,
      careers_url TEXT NOT NULL,
      sector TEXT,
      origin TEXT NOT NULL DEFAULT 'admin',
      enabled INTEGER NOT NULL DEFAULT 1,
      shard_seed INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_counts_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (provider, token)
    )""",
    # Per-source references for a canonical job (one job may be listed by several sources).
    """CREATE TABLE IF NOT EXISTS job_sources (
      id TEXT PRIMARY KEY NOT NULL,
      job_id TEXT NOT NULL,
      source_key TEXT NOT NULL,
      external_id TEXT NOT NULL,
      company_source_id TEXT,
      url TEXT,
      content_hash TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      UNIQUE (source_key, external_id)
    )""",
    "CREATE INDEX IF NOT EXISTS job_sources_job_idx ON job_sources (job_id)",
    """CREATE INDEX IF NOT EXISTS job_sources_company_source_idx
       ON job_sources (company_source_id, last_seen_at)""",
    # Persistent, resumable runs processed in leased batches.
    """CREATE TABLE IF NOT EXISTS discovery_runs (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      run_key TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'running',
      total_items INTEGER NOT NULL DEFAULT 0,
      done_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      counts_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS discovery_run_items (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      lease_until TEXT,
      last_error TEXT,
      result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS discovery_run_items_claim_idx ON discovery_run_items (status, created_at)",
    "CREATE INDEX IF NOT EXISTS discovery_run_items_run_idx ON discovery_run_items (run_id, status)",
    # Contact methods with provenance and verification, separate from the person row.
    """CREATE TABLE IF NOT EXISTS person_contacts (
      id TEXT PRIMARY KEY NOT NULL,
      person_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('email', 'linkedin', 'phone')),
      value TEXT NOT NULL,
      value_key TEXT NOT NULL,
      source TEXT NOT NULL,
      provenance_url TEXT,
      verification TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification IN ('unverified', 'inferred', 'verified')),
      added_by_user_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'private')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (person_id, kind, value_key)
    )""",
    "CREATE INDEX IF NOT EXISTS person_contacts_value_idx ON person_contacts (kind, value_key)",
)

BASE_TABLES = ("jobs", "companies", "applications", "user_job_state", "user_preferences", "people", "profiles")


class BaseSchemaMissing(RuntimeError):
    pass


_ready = False
_lock = threading.Lock()


def ensure_schema(conn: psycopg.Connection) -> None:
    """Apply discovery DDL once per process (all statements are idempotent)."""
    global _ready
    if _ready:
        return
    with _lock:
        if _ready:
            return
        # One round trip for the check and one for all DDL: the API may run far from the
        # database (e.g. US functions, Singapore Neon), so per-statement trips add up.
        found = conn.execute(
            "SELECT t FROM unnest(%s::text[]) AS t WHERE to_regclass(t) IS NOT NULL",
            (list(BASE_TABLES),),
        ).fetchall()
        missing = sorted(set(BASE_TABLES) - {r["t"] for r in found})
        if missing:
            raise BaseSchemaMissing(
                "Web app schema not initialized (missing: "
                + ", ".join(missing)
                + "). Open the web app once so ensureAppSchema() creates base tables."
            )
        # No parameters → simple query protocol, so the whole script is a single round trip.
        conn.execute(";\n".join(SHARED_STATEMENTS + PIPELINE_STATEMENTS))
        _ready = True
