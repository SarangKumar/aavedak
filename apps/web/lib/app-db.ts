import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * App data on Neon Postgres (profiles, resumes metadata, applications, etc.).
 * Resume PDF bytes live in Google Cloud Storage; DB stores object-key metadata only.
 */

let sql: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

export function getSql() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required (Neon pooled connection string).");
  }
  sql = neon(url);
  return sql;
}

async function runSchema() {
  const db = getSql();
  await db`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      name TEXT,
      bio TEXT,
      portfolio_url TEXT,
      linkedin_url TEXT,
      links_json TEXT NOT NULL DEFAULT '{}',
      image_url TEXT,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;

  await db`
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
      storage_path TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, display_name)
    )`;
  await db`CREATE INDEX IF NOT EXISTS resumes_user_id_idx ON resumes (user_id)`;
  await db`CREATE INDEX IF NOT EXISTS resumes_user_status_idx ON resumes (user_id, status)`;

  await db`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      role TEXT NOT NULL,
      location TEXT NOT NULL,
      salary_ctc TEXT,
      job_link TEXT,
      job_id TEXT,
      status TEXT NOT NULL,
      notes TEXT,
      applied_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications (user_id)`;
  await db`CREATE INDEX IF NOT EXISTS applications_user_status_idx ON applications (user_id, status)`;

  await db`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY NOT NULL,
      tracker_view TEXT NOT NULL DEFAULT 'kanban',
      tracker_scope TEXT NOT NULL DEFAULT 'active',
      hidden_columns TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )`;

  await db`
    CREATE TABLE IF NOT EXISTS cover_letters (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      application_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS cover_letters_user_id_idx ON cover_letters (user_id)`;

  await db`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('outreach', 'cover', 'followup', 'other')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS templates_user_id_idx ON templates (user_id)`;
  // Allow follow-up email templates (widen kind check for existing DBs).
  await db`ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_kind_check`;
  await db`
    DO $$ BEGIN
      ALTER TABLE templates ADD CONSTRAINT templates_kind_check
        CHECK (kind IN ('outreach', 'cover', 'followup', 'other'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;

  await db`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
      name TEXT NOT NULL,
      email TEXT,
      company TEXT,
      role_title TEXT,
      notes TEXT,
      application_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS people_user_id_idx ON people (user_id)`;
  // Global shared directory: keep rows after account delete (user_id = who added, nullable).
  await db`ALTER TABLE people ALTER COLUMN user_id DROP NOT NULL`;

  await db`
    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      send_after TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      person_id TEXT,
      application_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS follow_up_tasks_user_id_idx ON follow_up_tasks (user_id)`;
  await db`CREATE INDEX IF NOT EXISTS follow_up_tasks_user_status_idx ON follow_up_tasks (user_id, status)`;
  // Widen status check for real Gmail send + failures (keep sent_stub for legacy rows)
  await db`ALTER TABLE follow_up_tasks DROP CONSTRAINT IF EXISTS follow_up_tasks_status_check`;
  await db`
    DO $$ BEGIN
      ALTER TABLE follow_up_tasks ADD CONSTRAINT follow_up_tasks_status_check
        CHECK (status IN ('pending', 'queued', 'sent', 'sent_stub', 'failed', 'done', 'dismissed'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS mail_to TEXT`;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS mail_subject TEXT`;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS mail_body TEXT`;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS gmail_message_id TEXT`;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT`;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS gmail_rfc_message_id TEXT`;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS send_error TEXT`;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS mail_kind TEXT`;
  await db`
    DO $$ BEGIN
      ALTER TABLE follow_up_tasks ADD CONSTRAINT follow_up_tasks_mail_kind_check
        CHECK (mail_kind IS NULL OR mail_kind IN ('outreach', 'followup'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;
  await db`CREATE INDEX IF NOT EXISTS follow_up_tasks_queued_due_idx
    ON follow_up_tasks (status, send_after) WHERE status = 'queued'`;

  await db`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      url TEXT,
      description TEXT NOT NULL DEFAULT '',
      salary TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs (user_id)`;
  await db`CREATE INDEX IF NOT EXISTS jobs_user_source_idx ON jobs (user_id, source)`;

  await db`
    CREATE TABLE IF NOT EXISTS job_analyses (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      summary TEXT,
      job_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS job_analyses_user_id_idx ON job_analyses (user_id)`;

  // Career preferences (YC-style) for onboarding + job matching
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS experience_level TEXT`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_roles_json TEXT NOT NULL DEFAULT '[]'`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expected_salary_min INTEGER`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expected_salary_max INTEGER`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS salary_currency TEXT NOT NULL DEFAULT 'INR'`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_locations_json TEXT NOT NULL DEFAULT '[]'`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS remote_preference TEXT`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS work_authorization TEXT`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skills_json TEXT NOT NULL DEFAULT '[]'`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_search_status TEXT`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_size_preference TEXT`;
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS industry_preference TEXT`;

  // Access approval: pending → admin approve → onboarding. Existing rows default approved.
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'`;
  await db`CREATE INDEX IF NOT EXISTS profiles_approval_status_idx ON profiles (approval_status)`;

  // Showcase projects on public profile (title, url, description, favicon)
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS projects_json TEXT NOT NULL DEFAULT '[]'`;

  // Shared company directory (creatable Select; used for search / match / referrals)
  await db`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS companies_name_key_idx ON companies (name_key)`;

  // Global + user jobs: user_id NULL = shared feed ingest
  await db`ALTER TABLE jobs ALTER COLUMN user_id DROP NOT NULL`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_id TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_id TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS feed_source TEXT`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS jobs_feed_external_uidx
    ON jobs (feed_source, external_id) WHERE external_id IS NOT NULL`;

  // Per-user job actions (ignore / applied)
  await db`
    CREATE TABLE IF NOT EXISTS user_job_state (
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      ignored INTEGER NOT NULL DEFAULT 0,
      application_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, job_id)
    )`;

  // Compatibility + built-in ATS scores vs resume / career profile
  await db`
    CREATE TABLE IF NOT EXISTS job_scores (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      resume_id TEXT,
      compatibility_score INTEGER NOT NULL DEFAULT 0,
      ats_score INTEGER NOT NULL DEFAULT 0,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, job_id)
    )`;
  await db`CREATE INDEX IF NOT EXISTS job_scores_user_job_idx ON job_scores (user_id, job_id)`;

  // Cover letters link to jobs (or custom company/role), not only applications
  await db`ALTER TABLE cover_letters ADD COLUMN IF NOT EXISTS job_id TEXT`;
  await db`ALTER TABLE cover_letters ADD COLUMN IF NOT EXISTS company_name TEXT`;
  await db`ALTER TABLE cover_letters ADD COLUMN IF NOT EXISTS role_title TEXT`;

  // Tracker: which cover letter was used for an application
  await db`ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter_id TEXT`;
  await db`ALTER TABLE applications ADD COLUMN IF NOT EXISTS company_id TEXT`;

  // Optional resume text cache for matching (paste / future PDF extract)
  await db`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS extracted_text TEXT`;
  await db`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ats_score INTEGER`;

  // Friendships (invite link → confirm; accepted pairs for dashboard competition graphs)
  await db`
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY NOT NULL,
      inviter_id TEXT NOT NULL,
      invitee_id TEXT,
      invite_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      accepted_at TEXT
    )`;
  await db`CREATE INDEX IF NOT EXISTS friendships_inviter_idx ON friendships (inviter_id)`;
  await db`CREATE INDEX IF NOT EXISTS friendships_invitee_idx ON friendships (invitee_id)`;
  await db`CREATE INDEX IF NOT EXISTS friendships_status_idx ON friendships (status)`;

  // Ingest watermark
  await db`
    CREATE TABLE IF NOT EXISTS jobs_ingest_runs (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      fetched_count INTEGER NOT NULL DEFAULT 0,
      upserted_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL
    )`;

  await runDiscoverySchema(db);
}

/**
 * Columns/tables on web-owned data that job + people discovery read or write.
 * The discovery pipeline itself (registry, source refs, runs, contacts) lives in
 * FastAPI (`apps/api/app/discovery/`), which owns those tables and mirrors these
 * statements idempotently in `app/discovery/schema.py` — keep both in sync.
 * Timestamps stay ISO-8601 UTC TEXT so string comparison orders them correctly.
 */
async function runDiscoverySchema(db: NeonQueryFunction<false, false>) {
  // Canonical shared jobs: posting date is separate from first-seen; expiry uses
  // COALESCE(posted_at, first_seen_at). closed_at = no longer listed at the source.
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posted_at TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posted_at_estimated INTEGER NOT NULL DEFAULT 0`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS first_seen_at TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expired_at TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dedupe_key TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_years INTEGER`;
  await db`UPDATE jobs SET first_seen_at = created_at WHERE first_seen_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS jobs_shared_active_idx
    ON jobs (first_seen_at) WHERE user_id IS NULL AND expired_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS jobs_dedupe_key_idx ON jobs (dedupe_key) WHERE user_id IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS jobs_company_id_idx ON jobs (company_id)`;

  // Recommendations live on the existing per-user job state row.
  await db`ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS recommended_at TEXT`;
  await db`ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS score INTEGER`;
  await db`ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS reasons_json TEXT`;
  await db`CREATE INDEX IF NOT EXISTS user_job_state_recommended_idx
    ON user_job_state (user_id, recommended_at)`;

  await db`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS discovery_enabled INTEGER NOT NULL DEFAULT 1`;

  // Application history: system changes (job expiry) are recorded once per reason.
  await db`ALTER TABLE applications ADD COLUMN IF NOT EXISTS status_reason TEXT`;
  await db`ALTER TABLE applications ADD COLUMN IF NOT EXISTS status_changed_at TEXT`;
  await db`CREATE INDEX IF NOT EXISTS applications_job_id_idx ON applications (job_id)`;
  await db`
    CREATE TABLE IF NOT EXISTS application_events (
      id TEXT PRIMARY KEY NOT NULL,
      application_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      reason TEXT,
      actor TEXT NOT NULL CHECK (actor IN ('user', 'system')),
      created_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS application_events_app_idx ON application_events (application_id)`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS application_events_system_reason_uidx
    ON application_events (application_id, reason) WHERE actor = 'system'`;

  // People: shared entities linked to companies; contacts, job relevance and votes are separate.
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS company_id TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'user'`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS dedupe_key TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS linkedin_url_normalized TEXT`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS people_linkedin_uidx
    ON people (linkedin_url_normalized) WHERE linkedin_url_normalized IS NOT NULL`;
  await db`CREATE INDEX IF NOT EXISTS people_dedupe_key_idx ON people (dedupe_key)`;
  await db`CREATE INDEX IF NOT EXISTS people_company_id_idx ON people (company_id)`;
  await db`
    CREATE TABLE IF NOT EXISTS job_person_relevance (
      job_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (job_id, person_id)
    )`;
  await db`
    CREATE TABLE IF NOT EXISTS person_votes (
      user_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, person_id)
    )`;
  await db`CREATE INDEX IF NOT EXISTS person_votes_person_idx ON person_votes (person_id)`;

  await purgeDemoJobs(db);
}

/**
 * Remove invented jobs left by the retired demo generator (`ensureDemoJobs`, fixed
 * example.com/jobs URLs, source "demo") and the old sample ingest (example.com/feeds,
 * feed_source "sample-*"). Idempotent; a no-op once they are gone. Applications, cover
 * letters, and analyses a user created from them are kept and just unlinked.
 */
async function purgeDemoJobs(db: NeonQueryFunction<false, false>) {
  const demo = await db`
    SELECT id FROM jobs
    WHERE source = 'demo'
       OR url LIKE 'https://example.com/jobs/%'
       OR url LIKE 'https://example.com/feeds/%'
       OR feed_source LIKE 'sample-%'
  `;
  const ids = (demo as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return;
  await db`UPDATE applications SET job_id = NULL WHERE job_id = ANY(${ids})`;
  await db`UPDATE cover_letters SET job_id = NULL WHERE job_id = ANY(${ids})`;
  await db`UPDATE job_analyses SET job_id = NULL WHERE job_id = ANY(${ids})`;
  await db`DELETE FROM user_job_state WHERE job_id = ANY(${ids})`;
  await db`DELETE FROM job_scores WHERE job_id = ANY(${ids})`;
  await db`DELETE FROM job_person_relevance WHERE job_id = ANY(${ids})`;
  await db`DELETE FROM jobs WHERE id = ANY(${ids})`;
}

/** Ensure Postgres app schema exists (idempotent). */
export async function ensureAppSchema() {
  if (!schemaReady) {
    schemaReady = runSchema().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

/** @deprecated Use getSql() + ensureAppSchema(); kept name for fewer import churns during migration. */
export async function getAppDb() {
  await ensureAppSchema();
  return getSql();
}
