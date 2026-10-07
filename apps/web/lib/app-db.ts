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
      kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('outreach', 'cover', 'other')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS templates_user_id_idx ON templates (user_id)`;

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
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'queued', 'sent_stub', 'done', 'dismissed')),
      person_id TEXT,
      application_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`;
  await db`CREATE INDEX IF NOT EXISTS follow_up_tasks_user_id_idx ON follow_up_tasks (user_id)`;
  await db`CREATE INDEX IF NOT EXISTS follow_up_tasks_user_status_idx ON follow_up_tasks (user_id, status)`;

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
