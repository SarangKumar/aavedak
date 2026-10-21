"""Idempotent schema for the discovery pipeline.

Two groups:
  * PIPELINE_STATEMENTS — tables only the API uses (registry, source refs, runs, contacts).
  * SHARED_STATEMENTS   — columns/tables on web-owned data that the pipeline writes (DDL only;
    one-off data fixes on those tables are SHARED_BACKFILLS, run after). They are
    defined in apps/web/lib/app-db.ts (`runDiscoverySchema`) and mirrored here so a cron that
    runs before any web request still works. `tests/test_discovery_schema.py` checks the
    mirror stays in sync.

Base tables (jobs, applications, profiles, …) are created by the web app; if they are
missing we fail with a clear message instead of creating partial copies.
"""

from __future__ import annotations

import hashlib
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
    # Upper end of a stated experience range; india | india_remote | remote | global; ISO
    # country of the job's canonical city (people at the company are ranked by it).
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_years INTEGER",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS region TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country_code TEXT",
    # Application / recruiting email published in the posting text (never guessed).
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_email TEXT",
    # Description as parsed, before JD boilerplate stripping (set only when stripping changed it).
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_raw TEXT",
    """CREATE INDEX IF NOT EXISTS jobs_shared_active_idx
       ON jobs (first_seen_at) WHERE user_id IS NULL AND expired_at IS NULL""",
    "CREATE INDEX IF NOT EXISTS jobs_dedupe_key_idx ON jobs (dedupe_key) WHERE user_id IS NULL",
    "CREATE INDEX IF NOT EXISTS jobs_company_id_idx ON jobs (company_id)",
    "ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS recommended_at TEXT",
    "ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS score INTEGER",
    "ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS reasons_json TEXT",
    # 'rerank' = hidden by ranking (no longer fits), not by the user; re-offered once it fits
    # again. Rows hidden before this column existed are tagged by SHARED_BACKFILLS.
    "ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS hidden_reason TEXT",
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
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS seniority TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS department TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS company_domain TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS location TEXT",
    # Canonical "City, Country" (or NULL) and ISO country from the person's raw location.
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS location_city TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS country_code TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS github_url TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS website_url TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS twitter_url TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS phone TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS confidence INTEGER",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS last_seen_at TEXT",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern TEXT",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_domain TEXT",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_confidence INTEGER",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_evidence INTEGER",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_source TEXT",
    "ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_updated_at TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS discovery_source TEXT",
    "ALTER TABLE people ADD COLUMN IF NOT EXISTS github_login TEXT",
    """CREATE UNIQUE INDEX IF NOT EXISTS people_github_login_uidx
       ON people (github_login) WHERE github_login IS NOT NULL""",
    """DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM people WHERE user_id IS NULL AND email IS NOT NULL
                        GROUP BY lower(email) HAVING count(*) > 1) THEN
           CREATE UNIQUE INDEX IF NOT EXISTS people_shared_email_uidx
             ON people (lower(email)) WHERE user_id IS NULL AND email IS NOT NULL;
         END IF;
       END $$""",
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
    # Backfill (idempotent): before worldwide ingest every shared job was India-eligible.
    """UPDATE jobs SET region = CASE WHEN location ILIKE '%remote%' AND location NOT ILIKE '%india%'
                                     THEN 'india_remote' ELSE 'india' END
       WHERE region IS NULL AND user_id IS NULL""",
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
    # The company's own careers page (primary source of truth) for a board source: its URL,
    # where it came from ('seed' | 'admin' | 'detected'), and the last read of its job data
    # ('ok' | 'no_job_data' | 'blocked' | 'error').
    "ALTER TABLE company_sources ADD COLUMN IF NOT EXISTS official_careers_url TEXT",
    "ALTER TABLE company_sources ADD COLUMN IF NOT EXISTS official_careers_origin TEXT",
    "ALTER TABLE company_sources ADD COLUMN IF NOT EXISTS official_status TEXT",
    "ALTER TABLE company_sources ADD COLUMN IF NOT EXISTS official_checked_at TEXT",
    # Companies' own careers pages (the primary job source; seeded from
    # data/careers_pages.json, crawled by jobs/careers_scan.py). The last crawl's outcome:
    # strategy (jsonld | embedded_json | jsonld_links | jsonld_sitemap | greenhouse | lever |
    # ashby | smartrecruiters | workable | workday), status (ok | no_job_data | blocked |
    # error), postings found / kept, and whether it was the complete list.
    """CREATE TABLE IF NOT EXISTS career_pages (
      id TEXT PRIMARY KEY NOT NULL,
      company_name TEXT NOT NULL,
      careers_url TEXT NOT NULL,
      domain TEXT NOT NULL,
      country_focus TEXT NOT NULL DEFAULT 'global',
      tier INTEGER NOT NULL DEFAULT 3,
      origin TEXT NOT NULL DEFAULT 'seed',
      enabled INTEGER NOT NULL DEFAULT 1,
      shard_seed INTEGER NOT NULL DEFAULT 0,
      company_source_id TEXT,
      strategy TEXT,
      platform_token TEXT,
      final_url TEXT,
      last_checked_at TEXT,
      last_status TEXT,
      last_error TEXT,
      last_complete INTEGER NOT NULL DEFAULT 0,
      jobs_found INTEGER NOT NULL DEFAULT 0,
      jobs_kept INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_counts_json TEXT NOT NULL DEFAULT '{}',
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS career_pages_url_uidx ON career_pages (lower(careers_url))",
    "CREATE INDEX IF NOT EXISTS career_pages_source_idx ON career_pages (company_source_id)",
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
    "ALTER TABLE person_contacts ADD COLUMN IF NOT EXISTS confidence INTEGER",
    # Field-level provenance: which source said what about a person, and when.
    """CREATE TABLE IF NOT EXISTS person_field_sources (
      person_id TEXT NOT NULL,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      confidence INTEGER NOT NULL DEFAULT 50,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (person_id, field, source, value)
    )""",
    "CREATE INDEX IF NOT EXISTS person_field_sources_person_idx ON person_field_sources (person_id)",
    # Email format per company domain, inferred only from published evidence.
    """CREATE TABLE IF NOT EXISTS company_email_patterns (
      domain TEXT PRIMARY KEY NOT NULL,
      pattern TEXT NOT NULL,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      confidence INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      mx_ok INTEGER,
      updated_at TEXT NOT NULL
    )""",
    # Incremental cursor: one row per target company (from applications + jobs).
    """CREATE TABLE IF NOT EXISTS people_discovery_state (
      company_id TEXT PRIMARY KEY NOT NULL,
      domain TEXT,
      github_org TEXT,
      last_run_at TEXT,
      next_due_at TEXT,
      last_counts_json TEXT NOT NULL DEFAULT '{}',
      last_error TEXT,
      updated_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS people_discovery_state_due_idx ON people_discovery_state (next_due_at)",
    # Metered third-party API usage per provider + period (e.g. Google CSE per Pacific day).
    """CREATE TABLE IF NOT EXISTS external_api_usage (
      provider TEXT NOT NULL,
      period TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, period)
    )""",
)

# Idempotent data fixes on web-owned tables, run after the DDL (mirrored in app-db.ts).
SHARED_BACKFILLS: tuple[str, ...] = (
    # Re-rank used to hide a job by clearing recommended_at/score only; tag those rows.
    """UPDATE user_job_state SET hidden_reason = 'rerank'
       WHERE hidden_reason IS NULL AND recommended_at IS NULL AND score IS NULL
         AND ignored = 0 AND application_id IS NULL""",
)

BASE_TABLES = ("jobs", "companies", "applications", "user_job_state", "user_preferences", "people", "profiles")


class BaseSchemaMissing(RuntimeError):
    pass


# Hash of the DDL: a changed statement re-runs the script once, then cold starts skip it.
SCHEMA_VERSION = "api-" + hashlib.sha256(
    "\n".join(SHARED_STATEMENTS + PIPELINE_STATEMENTS + SHARED_BACKFILLS).encode()
).hexdigest()[:16]

_VERSION_TABLE = """CREATE TABLE IF NOT EXISTS schema_version (
      id TEXT PRIMARY KEY NOT NULL,
      version TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )"""

_ready = False
_lock = threading.Lock()


def ensure_schema(conn: psycopg.Connection) -> None:
    """Apply discovery DDL when it changed; otherwise one query per process.

    The API may run far from the database, so the base-table check and the stored-version
    check share one round trip, and the DDL (when needed) is one script. Concurrent cold
    starts may both run it; every statement is idempotent.
    """
    global _ready
    if _ready:
        return
    with _lock:
        if _ready:
            return
        row = conn.execute(
            """SELECT
                 ARRAY(SELECT t FROM unnest(%s::text[]) AS t WHERE to_regclass(t) IS NULL) AS missing,
                 CASE WHEN to_regclass('schema_version') IS NULL THEN NULL
                   ELSE (SELECT version FROM schema_version WHERE id = 'api') END AS version""",
            (list(BASE_TABLES),),
        ).fetchone()
        missing = sorted(row["missing"] or [])
        if missing:
            raise BaseSchemaMissing(
                "Web app schema not initialized (missing: "
                + ", ".join(missing)
                + "). Open the web app once so ensureAppSchema() creates base tables."
            )
        if row["version"] != SCHEMA_VERSION:
            # No parameters → simple query protocol, so the whole script is a single round trip.
            # SCHEMA_VERSION is "api-" + hex, safe to inline.
            record = (
                "INSERT INTO schema_version (id, version, applied_at) "
                f"VALUES ('api', '{SCHEMA_VERSION}', to_char(now() AT TIME ZONE 'UTC', "
                "'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')) "
                "ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = EXCLUDED.applied_at"
            )
            conn.execute(
                ";\n".join(SHARED_STATEMENTS + PIPELINE_STATEMENTS + SHARED_BACKFILLS + (_VERSION_TABLE, record))
            )
        _ready = True
