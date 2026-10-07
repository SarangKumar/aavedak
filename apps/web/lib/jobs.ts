import "server-only";

import { randomUUID } from "node:crypto";

import { dbAll, dbGet, dbRun } from "@/lib/app-db";
import { isServerlessRuntime } from "@/lib/db-config";
import { JOB_SOURCES, isJobSource, type JobSource, type JobStatus } from "@/lib/job-constants";

export { JOB_SOURCES, isJobSource, type JobSource, type JobStatus };

export type JobRecord = {
  id: string;
  userId: string;
  title: string;
  company: string;
  location: string;
  source: JobSource;
  url: string | null;
  description: string;
  salary: string | null;
  status: JobStatus;
  externalId: string | null;
  atsScore: number | null;
  resumeMatchScore: number | null;
  decision: "applied" | "ignored" | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  url: string | null;
  description: string;
  salary: string | null;
  status: JobStatus;
  external_id?: string | null;
  ats_score?: number | string | null;
  resume_match_score?: number | string | null;
  decision?: string | null;
  created_at: string;
  updated_at: string;
}): JobRecord {
  const source = (JOB_SOURCES as readonly string[]).includes(row.source)
    ? (row.source as JobSource)
    : "other";
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    company: row.company,
    location: row.location,
    source,
    url: row.url,
    description: row.description,
    salary: row.salary,
    status: row.status,
    externalId: row.external_id ?? null,
    atsScore: row.ats_score == null || row.ats_score === "" ? null : Number(row.ats_score),
    resumeMatchScore:
      row.resume_match_score == null || row.resume_match_score === ""
        ? null
        : Number(row.resume_match_score),
    decision: row.decision === "applied" || row.decision === "ignored" ? row.decision : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const t = value.trim();
  if (t.length > 300) throw new Error(`${label} is too long.`);
  return t;
}

function optional(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function parseSource(value: unknown): JobSource {
  if (typeof value === "string" && (JOB_SOURCES as readonly string[]).includes(value)) {
    return value as JobSource;
  }
  return "manual";
}

export async function listJobs(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<JobRecord[]> {
  const includeArchived = opts?.includeArchived ?? false;
  const sql = includeArchived
    ? `SELECT * FROM jobs WHERE user_id = ? ORDER BY updated_at DESC`
    : `SELECT * FROM jobs WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC`;
  const rows = (await dbAll(sql, userId)) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export async function getJob(userId: string, id: string): Promise<JobRecord | null> {
  const row = (await dbGet(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`, id, userId)) as
    Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export async function countJobs(userId: string): Promise<number> {
  const row = await dbGet<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND status != 'archived'`,
    userId,
  );
  return Number(row?.n ?? 0);
}

export async function createJob(
  userId: string,
  input: {
    title: string;
    company: string;
    location: string;
    source?: JobSource;
    url?: string | null;
    description?: string;
    salary?: string | null;
    externalId?: string | null;
    atsScore?: number | null;
    resumeMatchScore?: number | null;
  },
): Promise<JobRecord> {
  const title = requireText(input.title, "Title");
  const company = requireText(input.company, "Company");
  const location = requireText(input.location, "Location");
  const source = parseSource(input.source);
  const url = optional(input.url);
  const description = typeof input.description === "string" ? input.description : "";
  const salary = optional(input.salary);
  const externalId = optional(input.externalId);
  const id = randomUUID();
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO jobs
        (id, user_id, title, company, location, source, url, description, salary, status,
         external_id, ats_score, resume_match_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    id,
    userId,
    title,
    company,
    location,
    source,
    url,
    description,
    salary,
    externalId,
    input.atsScore ?? null,
    input.resumeMatchScore ?? null,
    now,
    now,
  );
  const created = await getJob(userId, id);
  if (!created) throw new Error("Could not save job.");
  return created;
}

export async function updateJob(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    company: string;
    location: string;
    source: JobSource;
    url: string | null;
    description: string;
    salary: string | null;
    status: JobStatus;
  }>,
): Promise<JobRecord> {
  const existing = await getJob(userId, id);
  if (!existing) throw new Error("Job not found.");

  const title = patch.title !== undefined ? requireText(patch.title, "Title") : existing.title;
  const company =
    patch.company !== undefined ? requireText(patch.company, "Company") : existing.company;
  const location =
    patch.location !== undefined ? requireText(patch.location, "Location") : existing.location;
  const source = patch.source !== undefined ? parseSource(patch.source) : existing.source;
  const url = patch.url !== undefined ? optional(patch.url) : existing.url;
  const description = patch.description !== undefined ? patch.description : existing.description;
  const salary = patch.salary !== undefined ? optional(patch.salary) : existing.salary;
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  await dbRun(
    `UPDATE jobs SET title = ?, company = ?, location = ?, source = ?, url = ?, description = ?,
         salary = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    title,
    company,
    location,
    source,
    url,
    description,
    salary,
    status,
    now,
    id,
    userId,
  );
  const updated = await getJob(userId, id);
  if (!updated) throw new Error("Could not save job.");
  return updated;
}

export async function setJobDecision(
  userId: string,
  id: string,
  decision: "applied" | "ignored",
): Promise<JobRecord> {
  const existing = await getJob(userId, id);
  if (!existing) throw new Error("Job not found.");
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE jobs SET decision = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    decision,
    now,
    id,
    userId,
  );
  const updated = await getJob(userId, id);
  if (!updated) throw new Error("Job not found.");
  return updated;
}

export async function saveJobScores(
  userId: string,
  id: string,
  scores: { atsScore: number; resumeMatchScore: number },
): Promise<JobRecord> {
  const existing = await getJob(userId, id);
  if (!existing) throw new Error("Job not found.");
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE jobs SET ats_score = ?, resume_match_score = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    scores.atsScore,
    scores.resumeMatchScore,
    now,
    id,
    userId,
  );
  const updated = await getJob(userId, id);
  if (!updated) throw new Error("Job not found.");
  return updated;
}

export async function findJobByExternalId(
  userId: string,
  externalId: string,
): Promise<JobRecord | null> {
  const row = (await dbGet(
    `SELECT * FROM jobs WHERE user_id = ? AND external_id = ? LIMIT 1`,
    userId,
    externalId,
  )) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export async function archiveJob(userId: string, id: string): Promise<JobRecord> {
  return updateJob(userId, id, { status: "archived" });
}

/** Seed multi-source demo cards when empty; top up missing sample titles up to 6. */
export async function ensureDemoJobs(userId: string): Promise<JobRecord[]> {
  if (isServerlessRuntime() && process.env.JOBS_INGEST_SAMPLE !== "1") {
    return await listJobs(userId);
  }
  const samples = [
    {
      title: "Senior Frontend Engineer",
      company: "Northwind Labs",
      location: "Bengaluru · Hybrid",
      source: "demo" as const,
      url: "https://example.com/jobs/northwind-frontend",
      salary: "₹35–45 LPA",
      description:
        "Build dense product UI for a career OS. React, TypeScript, Tailwind. Own design-system collaboration with Vinyaas.\n\nRequirements:\n• 4+ years React/TypeScript\n• Design-system experience\n• Comfortable with Next.js App Router",
    },
    {
      title: "Full Stack Engineer",
      company: "Cascade Analytics",
      location: "Remote · India",
      source: "linkedin" as const,
      url: "https://example.com/jobs/cascade-fullstack",
      salary: "₹28–38 LPA",
      description:
        "Ship Next.js + API services. Experience with SQLite/Postgres and auth flows preferred.\n\nNice to have: Better Auth, Drizzle, or similar.",
    },
    {
      title: "Product Engineer",
      company: "Aether Careers",
      location: "Mumbai · Onsite",
      source: "careers" as const,
      url: "https://example.com/jobs/aether-product",
      salary: null,
      description:
        "0→1 features across discovery, applications, and referrals. Strong taste for UX density and micro-interactions.",
    },
    {
      title: "Platform Engineer",
      company: "Herald Systems",
      location: "Hyderabad · Hybrid",
      source: "indeed" as const,
      url: "https://example.com/jobs/herald-platform",
      salary: "₹32–42 LPA",
      description:
        "Own CI/CD, observability, and internal developer tooling. Kubernetes and Terraform experience preferred.",
    },
    {
      title: "Mobile Engineer (React Native)",
      company: "Lotus Health",
      location: "Pune · Hybrid",
      source: "manual" as const,
      url: null,
      salary: "₹24–32 LPA",
      description:
        "Ship patient-facing React Native apps. Collaboration with design and clinical product teams.",
    },
    {
      title: "Backend Engineer",
      company: "Orbit Freight",
      location: "Gurugram · Onsite",
      source: "other" as const,
      url: "https://example.com/jobs/orbit-backend",
      salary: "₹30–40 LPA",
      description:
        "APIs for logistics ops. Node/Go, Postgres, event-driven services. On-call rotation shared.",
    },
  ];

  const existing = await listJobs(userId);
  const titles = new Set(existing.map((j) => j.title.toLowerCase()));
  if (existing.length === 0) {
    for (const sample of samples) await createJob(userId, sample);
    return await listJobs(userId);
  }

  // Top up missing sample titles once (keeps user-added jobs intact).
  if (existing.length < 6) {
    for (const sample of samples) {
      if (titles.has(sample.title.toLowerCase())) continue;
      await createJob(userId, sample);
      titles.add(sample.title.toLowerCase());
      if ((await countJobs(userId)) >= 6) break;
    }
  }
  return await listJobs(userId);
}
