import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { DatabaseConfigError, resolvePostgresUrl } from "@/lib/db-config";

export type SqlParam = string | number | null | Buffer;

export type AppStatement = {
  all<T = Record<string, unknown>>(...params: SqlParam[]): Promise<T[]>;
  get<T = Record<string, unknown>>(...params: SqlParam[]): Promise<T | undefined>;
  run(...params: SqlParam[]): Promise<{ changes: number }>;
};

export type AppDatabase = {
  dialect: "postgres";
  prepare(sql: string): AppStatement;
  exec(sql: string): Promise<void>;
};

const SQLITE_SCHEMA = `
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
  text_excerpt TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, display_name)
);

CREATE INDEX IF NOT EXISTS resumes_user_id_idx ON resumes (user_id);
CREATE INDEX IF NOT EXISTS resumes_user_status_idx ON resumes (user_id, status);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS companies_user_id_idx ON companies (user_id);

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
  company_name TEXT,
  role TEXT,
  job_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cover_letters_user_id_idx ON cover_letters (user_id);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('outreach', 'cover', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS templates_user_id_idx ON templates (user_id);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  company_id TEXT,
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent_stub', 'sent', 'failed', 'done', 'dismissed')),
  person_id TEXT,
  application_id TEXT,
  notes TEXT,
  to_email TEXT,
  subject TEXT,
  body_text TEXT,
  gmail_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS follow_up_tasks_user_id_idx ON follow_up_tasks (user_id);
CREATE INDEX IF NOT EXISTS follow_up_tasks_user_status_idx ON follow_up_tasks (user_id, status);

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
  external_id TEXT,
  ats_score INTEGER,
  resume_match_score INTEGER,
  decision TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs (user_id);
CREATE INDEX IF NOT EXISTS jobs_user_source_idx ON jobs (user_id, source);

CREATE TABLE IF NOT EXISTS job_analyses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  summary TEXT,
  job_id TEXT,
  company_name TEXT,
  role_title TEXT,
  ats_score INTEGER,
  resume_match_score INTEGER,
  cover_letter_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS job_analyses_user_id_idx ON job_analyses (user_id);
`;

let opening: Promise<AppDatabase> | null = null;
let sqlClient: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!sqlClient) {
    const url = resolvePostgresUrl();
    if (!url) throw new DatabaseConfigError("Postgres URL is not configured.");
    sqlClient = neon(url);
  }
  return sqlClient;
}

/** `?` placeholders and SQLite NOCASE become Postgres `$n` / lower(). */
export function toPostgresSql(sql: string): string {
  let text = sql.replace(/ORDER BY\s+([\w.]+)\s+COLLATE\s+NOCASE/gi, "ORDER BY lower($1)");
  text = text.replace(/([\w.]+)\s*=\s*\?\s+COLLATE\s+NOCASE/gi, "lower($1) = lower(?)");
  text = text.replace(/\s+COLLATE\s+NOCASE/gi, "");
  let n = 0;
  text = text.replace(/\?/g, () => `$${++n}`);
  return text;
}

export function getAppDb(): Promise<AppDatabase> {
  if (!opening) {
    opening = openAppDb().catch((err) => {
      opening = null;
      throw err;
    });
  }
  return opening;
}

async function openAppDb(): Promise<AppDatabase> {
  const url = resolvePostgresUrl();
  if (!url) {
    throw new DatabaseConfigError(
      "DATABASE_URL is missing or is not a postgresql:// Neon connection string. Copy it from the Neon Console.",
    );
  }
  const db = wrapPostgres(getSql());
  await migratePostgres(db);
  return db;
}

function isPgConnectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code) : "";
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed|password authentication failed|getaddrinfo|certificate|28P01|57P01|08006|CONNECT_TIMEOUT/i.test(
    `${code} ${message}`,
  );
}

function wrapPostgres(sql: NeonQueryFunction<false, false>): AppDatabase {
  async function query(statement: string, params: SqlParam[] = []): Promise<unknown[]> {
    try {
      const rows = await sql.query(toPostgresSql(statement), params);
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      if (isPgConnectionError(err)) {
        const message = err instanceof Error ? err.message : String(err);
        throw new DatabaseConfigError(
          `Neon Postgres connection failed. Check DATABASE_URL (postgresql://… from the Neon Console) and that this host can reach it. ${message}`,
          { cause: err },
        );
      }
      throw err;
    }
  }

  return {
    dialect: "postgres",
    prepare(statement: string): AppStatement {
      return {
        all: async <T>(...params: SqlParam[]) => (await query(statement, params)) as T[],
        get: async <T>(...params: SqlParam[]) => {
          const rows = await query(statement, params);
          return rows[0] as T | undefined;
        },
        run: async (...params: SqlParam[]) => {
          const rows = await query(statement, params);
          return { changes: rows.length };
        },
      };
    },
    exec: async (script: string) => {
      const parts = script
        .split(/;\s*(?:\n|$)/)
        .map((part) => part.trim())
        .filter(Boolean);
      for (const part of parts) await query(part);
    },
  };
}

async function migratePostgres(db: AppDatabase): Promise<void> {
  await db.exec(SQLITE_SCHEMA);
  const columns: Array<[string, string, string]> = [
    ["resumes", "text_excerpt", "TEXT"],
    ["applications", "applied_at", "TEXT"],
    ["profiles", "bio", "TEXT"],
    ["profiles", "portfolio_url", "TEXT"],
    ["profiles", "linkedin_url", "TEXT"],
    ["profiles", "image_url", "TEXT"],
    ["profiles", "links_json", "TEXT"],
    ["templates", "subject", "TEXT"],
    ["follow_up_tasks", "send_after", "TEXT"],
    ["follow_up_tasks", "to_email", "TEXT"],
    ["follow_up_tasks", "subject", "TEXT"],
    ["follow_up_tasks", "body_text", "TEXT"],
    ["follow_up_tasks", "gmail_message_id", "TEXT"],
    ["follow_up_tasks", "last_error", "TEXT"],
    ["people", "company_id", "TEXT"],
    ["jobs", "external_id", "TEXT"],
    ["jobs", "ats_score", "INTEGER"],
    ["jobs", "resume_match_score", "INTEGER"],
    ["jobs", "decision", "TEXT"],
    ["cover_letters", "company_name", "TEXT"],
    ["cover_letters", "role", "TEXT"],
    ["cover_letters", "job_id", "TEXT"],
    ["job_analyses", "company_name", "TEXT"],
    ["job_analyses", "role_title", "TEXT"],
    ["job_analyses", "ats_score", "INTEGER"],
    ["job_analyses", "resume_match_score", "INTEGER"],
    ["job_analyses", "cover_letter_id", "TEXT"],
  ];
  for (const [table, column, type] of columns) {
    await addColumnIfMissing(db, table, column, type);
  }
  await db.exec(`
    CREATE INDEX IF NOT EXISTS people_user_company_idx ON people (user_id, company_id);
    CREATE INDEX IF NOT EXISTS jobs_user_external_idx ON jobs (user_id, external_id);
  `);
}

async function addColumnIfMissing(
  db: AppDatabase,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  const rows = await db
    .prepare(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    )
    .all<{ name: string }>(table, column);
  if (rows.length > 0) return;
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export async function dbAll<T = Record<string, unknown>>(
  sql: string,
  ...params: SqlParam[]
): Promise<T[]> {
  const db = await getAppDb();
  return db.prepare(sql).all<T>(...params);
}

export async function dbGet<T = Record<string, unknown>>(
  sql: string,
  ...params: SqlParam[]
): Promise<T | undefined> {
  const db = await getAppDb();
  return db.prepare(sql).get<T>(...params);
}

export async function dbRun(sql: string, ...params: SqlParam[]): Promise<{ changes: number }> {
  const db = await getAppDb();
  return db.prepare(sql).run(...params);
}
