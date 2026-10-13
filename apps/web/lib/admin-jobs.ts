import "server-only";

import { cleanJobDescription } from "@/lib/jd-clean";
import { ensureAppSchema, getSql } from "@/lib/app-db";
import { ensureCompany } from "@/lib/companies";
import { jobSourceLabel } from "@/lib/job-dto";
import { getJobById, mapJobRow, type JobRecord } from "@/lib/jobs";
import { isJobSource } from "@/lib/job-constants";
import { canonicalLocation } from "@/lib/locations";

export const ADMIN_JOBS_PAGE_SIZE = 5;

export type AdminJobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  source: JobRecord["source"];
  sourceLabel: string;
  /** "feed_source" provider for discovered jobs, else the job's source. */
  sourceKey: string;
  url: string | null;
  sourceUrl: string | null;
  salary: string | null;
  description: string;
  workMode: JobRecord["workMode"];
  employmentType: string | null;
  seniority: string | null;
  skills: string[];
  /** Posting date, else first seen / created (what the Jobs page filters on). */
  postedAt: string | null;
  postedAtFallback: string;
  shared: boolean;
  ownerEmail: string | null;
  applicationCount: number;
  closed: boolean;
};

export type AdminJobsQuery = {
  q?: string;
  source?: string;
  postedFrom?: string | null;
  postedTo?: string | null;
  page?: number;
};

function isoDay(value: string | null | undefined, endOfDay: boolean): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
}

/** Admin search over every job (shared and users' own), newest first, one page at a time. */
export async function searchAdminJobs(query: AdminJobsQuery): Promise<{
  rows: AdminJobRow[];
  total: number;
  page: number;
  pageSize: number;
  sources: string[];
}> {
  await ensureAppSchema();
  const sql = getSql();
  const q = (query.q ?? "").trim().slice(0, 200);
  const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const exactId = q || null;
  const source = query.source && query.source !== "all" ? query.source : null;
  const from = isoDay(query.postedFrom, false);
  const to = isoDay(query.postedTo, true);
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const offset = (page - 1) * ADMIN_JOBS_PAGE_SIZE;

  const where = sql`
    (${like}::text IS NULL
      OR j.title ILIKE ${like} OR j.company ILIKE ${like} OR j.location ILIKE ${like}
      OR COALESCE(j.source_url, '') ILIKE ${like} OR COALESCE(j.url, '') ILIKE ${like}
      OR j.id = ${exactId})
    AND (${source}::text IS NULL OR COALESCE(j.feed_source, j.source) = ${source})
    AND (${from}::text IS NULL OR COALESCE(j.posted_at, j.first_seen_at, j.created_at) >= ${from})
    AND (${to}::text IS NULL OR COALESCE(j.posted_at, j.first_seen_at, j.created_at) <= ${to})
  `;
  const [rows, counts, sources] = await Promise.all([
    sql`
      SELECT j.*, p.email AS owner_email,
        (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS application_count
      FROM jobs j
      LEFT JOIN profiles p ON p.user_id = j.user_id
      WHERE ${where}
      ORDER BY COALESCE(j.posted_at, j.first_seen_at, j.created_at) DESC, j.id
      LIMIT ${ADMIN_JOBS_PAGE_SIZE} OFFSET ${offset}
    `,
    sql`SELECT count(*)::int AS n FROM jobs j WHERE ${where}`,
    sql`SELECT DISTINCT COALESCE(feed_source, source) AS s FROM jobs ORDER BY 1`,
  ]);
  return {
    rows: (rows as Array<Record<string, unknown>>).map((row) => {
      const job = mapJobRow(row as Parameters<typeof mapJobRow>[0]);
      return {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        source: job.source,
        sourceLabel: jobSourceLabel(job),
        sourceKey: job.feedSource ?? job.source,
        url: job.url,
        sourceUrl: job.sourceUrl,
        salary: job.salary,
        description: job.description,
        workMode: job.workMode,
        employmentType: job.employmentType,
        seniority: job.seniority,
        skills: job.skills,
        postedAt: job.postedAt,
        postedAtFallback: job.postedAt ?? job.firstSeenAt ?? job.createdAt,
        shared: job.userId === null,
        ownerEmail: (row.owner_email as string | null) ?? null,
        applicationCount: Number(row.application_count ?? 0),
        closed: job.closedAt != null || job.expiredAt != null,
      };
    }),
    total: Number((counts as Array<{ n: number }>)[0]?.n ?? 0),
    page,
    pageSize: ADMIN_JOBS_PAGE_SIZE,
    sources: (sources as Array<{ s: string | null }>).map((r) => r.s ?? "").filter(Boolean),
  };
}

export type AdminJobPatch = Partial<{
  title: string;
  company: string;
  location: string;
  source: string;
  url: string | null;
  sourceUrl: string | null;
  salary: string | null;
  description: string;
  workMode: string | null;
  employmentType: string | null;
  seniority: string | null;
  postedAt: string | null;
  skills: string[];
}>;

function text(value: unknown, label: string, max = 300): string {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) throw new Error(`${label} is required.`);
  if (t.length > max) throw new Error(`${label} is too long.`);
  return t;
}

function optionalText(value: unknown, max = 2000): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t ? t.slice(0, max) : null;
}

/**
 * Edit any job. Only the fields present in `patch` change. Location must be a canonical
 * value (lib/locations); company goes through the companies registry like Add job.
 */
export async function updateAdminJob(id: string, patch: AdminJobPatch): Promise<JobRecord> {
  await ensureAppSchema();
  const existing = await getJobById(id);
  if (!existing) throw new Error("Job not found.");
  const sql = getSql();

  const title = patch.title !== undefined ? text(patch.title, "Title") : existing.title;
  let company = existing.company;
  let companyId = existing.companyId;
  if (patch.company !== undefined) {
    company = text(patch.company, "Company", 200);
    if (company !== existing.company) companyId = (await ensureCompany(company)).id;
  }
  let location = existing.location;
  if (patch.location !== undefined) {
    const canonical = canonicalLocation(patch.location);
    if (!canonical) throw new Error("Pick a location from the list (a city or Remote).");
    location = canonical;
  }
  const source =
    patch.source !== undefined
      ? isJobSource(patch.source)
        ? patch.source
        : (() => {
            throw new Error("Unknown source.");
          })()
      : existing.source;
  const workMode =
    patch.workMode !== undefined
      ? patch.workMode && ["remote", "hybrid", "onsite"].includes(patch.workMode)
        ? patch.workMode
        : null
      : existing.workMode;
  let postedAt = existing.postedAt;
  if (patch.postedAt !== undefined) {
    const raw = optionalText(patch.postedAt, 40);
    if (raw && Number.isNaN(Date.parse(raw))) throw new Error("Posted date is invalid.");
    postedAt = raw ? new Date(raw).toISOString() : null;
  }
  const skills =
    patch.skills !== undefined
      ? JSON.stringify(
          [...new Set(patch.skills.map((s) => String(s).trim()).filter(Boolean))].slice(0, 40),
        )
      : JSON.stringify(existing.skills);

  const cleaned =
    patch.description !== undefined ? cleanJobDescription(String(patch.description)) : null;
  await sql`
    UPDATE jobs SET
      title = ${title},
      company = ${company},
      company_id = ${companyId},
      location = ${location},
      location_raw = CASE WHEN ${location} <> location THEN COALESCE(location_raw, location)
                          ELSE location_raw END,
      source = ${source},
      url = ${patch.url !== undefined ? optionalText(patch.url) : existing.url},
      source_url = ${patch.sourceUrl !== undefined ? optionalText(patch.sourceUrl) : existing.sourceUrl},
      salary = ${patch.salary !== undefined ? optionalText(patch.salary, 200) : existing.salary},
      description = ${cleaned ? cleaned.description : existing.description},
      description_raw = CASE WHEN ${cleaned !== null}::boolean
                             THEN ${cleaned?.descriptionRaw ?? null}::text ELSE description_raw END,
      work_mode = ${workMode},
      employment_type = ${patch.employmentType !== undefined ? optionalText(patch.employmentType, 80) : existing.employmentType},
      seniority = ${patch.seniority !== undefined ? optionalText(patch.seniority, 80) : existing.seniority},
      posted_at = ${postedAt},
      posted_at_estimated = CASE WHEN ${postedAt}::text IS NULL THEN posted_at_estimated ELSE 0 END,
      skills_json = ${skills},
      updated_at = ${new Date().toISOString()}
    WHERE id = ${id}
  `;
  const updated = await getJobById(id);
  if (!updated) throw new Error("Job not found.");
  return updated;
}

export type JobDeleteImpact = {
  applications: number;
  users: number;
  coverLetters: number;
  analyses: number;
  recommendedTo: number;
};

/** What deleting a job touches, shown in the confirm dialog. */
export async function jobDeleteImpact(id: string): Promise<JobDeleteImpact> {
  await ensureAppSchema();
  const sql = getSql();
  const [apps, letters, analyses, states] = await Promise.all([
    sql`SELECT count(*)::int AS n, count(DISTINCT user_id)::int AS u FROM applications WHERE job_id = ${id}`,
    sql`SELECT count(*)::int AS n FROM cover_letters WHERE job_id = ${id}`,
    sql`SELECT count(*)::int AS n FROM job_analyses WHERE job_id = ${id}`,
    sql`SELECT count(*)::int AS n FROM user_job_state WHERE job_id = ${id} AND recommended_at IS NOT NULL`,
  ]);
  const first = (rows: unknown) => (rows as Array<{ n: number; u?: number }>)[0];
  return {
    applications: first(apps)?.n ?? 0,
    users: first(apps)?.u ?? 0,
    coverLetters: first(letters)?.n ?? 0,
    analyses: first(analyses)?.n ?? 0,
    recommendedTo: first(states)?.n ?? 0,
  };
}

/**
 * Delete a job for everyone. Applications keep their own company, role, location and link
 * (and their status history), so the tracker is unchanged; they, cover letters and JD
 * analyses are only unlinked (job_id = NULL). Per-user recommendation state, scores and
 * people relevance for the job are removed. Discovery's source references (`job_sources`)
 * are kept on purpose: the same posting from the same source is then treated as already
 * known and is not re-added by the next scan.
 */
export async function deleteAdminJob(id: string): Promise<JobDeleteImpact> {
  await ensureAppSchema();
  const existing = await getJobById(id);
  if (!existing) throw new Error("Job not found.");
  const impact = await jobDeleteImpact(id);
  const sql = getSql();
  await sql.transaction([
    sql`UPDATE applications SET job_id = NULL WHERE job_id = ${id}`,
    sql`UPDATE cover_letters SET job_id = NULL WHERE job_id = ${id}`,
    sql`UPDATE job_analyses SET job_id = NULL WHERE job_id = ${id}`,
    sql`DELETE FROM user_job_state WHERE job_id = ${id}`,
    sql`DELETE FROM job_scores WHERE job_id = ${id}`,
    sql`DELETE FROM job_person_relevance WHERE job_id = ${id}`,
    sql`DELETE FROM jobs WHERE id = ${id}`,
  ]);
  return impact;
}
