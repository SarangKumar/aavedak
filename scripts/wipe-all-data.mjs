#!/usr/bin/env node
/**
 * One-shot wipe of ALL Aavedak app + Better Auth data on Neon, and GCS resume objects.
 * Does NOT delete GCP OAuth client credentials — only DB rows/tokens.
 *
 * Usage (from repo root):
 *   node --experimental-import-meta-resolve scripts/wipe-all-data.mjs
 *   # or:
 *   pnpm --filter web exec node ../../scripts/wipe-all-data.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const webRoot = resolve(root, "apps/web");
const requireFromWeb = createRequire(resolve(webRoot, "package.json"));

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(resolve(webRoot, ".env"));
loadEnvFile(resolve(webRoot, ".env.local"));

function normalizePrivateKey(raw) {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  while (s.includes("\\n")) s = s.replace(/\\n/g, "\n");
  return s.replace(/\r\n/g, "\n").trim();
}

const { neon } = requireFromWeb("@neondatabase/serverless");
const { Storage } = requireFromWeb("@google-cloud/storage");

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = neon(url);

const TABLES = [
  "friendships",
  "job_scores",
  "user_job_state",
  "follow_up_tasks",
  "job_analyses",
  "jobs_ingest_runs",
  "jobs",
  "cover_letters",
  "templates",
  "applications",
  "resumes",
  "user_preferences",
  "people",
  "companies",
  "profiles",
  "session",
  "account",
  "verification",
  "user",
];

async function countAll() {
  const out = {};
  for (const table of TABLES) {
    try {
      const rows = await sql.query(`SELECT COUNT(*)::int AS c FROM "${table}"`);
      out[table] = rows[0]?.c ?? 0;
    } catch {
      out[table] = null;
    }
  }
  return out;
}

async function wipeGcs() {
  const bucketName = process.env.GCS_BUCKET?.trim();
  if (!bucketName) {
    console.log("GCS_BUCKET not set — skipping resume object wipe.");
    return { deleted: 0, skipped: true };
  }
  const clientEmail = process.env.GCS_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GCS_PRIVATE_KEY?.trim();
  const credentialsJson = process.env.GCS_CREDENTIALS_JSON?.trim();

  let storage;
  if (clientEmail && privateKeyRaw) {
    storage = new Storage({
      credentials: {
        client_email: clientEmail,
        private_key: normalizePrivateKey(privateKeyRaw),
      },
    });
  } else if (credentialsJson) {
    const parsed = JSON.parse(credentialsJson);
    storage = new Storage({
      projectId: parsed.project_id,
      credentials: {
        client_email: parsed.client_email,
        private_key: normalizePrivateKey(parsed.private_key),
      },
    });
  } else {
    storage = new Storage();
  }

  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: "resumes/" });
  let deleted = 0;
  for (const file of files) {
    await file.delete({ ignoreNotFound: true });
    deleted += 1;
  }
  return { deleted, skipped: false, bucket: bucketName };
}

const before = await countAll();
console.log("Before:", before);

try {
  await sql`
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY NOT NULL,
      inviter_id TEXT NOT NULL,
      invitee_id TEXT,
      invite_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      accepted_at TEXT
    )
  `;
} catch (e) {
  console.warn("friendships ensure:", e.message);
}

for (const table of TABLES) {
  try {
    await sql.query(`DELETE FROM "${table}"`);
    console.log(`wiped ${table}`);
  } catch (e) {
    console.warn(`skip ${table}:`, e.message);
  }
}

const after = await countAll();
console.log("After:", after);

try {
  const gcs = await wipeGcs();
  console.log("GCS resumes/ deleted:", gcs);
} catch (e) {
  console.error("GCS wipe failed:", e.message);
}

console.log(
  "\nDone. Users must sign in again with Google and re-consent Gmail send if needed.",
);
console.log("GCP OAuth client credentials were NOT deleted.");
