import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { dbAll } from "@/lib/app-db";
import { isServerlessRuntime } from "@/lib/db-config";
import { isJobSource, type JobSource } from "@/lib/job-constants";
import { createJob, findJobByExternalId } from "@/lib/jobs";
import { scoreResumeAgainstJd } from "@/lib/match-score";
import { getActiveResume } from "@/lib/resumes";

export type IngestJob = {
  externalId?: string;
  title: string;
  company: string;
  location: string;
  source?: string;
  url?: string | null;
  salary?: string | null;
  description?: string;
};

export type IngestResult = {
  ingested: number;
  skipped: number;
  users: number;
  reason?: string;
};

function parseFeed(payload: unknown): IngestJob[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { jobs?: unknown }).jobs)
      ? (payload as { jobs: unknown[] }).jobs
      : null;
  if (!list) throw new Error("Jobs feed must be a JSON array or { jobs: [] }.");
  const jobs: IngestJob[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const company = typeof row.company === "string" ? row.company.trim() : "";
    const location = typeof row.location === "string" ? row.location.trim() : "";
    if (!title || !company || !location) continue;
    jobs.push({
      externalId: typeof row.externalId === "string" ? row.externalId : undefined,
      title,
      company,
      location,
      source: typeof row.source === "string" ? row.source : "other",
      url: typeof row.url === "string" ? row.url : null,
      salary: typeof row.salary === "string" ? row.salary : null,
      description: typeof row.description === "string" ? row.description : "",
    });
  }
  return jobs;
}

async function loadFeed(): Promise<{ jobs: IngestJob[]; reason?: string }> {
  const feedUrl = process.env.JOBS_FEED_URL?.trim();
  if (feedUrl) {
    const response = await fetch(feedUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`JOBS_FEED_URL returned ${response.status}.`);
    }
    return { jobs: parseFeed(await response.json()) };
  }
  const allowSample =
    process.env.JOBS_INGEST_SAMPLE === "1" ||
    (!isServerlessRuntime() && process.env.NODE_ENV !== "production");
  if (!allowSample) {
    return {
      jobs: [],
      reason:
        "No JOBS_FEED_URL. Set it to a JSON feed, or set JOBS_INGEST_SAMPLE=1 to load the bundled sample. Production does not ingest demo jobs by itself.",
    };
  }
  const file = path.join(process.cwd(), "lib", "jobs-feed.sample.json");
  const alt = path.join(process.cwd(), "apps", "web", "lib", "jobs-feed.sample.json");
  let raw = "";
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    raw = readFileSync(alt, "utf8");
  }
  return { jobs: parseFeed(JSON.parse(raw)) };
}

export async function ingestJobsForUser(userId: string): Promise<IngestResult> {
  const feed = await loadFeed();
  if (feed.jobs.length === 0) {
    return { ingested: 0, skipped: 0, users: 1, reason: feed.reason };
  }
  const resume = await getActiveResume(userId);
  const resumeText = resume?.textExcerpt ?? "";
  let ingested = 0;
  let skipped = 0;
  for (const job of feed.jobs) {
    if (job.externalId) {
      const existing = await findJobByExternalId(userId, job.externalId);
      if (existing) {
        skipped += 1;
        continue;
      }
    }
    const scores =
      resumeText && job.description ? scoreResumeAgainstJd(resumeText, job.description) : null;
    const source: JobSource =
      job.source && isJobSource(job.source) && job.source !== "demo" ? job.source : "other";
    await createJob(userId, {
      title: job.title,
      company: job.company,
      location: job.location,
      source,
      url: job.url,
      salary: job.salary,
      description: job.description,
      externalId: job.externalId,
      atsScore: scores?.atsScore ?? null,
      resumeMatchScore: scores?.resumeMatchScore ?? null,
    });
    ingested += 1;
  }
  return { ingested, skipped, users: 1, reason: feed.reason };
}

export async function ingestJobsForAllUsers(): Promise<IngestResult> {
  const users = await dbAll<{ user_id: string }>(`SELECT user_id FROM profiles`);
  if (users.length === 0) {
    return { ingested: 0, skipped: 0, users: 0, reason: "No profiles yet." };
  }
  let ingested = 0;
  let skipped = 0;
  let reason: string | undefined;
  for (const user of users) {
    const result = await ingestJobsForUser(user.user_id);
    ingested += result.ingested;
    skipped += result.skipped;
    reason = result.reason ?? reason;
  }
  return { ingested, skipped, users: users.length, reason };
}
