import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { ensureCompany } from "@/lib/companies";
import { JOB_SOURCES, isJobSource, type JobSource, type JobStatus } from "@/lib/job-constants";

export { JOB_SOURCES, isJobSource, type JobSource, type JobStatus };

export type JobRecord = {
  id: string;
  /** Null = shared feed / global ingest job. */
  userId: string | null;
  title: string;
  company: string;
  companyId: string | null;
  location: string;
  source: JobSource;
  url: string | null;
  description: string;
  salary: string | null;
  status: JobStatus;
  externalId: string | null;
  feedSource: string | null;
  /** Posting date from the source (shared jobs); null when the source gave none. */
  postedAt: string | null;
  /** True when postedAt is unknown and age is measured from firstSeenAt. */
  postedAtEstimated: boolean;
  firstSeenAt: string | null;
  expiredAt: string | null;
  /** No longer listed by its source(s). */
  closedAt: string | null;
  minYears: number | null;
  createdAt: string;
  updatedAt: string;
};

export type UserJobState = {
  ignored: boolean;
  applicationId: string | null;
};

type Row = {
  id: string;
  user_id: string | null;
  title: string;
  company: string;
  company_id: string | null;
  location: string;
  source: string;
  url: string | null;
  description: string;
  salary: string | null;
  status: JobStatus;
  external_id: string | null;
  feed_source: string | null;
  posted_at?: string | null;
  posted_at_estimated?: number | null;
  first_seen_at?: string | null;
  expired_at?: string | null;
  closed_at?: string | null;
  min_years?: number | null;
  created_at: string;
  updated_at: string;
};

export function mapJobRow(row: Row): JobRecord {
  const source = (JOB_SOURCES as readonly string[]).includes(row.source)
    ? (row.source as JobSource)
    : "other";
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    company: row.company,
    companyId: row.company_id,
    location: row.location,
    source,
    url: row.url,
    description: row.description ?? "",
    salary: row.salary,
    status: row.status,
    externalId: row.external_id,
    feedSource: row.feed_source,
    postedAt: row.posted_at ?? null,
    postedAtEstimated: Boolean(row.posted_at_estimated),
    firstSeenAt: row.first_seen_at ?? null,
    expiredAt: row.expired_at ?? null,
    closedAt: row.closed_at ?? null,
    minYears: row.min_years == null ? null : Number(row.min_years),
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

export async function getJobById(id: string): Promise<JobRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM jobs WHERE id = ${id} LIMIT 1
  `) as Row[];
  return rows[0] ? mapJobRow(rows[0]) : null;
}

export async function getJob(userId: string, id: string): Promise<JobRecord | null> {
  const job = await getJobById(id);
  if (!job) return null;
  if (job.userId === null || job.userId === userId) return job;
  return null;
}

export async function getUserJobState(userId: string, jobId: string): Promise<UserJobState | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT ignored, application_id FROM user_job_state
    WHERE user_id = ${userId} AND job_id = ${jobId}
  `) as Array<{ ignored: number; application_id: string | null }>;
  if (!rows[0]) return null;
  return {
    ignored: Boolean(rows[0].ignored),
    applicationId: rows[0].application_id,
  };
}

export async function setJobIgnored(
  userId: string,
  jobId: string,
  ignored: boolean,
): Promise<void> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  const flag = ignored ? 1 : 0;
  await getSql()`
    INSERT INTO user_job_state (user_id, job_id, ignored, application_id, updated_at)
    VALUES (${userId}, ${jobId}, ${flag}, NULL, ${now})
    ON CONFLICT (user_id, job_id) DO UPDATE SET
      ignored = ${flag},
      updated_at = ${now}
  `;
}

export async function setJobApplicationLink(
  userId: string,
  jobId: string,
  applicationId: string,
): Promise<void> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  await getSql()`
    INSERT INTO user_job_state (user_id, job_id, ignored, application_id, updated_at)
    VALUES (${userId}, ${jobId}, 0, ${applicationId}, ${now})
    ON CONFLICT (user_id, job_id) DO UPDATE SET
      application_id = ${applicationId},
      ignored = 0,
      updated_at = ${now}
  `;
}

export async function listIgnoredJobIds(userId: string): Promise<Set<string>> {
  // Kept for callers that filter in memory; listJobsForUser filters in SQL.
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT job_id FROM user_job_state WHERE user_id = ${userId} AND ignored = 1
  `) as Array<{ job_id: string }>;
  return new Set(rows.map((r) => r.job_id));
}

/** Legacy demo rows from `ensureDemoJobs` (fixed example.com URLs) never show outside dev. */
const DEMO_URL_PREFIX = "https://example.com/jobs/";

/**
 * The user's job universe: their own (manual / pasted) jobs plus shared discovered jobs
 * they were recommended or acted on. Shared jobs no one recommended to this user stay
 * hidden — discovery (FastAPI) decides relevance. Ignored jobs are excluded unless asked.
 */
export async function listJobsForUser(
  userId: string,
  opts?: { includeArchived?: boolean; includeIgnored?: boolean },
): Promise<JobRecord[]> {
  await ensureAppSchema();
  const includeArchived = opts?.includeArchived ? 1 : 0;
  const includeIgnored = opts?.includeIgnored ? 1 : 0;
  const rows = (await getSql()`
    SELECT j.* FROM jobs j
    LEFT JOIN user_job_state s ON s.job_id = j.id AND s.user_id = ${userId}
    WHERE (j.user_id = ${userId} OR (j.user_id IS NULL AND s.user_id IS NOT NULL))
      AND (${includeArchived} = 1 OR j.status != 'archived')
      AND (${includeIgnored} = 1 OR COALESCE(s.ignored, 0) = 0)
      AND (j.url IS NULL OR j.url NOT LIKE ${DEMO_URL_PREFIX + "%"} OR ${process.env.NODE_ENV !== "production" ? 1 : 0} = 1)
    ORDER BY j.updated_at DESC
  `) as Row[];
  return rows.map(mapJobRow);
}

export type DiscoverJob = JobRecord & {
  recommendedAt: string | null;
  recommendationScore: number | null;
  reasons: { skills?: string[]; roles?: string[]; locations?: string[]; minYears?: number | null };
};

export type AppliedJob = JobRecord & {
  applicationId: string;
  applicationStatus: string;
  applicationUpdatedAt: string;
};

function parseReasons(raw: string | null | undefined): DiscoverJob["reasons"] {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? (value as DiscoverJob["reasons"]) : {};
  } catch {
    return {};
  }
}

/**
 * Discover tab: open recommendations (not applied, not ignored, not expired/closed) plus
 * the user's own manual jobs that have no application yet. Recommendations accumulate
 * until acted on; expiry/closure removes them.
 */
export async function listDiscoverJobs(userId: string): Promise<DiscoverJob[]> {
  await ensureAppSchema();
  const showDemo = process.env.NODE_ENV !== "production" ? 1 : 0;
  const rows = (await getSql()`
    SELECT j.*, s.recommended_at, s.score AS recommendation_score, s.reasons_json
    FROM jobs j
    LEFT JOIN user_job_state s ON s.job_id = j.id AND s.user_id = ${userId}
    WHERE j.status != 'archived'
      AND COALESCE(s.ignored, 0) = 0
      AND s.application_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.user_id = ${userId} AND a.job_id = j.id)
      AND (
        (j.user_id IS NULL AND s.recommended_at IS NOT NULL
          AND j.expired_at IS NULL AND j.closed_at IS NULL)
        OR (j.user_id = ${userId}
          AND (j.url IS NULL OR j.url NOT LIKE ${DEMO_URL_PREFIX + "%"} OR ${showDemo} = 1))
      )
    ORDER BY COALESCE(s.recommended_at, j.created_at) DESC, s.score DESC NULLS LAST
  `) as Array<
    Row & {
      recommended_at: string | null;
      recommendation_score: number | null;
      reasons_json: string | null;
    }
  >;
  return rows.map((row) => ({
    ...mapJobRow(row),
    recommendedAt: row.recommended_at,
    recommendationScore: row.recommendation_score == null ? null : Number(row.recommendation_score),
    reasons: parseReasons(row.reasons_json),
  }));
}

/**
 * Applied tab: jobs the user has an application for (any non-archived status), newest
 * application first. Expired shared jobs drop out; the application itself stays in the
 * tracker with its history.
 */
export async function listAppliedJobs(userId: string): Promise<AppliedJob[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT DISTINCT ON (j.id) j.*, a.id AS app_id, a.status AS app_status, a.updated_at AS app_updated_at
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.user_id = ${userId}
      AND a.status != 'archived'
      AND (j.user_id IS NULL OR j.user_id = ${userId})
      AND j.expired_at IS NULL
    ORDER BY j.id, a.updated_at DESC
  `) as Array<Row & { app_id: string; app_status: string; app_updated_at: string }>;
  return rows
    .map((row) => ({
      ...mapJobRow(row),
      applicationId: row.app_id,
      applicationStatus: row.app_status,
      applicationUpdatedAt: row.app_updated_at,
    }))
    .sort((a, b) => b.applicationUpdatedAt.localeCompare(a.applicationUpdatedAt));
}

/** @deprecated Prefer listJobsForUser — kept for older call sites. */
export async function listJobs(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<JobRecord[]> {
  return listJobsForUser(userId, opts);
}

export async function countJobs(userId: string): Promise<number> {
  return (await listJobsForUser(userId)).length;
}

export async function createJob(
  userId: string | null,
  input: {
    title: string;
    company: string;
    location: string;
    source?: JobSource;
    url?: string | null;
    description?: string;
    salary?: string | null;
    externalId?: string | null;
    feedSource?: string | null;
    companyId?: string | null;
  },
): Promise<JobRecord> {
  await ensureAppSchema();
  const title = requireText(input.title, "Title");
  const companyName = requireText(input.company, "Company");
  const location = requireText(input.location, "Location");
  const source = parseSource(input.source);
  const url = optional(input.url);
  const description = typeof input.description === "string" ? input.description : "";
  const salary = optional(input.salary);
  const externalId = optional(input.externalId);
  const feedSource = optional(input.feedSource);

  let companyId = optional(input.companyId);
  if (!companyId) {
    const company = await ensureCompany(companyName);
    companyId = company.id;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  await getSql()`
    INSERT INTO jobs
      (id, user_id, title, company, company_id, location, source, url, description, salary,
       status, external_id, feed_source, created_at, updated_at, first_seen_at)
    VALUES (
      ${id}, ${userId}, ${title}, ${companyName}, ${companyId}, ${location}, ${source}, ${url},
      ${description}, ${salary}, 'active', ${externalId}, ${feedSource}, ${now}, ${now}, ${now}
    )
  `;
  const created = await getJobById(id);
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
  if (existing.userId !== null && existing.userId !== userId) {
    throw new Error("Cannot edit a shared feed job.");
  }

  const title = patch.title !== undefined ? requireText(patch.title, "Title") : existing.title;
  let company = existing.company;
  let companyId = existing.companyId;
  if (patch.company !== undefined) {
    company = requireText(patch.company, "Company");
    const c = await ensureCompany(company);
    companyId = c.id;
  }
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
      title = ${title}, company = ${company}, company_id = ${companyId}, location = ${location},
      source = ${source}, url = ${url}, description = ${description}, salary = ${salary},
      status = ${status}, updated_at = ${now}
    WHERE id = ${id}
  `;
  const updated = await getJobById(id);
  if (!updated) throw new Error("Job not found after update.");
  return updated;
}

export async function archiveJob(userId: string, id: string): Promise<JobRecord> {
  const job = await getJob(userId, id);
  if (!job) throw new Error("Job not found.");
  if (job.userId === null) {
    await setJobIgnored(userId, id, true);
    return job;
  }
  return updateJob(userId, id, { status: "archived" });
}

/**
 * Dev-only sample jobs (fixed example.com URLs). Never runs in production: Aavedak must
 * not show invented jobs to real users.
 */
export async function ensureDemoJobs(userId: string): Promise<JobRecord[]> {
  if (process.env.NODE_ENV === "production" || process.env.JOBS_DEMO !== "1") {
    return listJobsForUser(userId);
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
        "Build dense product UI for a career OS. React, TypeScript, Tailwind. Own design-system collaboration with Vinyaas.\n\nRequirements:\n• 4+ years React/TypeScript\n• Design-system experience\n• Comfortable with Next.js App Router\n\nResponsibilities:\n• Ship polished UI\n• Partner with design",
    },
    {
      title: "Full Stack Engineer",
      company: "Cascade Analytics",
      location: "Remote · India",
      source: "linkedin" as const,
      url: "https://example.com/jobs/cascade-fullstack",
      salary: "₹28–38 LPA",
      description:
        "Ship Next.js + API services. Experience with Postgres and auth flows preferred.\n\nRequirements:\n• 3+ years full-stack\n• Postgres, TypeScript\n\nNice to have: Better Auth, Drizzle, or similar.",
    },
    {
      title: "Product Engineer",
      company: "Aether Careers",
      location: "Mumbai · Onsite",
      source: "careers" as const,
      url: "https://example.com/jobs/aether-product",
      salary: null,
      description:
        "0→1 features across discovery, applications, and referrals. Strong taste for UX density and micro-interactions.\n\nResponsibilities:\n• Own features end-to-end\n• Talk to users",
    },
    {
      title: "Platform Engineer",
      company: "Herald Systems",
      location: "Hyderabad · Hybrid",
      source: "indeed" as const,
      url: "https://example.com/jobs/herald-platform",
      salary: "₹32–42 LPA",
      description:
        "Own CI/CD, observability, and internal developer tooling. Kubernetes and Terraform experience preferred.\n\nRequirements:\n• 4+ years platform / DevOps\n• Kubernetes, Terraform",
    },
    {
      title: "Mobile Engineer (React Native)",
      company: "Lotus Health",
      location: "Pune · Hybrid",
      source: "manual" as const,
      url: null,
      salary: "₹24–32 LPA",
      description:
        "Ship patient-facing React Native apps. Collaboration with design and clinical product teams.\n\nRequirements:\n• React Native, TypeScript\n• 2+ years mobile",
    },
    {
      title: "Backend Engineer",
      company: "Orbit Freight",
      location: "Gurugram · Onsite",
      source: "other" as const,
      url: "https://example.com/jobs/orbit-backend",
      salary: "₹30–40 LPA",
      description:
        "APIs for logistics ops. Node/Go, Postgres, event-driven services. On-call rotation shared.\n\nRequirements:\n• Node or Go\n• Postgres\n• 3+ years backend",
    },
  ];

  const existing = await listJobsForUser(userId, { includeIgnored: true });
  const titles = new Set(existing.map((j) => j.title.toLowerCase()));
  if (existing.length === 0) {
    for (const sample of samples) await createJob(userId, sample);
    return listJobsForUser(userId);
  }

  if (existing.length < 6) {
    for (const sample of samples) {
      if (titles.has(sample.title.toLowerCase())) continue;
      await createJob(userId, sample);
      titles.add(sample.title.toLowerCase());
      if ((await countJobs(userId)) >= 6) break;
    }
  }
  return listJobsForUser(userId);
}
