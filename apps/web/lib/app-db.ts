import "server-only";

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Local app data (profiles + resumes + applications). Separate from Better Auth `data/local.db`.
 * Production will move to MySQL / R2 — keep this API surface stable.
 */
const dataRoot = path.join(process.cwd(), ".data");
const resumesRoot = path.join(dataRoot, "resumes");

let db: Database.Database | null = null;

export function getDataRoot() {
  return dataRoot;
}

export function getResumesRoot() {
  return resumesRoot;
}

export function getAppDb() {
  if (db) return db;
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(resumesRoot, { recursive: true });
  const instance = new Database(path.join(dataRoot, "app.db"));
  instance.pragma("journal_mode = WAL");
  instance.exec(`
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
    );

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
    );

    CREATE INDEX IF NOT EXISTS resumes_user_id_idx ON resumes (user_id);
    CREATE INDEX IF NOT EXISTS resumes_user_status_idx ON resumes (user_id, status);

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
    );

    CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications (user_id);
    CREATE INDEX IF NOT EXISTS applications_user_status_idx ON applications (user_id, status);

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY NOT NULL,
      tracker_view TEXT NOT NULL DEFAULT 'kanban',
      tracker_scope TEXT NOT NULL DEFAULT 'active',
      hidden_columns TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cover_letters (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      application_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS cover_letters_user_id_idx ON cover_letters (user_id);

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('outreach', 'cover', 'other')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS templates_user_id_idx ON templates (user_id);

    /* User-scoped contacts for referrals/outreach (local v1).
       Global/admin Person.email sync comes later — never overwrite from here. */
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      company TEXT,
      role_title TEXT,
      notes TEXT,
      application_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS people_user_id_idx ON people (user_id);

    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      send_after TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent_stub', 'done', 'dismissed')),
      person_id TEXT,
      application_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS follow_up_tasks_user_id_idx ON follow_up_tasks (user_id);
    CREATE INDEX IF NOT EXISTS follow_up_tasks_user_status_idx ON follow_up_tasks (user_id, status);

    /* User-scoped jobs for local v1 (multi-source ingestion later). */
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
    );

    CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs (user_id);
    CREATE INDEX IF NOT EXISTS jobs_user_source_idx ON jobs (user_id, source);

    /* Pasted JD analysis — user-scoped; does not create global Job records. */
    CREATE TABLE IF NOT EXISTS job_analyses (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      summary TEXT,
      job_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS job_analyses_user_id_idx ON job_analyses (user_id);
  `);
  // Migrations for existing local DBs
  const appCols = instance.prepare(`PRAGMA table_info(applications)`).all() as Array<{
    name: string;
  }>;
  if (!appCols.some((c) => c.name === "applied_at")) {
    instance.exec(`ALTER TABLE applications ADD COLUMN applied_at TEXT`);
  }

  const profileCols = instance.prepare(`PRAGMA table_info(profiles)`).all() as Array<{
    name: string;
  }>;
  const profileColNames = new Set(profileCols.map((c) => c.name));
  if (!profileColNames.has("bio")) {
    instance.exec(`ALTER TABLE profiles ADD COLUMN bio TEXT`);
  }
  if (!profileColNames.has("portfolio_url")) {
    instance.exec(`ALTER TABLE profiles ADD COLUMN portfolio_url TEXT`);
  }
  if (!profileColNames.has("linkedin_url")) {
    instance.exec(`ALTER TABLE profiles ADD COLUMN linkedin_url TEXT`);
  }
  if (!profileColNames.has("image_url")) {
    instance.exec(`ALTER TABLE profiles ADD COLUMN image_url TEXT`);
  }
  if (!profileColNames.has("links_json")) {
    instance.exec(`ALTER TABLE profiles ADD COLUMN links_json TEXT NOT NULL DEFAULT '{}'`);
  }

  const templateCols = instance.prepare(`PRAGMA table_info(templates)`).all() as Array<{
    name: string;
  }>;
  if (!templateCols.some((c) => c.name === "subject")) {
    instance.exec(`ALTER TABLE templates ADD COLUMN subject TEXT NOT NULL DEFAULT ''`);
  }

  const followCols = instance.prepare(`PRAGMA table_info(follow_up_tasks)`).all() as Array<{
    name: string;
  }>;
  const followColNames = new Set(followCols.map((c) => c.name));
  if (!followColNames.has("send_after")) {
    instance.exec(`ALTER TABLE follow_up_tasks ADD COLUMN send_after TEXT`);
  }
  // Expand status CHECK for existing local DBs (SQLite cannot ALTER CHECK in place).
  const followSql = (
    instance
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'follow_up_tasks'`)
      .get() as { sql: string } | undefined
  )?.sql;
  if (followSql && !followSql.includes("'queued'")) {
    instance.exec(`
      CREATE TABLE follow_up_tasks__mig (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        due_date TEXT,
        send_after TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent_stub', 'done', 'dismissed')),
        person_id TEXT,
        application_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO follow_up_tasks__mig
        (id, user_id, title, due_date, send_after, status, person_id, application_id, notes, created_at, updated_at)
      SELECT id, user_id, title, due_date, send_after, status, person_id, application_id, notes, created_at, updated_at
      FROM follow_up_tasks;
      DROP TABLE follow_up_tasks;
      ALTER TABLE follow_up_tasks__mig RENAME TO follow_up_tasks;
      CREATE INDEX IF NOT EXISTS follow_up_tasks_user_id_idx ON follow_up_tasks (user_id);
      CREATE INDEX IF NOT EXISTS follow_up_tasks_user_status_idx ON follow_up_tasks (user_id, status);
    `);
  }

  db = instance;
  return instance;
}
