import "server-only";

import { cleanStoredDescriptions } from "@/lib/jd-clean-migrate";
import { normalizeStoredLocations } from "@/lib/locations/migrate";
import { createHash } from "node:crypto";

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
  // Reply detection (gmail.readonly): when a reply to this mail was last seen, and when the thread
  // was last checked (oldest-checked threads are read first).
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS replied_at TEXT`;
  await db`ALTER TABLE follow_up_tasks ADD COLUMN IF NOT EXISTS reply_checked_at TEXT`;
  await db`
    CREATE TABLE IF NOT EXISTS mail_replies (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      follow_up_id TEXT NOT NULL,
      gmail_message_id TEXT NOT NULL,
      gmail_thread_id TEXT NOT NULL,
      from_address TEXT NOT NULL,
      subject TEXT,
      body_text TEXT NOT NULL,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, gmail_message_id)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS mail_replies_follow_up_idx ON mail_replies (follow_up_id)`;
  // Sent by a system (bounce, auto-reply, out-of-office), not the person: shown in the inbox but
  // never counted as a reply. Set from Gmail headers on sync; see the backfill below.
  await db`ALTER TABLE mail_replies ADD COLUMN IF NOT EXISTS automated INTEGER NOT NULL DEFAULT 0`;
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
  await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS years_experience DOUBLE PRECISION`;
  // Backfill exact years from the old bucket (same mapping the ATS defaulted to). Idempotent.
  await db`
    UPDATE profiles SET years_experience = CASE experience_level
      WHEN '0-1' THEN 0.5 WHEN '1-3' THEN 2 WHEN '3-5' THEN 4 WHEN '5-8' THEN 6 WHEN '8+' THEN 10
    END
    WHERE years_experience IS NULL AND experience_level IS NOT NULL
  `;
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
  // Add job from a link: the link the user pasted, plus details read from the posting.
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_url TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_mode TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS employment_type TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS seniority TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills_json TEXT NOT NULL DEFAULT '[]'`;
  // Text a job's location had before it was mapped to a canonical value (lib/locations).
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_raw TEXT`;
  // Description as parsed, before JD boilerplate stripping (lib/jd-clean); set only if changed.
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_raw TEXT`;
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
  await db`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ats_inputs TEXT`;
  // Resume Improver: a saved revision points at the resume it came from (original untouched).
  await db`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS source_resume_id TEXT`;
  await db`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'upload'`;
  await db`
    CREATE TABLE IF NOT EXISTS resume_improvements (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      source_resume_id TEXT NOT NULL,
      result_resume_id TEXT NOT NULL,
      role TEXT NOT NULL,
      jd_text TEXT NOT NULL DEFAULT '',
      years_experience REAL,
      snapshot JSONB NOT NULL,
      before_scores JSONB NOT NULL,
      after_scores JSONB NOT NULL,
      changes JSONB NOT NULL,
      created_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS resume_improvements_user_idx ON resume_improvements (user_id, created_at DESC)`;

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

  // One-off data migrations, each recorded once in app_migrations.
  await db`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    )`;
  await normalizeStoredLocations(db);
  await cleanStoredDescriptions(db);
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
  // Experience range upper end, region (india | india_remote | remote | global) and the ISO
  // country of the job's canonical city — written by discovery at ingest.
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_years INTEGER`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS region TEXT`;
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country_code TEXT`;
  // Application / recruiting email published in a posting's text (unverified, never guessed).
  await db`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_email TEXT`;
  await db`UPDATE jobs SET first_seen_at = created_at WHERE first_seen_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS jobs_shared_active_idx
    ON jobs (first_seen_at) WHERE user_id IS NULL AND expired_at IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS jobs_dedupe_key_idx ON jobs (dedupe_key) WHERE user_id IS NULL`;
  await db`CREATE INDEX IF NOT EXISTS jobs_company_id_idx ON jobs (company_id)`;

  // Recommendations live on the existing per-user job state row.
  await db`ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS recommended_at TEXT`;
  await db`ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS score INTEGER`;
  await db`ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS reasons_json TEXT`;
  // 'rerank' = hidden by ranking (no longer fits), not by the user; re-offered once it fits
  // again. Rows hidden before this column existed have the same shape and are tagged here.
  await db`ALTER TABLE user_job_state ADD COLUMN IF NOT EXISTS hidden_reason TEXT`;
  await db`UPDATE user_job_state SET hidden_reason = 'rerank'
    WHERE hidden_reason IS NULL AND recommended_at IS NULL AND score IS NULL
      AND ignored = 0 AND application_id IS NULL`;
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
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS seniority TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS department TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS company_domain TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS location TEXT`;
  // Canonical "City, Country" and ISO country parsed from `location` (discovery).
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS location_city TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS country_code TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS github_url TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS website_url TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS twitter_url TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS phone TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS confidence INTEGER`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS last_seen_at TEXT`;
  await db`ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern TEXT`;
  await db`ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_domain TEXT`;
  await db`ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_confidence INTEGER`;
  await db`ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_evidence INTEGER`;
  await db`ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_source TEXT`;
  await db`ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_pattern_updated_at TEXT`;
  await db`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM people WHERE user_id IS NULL AND email IS NOT NULL
                   GROUP BY lower(email) HAVING count(*) > 1) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS people_shared_email_uidx
        ON people (lower(email)) WHERE user_id IS NULL AND email IS NOT NULL;
    END IF;
  END $$`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS discovery_source TEXT`;
  await db`ALTER TABLE people ADD COLUMN IF NOT EXISTS github_login TEXT`;
  await db`CREATE UNIQUE INDEX IF NOT EXISTS people_github_login_uidx
    ON people (github_login) WHERE github_login IS NOT NULL`;
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
  // System credit, separate from user votes: +1 to a person's score the first time they
  // reply (a real reply from their own address) to a given user's referral or follow-up mail.
  // One row per (person, user), so mailing the same person again never adds more.
  await db`
    CREATE TABLE IF NOT EXISTS person_reply_credits (
      person_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      follow_up_id TEXT NOT NULL,
      gmail_message_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (person_id, user_id)
    )`;
  await db`CREATE INDEX IF NOT EXISTS person_reply_credits_person_idx ON person_reply_credits (person_id)`;
  await cleanUpAutomatedReplies(db);

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

/**
 * Replies stored before `mail_replies.automated` existed: flag system senders and system
 * subjects (mirrors AUTO_SENDER_RE / AUTO_SUBJECT_RE in lib/mail-reply-parse.ts; the header
 * checks need Gmail and are re-applied when a thread is next synced). Then drop reply credits
 * that a bounce or another sender earned, and recompute `replied_at` from real replies only.
 * Every statement matches nothing once the data is clean, so this is safe on each cold start.
 */
async function cleanUpAutomatedReplies(db: NeonQueryFunction<false, false>) {
  await db`
    UPDATE mail_replies SET automated = 1
    WHERE automated = 0
      AND (
        from_address ~* '^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@'
        OR subject ~* '^[[:space:]]*(automatic reply|auto(matic)?[- ]?reply|auto[- ]?response|out of (the )?office|ooo[[:>:]]|away from (the )?office|undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail)'
      )
  `;
  // A credit is only for a human reply from the address the mail went to.
  await db`
    DELETE FROM person_reply_credits c
    USING mail_replies r, people p
    WHERE r.user_id = c.user_id
      AND r.gmail_message_id = c.gmail_message_id
      AND p.id = c.person_id
      AND (r.automated = 1 OR p.email IS NULL OR r.from_address <> lower(trim(p.email)))
  `;
  await db`
    UPDATE follow_up_tasks f
    SET replied_at = (
      SELECT MAX(r.received_at) FROM mail_replies r
      WHERE r.follow_up_id = f.id AND r.automated = 0
    )
    WHERE EXISTS (SELECT 1 FROM mail_replies r WHERE r.follow_up_id = f.id AND r.automated = 1)
  `;
}

/**
 * Bump when a schema statement or data migration changes. The source of every setup step is
 * hashed in too, so an edit that forgets the bump still re-runs setup once (a false re-run is
 * harmless: every statement is idempotent).
 */
const SCHEMA_VERSION_BASE = "web-2026-10-13.1";

function schemaVersion() {
  const src = [
    runSchema,
    runDiscoverySchema,
    purgeDemoJobs,
    cleanUpAutomatedReplies,
    normalizeStoredLocations,
    cleanStoredDescriptions,
  ]
    .map((fn) => fn.toString())
    .join("\n");
  return `${SCHEMA_VERSION_BASE}:${createHash("sha256").update(src).digest("hex").slice(0, 16)}`;
}

/** One round trip: is the recorded version current? A missing table counts as "no". */
async function schemaIsCurrent(db: NeonQueryFunction<false, false>, version: string) {
  const rows = (await db`
    SELECT CASE WHEN to_regclass('schema_version') IS NULL THEN NULL
      ELSE (SELECT version FROM schema_version WHERE id = 'web') END AS version
  `.catch(() => [])) as Array<{ version: string | null }>;
  return rows[0]?.version === version;
}

/**
 * Full setup, then record the version. Two cold starts racing both run it; that is safe
 * because every statement is idempotent (Neon's HTTP driver has no session to hold a lock).
 */
async function setUpSchema() {
  const db = getSql();
  const version = schemaVersion();
  if (await schemaIsCurrent(db, version)) return;
  await runSchema();
  await db`
    CREATE TABLE IF NOT EXISTS schema_version (
      id TEXT PRIMARY KEY NOT NULL,
      version TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`;
  await db`
    INSERT INTO schema_version (id, version, applied_at)
    VALUES ('web', ${version}, ${new Date().toISOString()})
    ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = EXCLUDED.applied_at
  `;
}

/**
 * Ensure Postgres app schema exists. Costs one query per cold start when the stored
 * schema version matches; runs the full idempotent setup only after a schema change.
 */
export async function ensureAppSchema() {
  if (!schemaReady) {
    schemaReady = setUpSchema().catch((err) => {
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
