import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { isJobSource, type JobSource } from "@/lib/job-constants";
import { upsertFeedJob } from "@/lib/jobs";

export type FeedJobInput = {
  title: string;
  company: string;
  location: string;
  source?: string;
  url?: string | null;
  description?: string;
  salary?: string | null;
  externalId: string;
};

export type IngestResult = {
  sources: Array<{
    source: string;
    fetched: number;
    upserted: number;
    created: number;
    updated: number;
  }>;
  totalUpserted: number;
};

function asSource(value: string | undefined, fallback: JobSource): JobSource {
  if (value && isJobSource(value)) return value;
  return fallback;
}

async function recordRun(
  source: string,
  fetched: number,
  upserted: number,
  status: string,
  message?: string,
) {
  await ensureAppSchema();
  const id = randomUUID();
  const now = new Date().toISOString();
  await getSql()`
    INSERT INTO jobs_ingest_runs (id, source, fetched_count, upserted_count, status, message, created_at)
    VALUES (${id}, ${source}, ${fetched}, ${upserted}, ${status}, ${message ?? null}, ${now})
  `;
}

async function upsertMany(
  feedSource: string,
  defaultSource: JobSource,
  items: FeedJobInput[],
): Promise<{ upserted: number; created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const item of items) {
    const result = await upsertFeedJob({
      title: item.title,
      company: item.company,
      location: item.location || "Remote",
      source: asSource(item.source, defaultSource),
      url: item.url ?? null,
      description: item.description ?? "",
      salary: item.salary ?? null,
      externalId: item.externalId,
      feedSource,
    });
    if (result.created) created += 1;
    else updated += 1;
  }
  return { upserted: created + updated, created, updated };
}

function sampleFeedJobs(
  batchKey: string,
): Array<{ feed: string; source: JobSource; items: FeedJobInput[] }> {
  const hour = new Date().toISOString().slice(0, 13);
  const tag = `${batchKey}-${hour}`;
  return [
    {
      feed: "sample-linkedin",
      source: "linkedin",
      items: [
        {
          externalId: `${tag}-li-1`,
          title: "Software Engineer, Frontend",
          company: "Brightlane",
          location: "Bengaluru · Hybrid",
          salary: "₹25–35 LPA",
          url: "https://example.com/feeds/brightlane-fe",
          description:
            "Build product surfaces in React and TypeScript.\n\nRequirements:\n• 2+ years React\n• TypeScript, CSS\n• Collaborative product mindset\n\nResponsibilities:\n• Ship UI features\n• Improve design-system usage",
        },
        {
          externalId: `${tag}-li-2`,
          title: "Backend Engineer",
          company: "Nimbus Pay",
          location: "Remote · India",
          salary: "₹30–42 LPA",
          url: "https://example.com/feeds/nimbus-be",
          description:
            "Own payment APIs on Node and Postgres.\n\nRequirements:\n• 3+ years backend\n• Postgres, Redis\n• Strong testing habits\n\nResponsibilities:\n• Design APIs\n• On-call rotation",
        },
      ],
    },
    {
      feed: "sample-indeed",
      source: "indeed",
      items: [
        {
          externalId: `${tag}-in-1`,
          title: "Full Stack Developer",
          company: "Cedar Health",
          location: "Pune · Onsite",
          salary: "₹18–28 LPA",
          url: "https://example.com/feeds/cedar-fs",
          description:
            "Next.js + NestJS for clinic ops tooling.\n\nRequirements:\n• JavaScript/TypeScript\n• REST APIs\n• 1–3 years experience\n\nResponsibilities:\n• Feature delivery\n• Bug fixes",
        },
      ],
    },
    {
      feed: "sample-careers",
      source: "careers",
      items: [
        {
          externalId: `${tag}-cr-1`,
          title: "Product Engineer",
          company: "Harbor AI",
          location: "Gurugram · Hybrid",
          salary: "₹40–55 LPA",
          url: "https://example.com/feeds/harbor-pe",
          description:
            "0→1 product engineering for AI-assisted hiring.\n\nRequirements:\n• 4+ years full-stack\n• Taste for UX\n• Comfortable with ambiguity\n\nResponsibilities:\n• Own product slices\n• Talk to customers",
        },
      ],
    },
  ];
}

async function fetchJsonFeed(url: string): Promise<FeedJobInput[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`JOBS_FEED_URL returned ${res.status}`);
  const data = (await res.json()) as unknown;
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { jobs?: unknown }).jobs)
      ? (data as { jobs: unknown[] }).jobs
      : null;
  if (!list) throw new Error("JOBS_FEED_URL must return an array or { jobs: [] }.");

  const out: FeedJobInput[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = String(row.title ?? row.role ?? "").trim();
    const company = String(row.company ?? row.company_name ?? "").trim();
    const externalId = String(row.externalId ?? row.external_id ?? row.id ?? "").trim();
    if (!title || !company || !externalId) continue;
    out.push({
      title,
      company,
      location: String(row.location ?? "Remote").trim() || "Remote",
      source: typeof row.source === "string" ? row.source : undefined,
      url: typeof row.url === "string" ? row.url : null,
      description: typeof row.description === "string" ? row.description : "",
      salary: typeof row.salary === "string" ? row.salary : null,
      externalId,
    });
  }
  return out;
}

/**
 * Hourly jobs ingest.
 * - If JOBS_FEED_URL is set, fetch that JSON feed into the shared jobs table.
 * - When JOBS_INGEST_SAMPLE=1/true or no feed URL, upsert sample multi-source stubs.
 */
export async function runJobsIngest(): Promise<IngestResult> {
  await ensureAppSchema();
  const sources: IngestResult["sources"] = [];
  let totalUpserted = 0;

  const feedUrl = process.env.JOBS_FEED_URL?.trim();
  if (feedUrl) {
    try {
      const items = await fetchJsonFeed(feedUrl);
      const stats = await upsertMany("jobs-feed-url", "other", items);
      sources.push({
        source: "jobs-feed-url",
        fetched: items.length,
        upserted: stats.upserted,
        created: stats.created,
        updated: stats.updated,
      });
      totalUpserted += stats.upserted;
      await recordRun("jobs-feed-url", items.length, stats.upserted, "ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Feed fetch failed";
      await recordRun("jobs-feed-url", 0, 0, "error", message);
      sources.push({
        source: "jobs-feed-url",
        fetched: 0,
        upserted: 0,
        created: 0,
        updated: 0,
      });
    }
  }

  const wantSample =
    process.env.JOBS_INGEST_SAMPLE === "1" ||
    process.env.JOBS_INGEST_SAMPLE === "true" ||
    !feedUrl;

  if (wantSample) {
    const batches = sampleFeedJobs("hourly");
    for (const batch of batches) {
      const stats = await upsertMany(batch.feed, batch.source, batch.items);
      sources.push({
        source: batch.feed,
        fetched: batch.items.length,
        upserted: stats.upserted,
        created: stats.created,
        updated: stats.updated,
      });
      totalUpserted += stats.upserted;
      await recordRun(batch.feed, batch.items.length, stats.upserted, "ok");
    }
  }

  return { sources, totalUpserted };
}
