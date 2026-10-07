import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
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
  createdAt: string;
  updatedAt: string;
};

type Row = {
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
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): JobRecord {
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
  await ensureAppSchema();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = includeArchived
    ? ((await getSql()`
        SELECT * FROM jobs WHERE user_id = ${userId} ORDER BY updated_at DESC
      `) as Row[])
    : ((await getSql()`
        SELECT * FROM jobs WHERE user_id = ${userId} AND status != 'archived'
        ORDER BY updated_at DESC
      `) as Row[]);
  return rows.map(mapRow);
}

export async function getJob(userId: string, id: string): Promise<JobRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM jobs WHERE id = ${id} AND user_id = ${userId}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function countJobs(userId: string): Promise<number> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT COUNT(*)::int AS n FROM jobs WHERE user_id = ${userId} AND status != 'archived'
  `) as Array<{ n: number }>;
  return Number(rows[0]?.n) || 0;
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
  },
): Promise<JobRecord> {
  await ensureAppSchema();
  const title = requireText(input.title, "Title");
  const company = requireText(input.company, "Company");
  const location = requireText(input.location, "Location");
  const source = parseSource(input.source);
  const url = optional(input.url);
  const description = typeof input.description === "string" ? input.description : "";
  const salary = optional(input.salary);
  const id = randomUUID();
  const now = new Date().toISOString();
  await getSql()`
    INSERT INTO jobs
      (id, user_id, title, company, location, source, url, description, salary, status, created_at, updated_at)
    VALUES (
      ${id}, ${userId}, ${title}, ${company}, ${location}, ${source}, ${url}, ${description},
      ${salary}, 'active', ${now}, ${now}
    )
  `;
  const created = await getJob(userId, id);
  if (!created) throw new Error("Failed to create job.");
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
  await ensureAppSchema();
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
  await getSql()`
    UPDATE jobs SET
      title = ${title}, company = ${company}, location = ${location}, source = ${source},
      url = ${url}, description = ${description}, salary = ${salary}, status = ${status},
      updated_at = ${now}
    WHERE id = ${id} AND user_id = ${userId}
  `;
  const updated = await getJob(userId, id);
  if (!updated) throw new Error("Job not found after update.");
  return updated;
}

export async function archiveJob(userId: string, id: string): Promise<JobRecord> {
  return updateJob(userId, id, { status: "archived" });
}

export async function ensureDemoJobs(userId: string): Promise<JobRecord[]> {
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
        "Ship Next.js + API services. Experience with Postgres and auth flows preferred.\n\nNice to have: Neon Auth, Drizzle, or similar.",
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
    return listJobs(userId);
  }

  if (existing.length < 6) {
    for (const sample of samples) {
      if (titles.has(sample.title.toLowerCase())) continue;
      await createJob(userId, sample);
      titles.add(sample.title.toLowerCase());
      if ((await countJobs(userId)) >= 6) break;
    }
  }
  return listJobs(userId);
}
