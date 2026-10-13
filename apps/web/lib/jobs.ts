import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { ensureCompany } from "@/lib/companies";
import { canonicalLocation } from "@/lib/locations";
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
  /** Application / recruiting email published in the posting text (unverified; shared jobs only). */
  applyEmail: string | null;
  /** Link the user pasted in Add job (LinkedIn, careers page, …); `url` is where to apply. */
  sourceUrl: string | null;
  workMode: WorkMode | null;
  employmentType: string | null;
  seniority: string | null;
  skills: string[];
  createdAt: string;
  updatedAt: string;
};

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

function parseWorkMode(value: unknown): WorkMode | null {
  return typeof value === "string" && (WORK_MODES as readonly string[]).includes(value)
    ? (value as WorkMode)
    : null;
}

function parseSkills(value: unknown): string[] {
  const list = typeof value === "string" ? safeJsonArray(value) : value;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const s = typeof item === "string" ? item.trim().slice(0, 60) : "";
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= 40) break;
  }
  return out;
}

function safeJsonArray(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

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
  apply_email?: string | null;
  source_url?: string | null;
  work_mode?: string | null;
  employment_type?: string | null;
  seniority?: string | null;
  skills_json?: string | null;
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
    applyEmail: row.apply_email ?? null,
    sourceUrl: row.source_url ?? null,
    workMode: parseWorkMode(row.work_mode),
    employmentType: row.employment_type ?? null,
    seniority: row.seniority ?? null,
    skills: parseSkills(row.skills_json ?? "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireCanonicalLocation(value: unknown): string {
  const canonical = canonicalLocation(typeof value === "string" ? value : "");
  if (!canonical) throw new Error("Pick a location from the list (a city or Remote).");
  return canonical;
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

/** Batch lookup by id in one query; missing ids are simply absent from the map. */
export async function getJobsByIds(ids: string[]): Promise<Map<string, JobRecord>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM jobs WHERE id = ANY(${unique})
  `) as Row[];
  return new Map(rows.map((row) => [row.id, mapJobRow(row)]));
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
export async function listDiscoverJobs(
  userId: string,
  opts?: { postedSince?: string | null },
): Promise<DiscoverJob[]> {
  await ensureAppSchema();
  const postedSince = opts?.postedSince ?? null;
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
        OR j.user_id = ${userId}
      )
      -- Posted filter (Jobs page): posting date, else first seen / created.
      AND (${postedSince}::text IS NULL
        OR COALESCE(j.posted_at, j.first_seen_at, j.created_at) >= ${postedSince})
    -- Best match first; the newest recommendation breaks ties (and orders un-scored jobs).
    ORDER BY s.score DESC NULLS LAST, COALESCE(s.recommended_at, j.created_at) DESC
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
export async function listAppliedJobs(
  userId: string,
  opts?: { postedSince?: string | null },
): Promise<AppliedJob[]> {
  await ensureAppSchema();
  const postedSince = opts?.postedSince ?? null;
  const rows = (await getSql()`
    SELECT DISTINCT ON (j.id) j.*, a.id AS app_id, a.status AS app_status, a.updated_at AS app_updated_at
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.user_id = ${userId}
      AND a.status != 'archived'
      AND (j.user_id IS NULL OR j.user_id = ${userId})
      AND j.expired_at IS NULL
      AND (${postedSince}::text IS NULL
        OR COALESCE(j.posted_at, j.first_seen_at, j.created_at) >= ${postedSince})
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
    sourceUrl?: string | null;
    workMode?: string | null;
    employmentType?: string | null;
    seniority?: string | null;
    postedAt?: string | null;
    skills?: unknown;
  },
): Promise<JobRecord> {
  await ensureAppSchema();
  const title = requireText(input.title, "Title");
  const companyName = requireText(input.company, "Company");
  // The user's own jobs store a canonical location only (see lib/locations).
  const location =
    userId === null
      ? requireText(input.location, "Location")
      : requireCanonicalLocation(input.location);
  const source = parseSource(input.source);
  const url = optional(input.url);
  const description = typeof input.description === "string" ? input.description : "";
  const salary = optional(input.salary);
  const externalId = optional(input.externalId);
  const feedSource = optional(input.feedSource);
  const sourceUrl = optional(input.sourceUrl);
  const workMode = parseWorkMode(input.workMode);
  const employmentType = optional(input.employmentType)?.slice(0, 80) ?? null;
  const seniority = optional(input.seniority)?.slice(0, 80) ?? null;
  const postedRaw = optional(input.postedAt);
  const postedAt =
    postedRaw && !Number.isNaN(Date.parse(postedRaw)) ? new Date(postedRaw).toISOString() : null;
  const skillsJson = JSON.stringify(parseSkills(input.skills));

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
       status, external_id, feed_source, created_at, updated_at, first_seen_at,
       source_url, work_mode, employment_type, seniority, posted_at, skills_json)
    VALUES (
      ${id}, ${userId}, ${title}, ${companyName}, ${companyId}, ${location}, ${source}, ${url},
      ${description}, ${salary}, 'active', ${externalId}, ${feedSource}, ${now}, ${now}, ${now},
      ${sourceUrl}, ${workMode}, ${employmentType}, ${seniority}, ${postedAt}, ${skillsJson}
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
    patch.location !== undefined ? requireCanonicalLocation(patch.location) : existing.location;
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
