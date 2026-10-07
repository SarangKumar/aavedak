import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { isJobSource, type JobSource } from "@/lib/job-constants";
import { upsertFeedJob } from "@/lib/jobs";

/** Hobby plan: one daily ingest; store 20–50 newest jobs per run. */
export const JOBS_INGEST_MIN = 20;
export const JOBS_INGEST_MAX = 50;
const JOBS_INGEST_DEFAULT = 40;

export type FeedJobInput = {
  title: string;
  company: string;
  location: string;
  source?: string;
  url?: string | null;
  description?: string;
  salary?: string | null;
  externalId: string;
  /** ISO timestamp when known; used to prefer newest. */
  postedAt?: string | null;
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
  limit: number;
};

function asSource(value: string | undefined, fallback: JobSource): JobSource {
  if (value && isJobSource(value)) return value;
  return fallback;
}

/** Clamp to [20, 50]; optional JOBS_INGEST_LIMIT env override. */
export function resolveIngestLimit(): number {
  const raw = process.env.JOBS_INGEST_LIMIT?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) {
      return Math.min(JOBS_INGEST_MAX, Math.max(JOBS_INGEST_MIN, n));
    }
  }
  return JOBS_INGEST_DEFAULT;
}

/**
 * Prefer newest: sort by postedAt desc when present, else keep feed order
 * (assumed newest-first), then take up to `limit` (max 50).
 */
export function clampNewestJobs(
  items: FeedJobInput[],
  limit = resolveIngestLimit(),
): FeedJobInput[] {
  const capped = Math.min(JOBS_INGEST_MAX, Math.max(1, limit));
  const dated = items.some((i) => i.postedAt && !Number.isNaN(Date.parse(i.postedAt)));
  const ordered = dated
    ? [...items].sort((a, b) => {
        const ta = a.postedAt ? Date.parse(a.postedAt) : 0;
        const tb = b.postedAt ? Date.parse(b.postedAt) : 0;
        return tb - ta;
      })
    : items;
  return ordered.slice(0, capped);
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

type SampleSeed = {
  title: string;
  company: string;
  location: string;
  salary: string;
  source: JobSource;
  blurb: string;
};

const SAMPLE_SEEDS: SampleSeed[] = [
  {
    title: "Software Engineer, Frontend",
    company: "Brightlane",
    location: "Bengaluru · Hybrid",
    salary: "₹25–35 LPA",
    source: "linkedin",
    blurb: "Build product surfaces in React and TypeScript.",
  },
  {
    title: "Backend Engineer",
    company: "Nimbus Pay",
    location: "Remote · India",
    salary: "₹30–42 LPA",
    source: "linkedin",
    blurb: "Own payment APIs on Node and Postgres.",
  },
  {
    title: "Full Stack Developer",
    company: "Cedar Health",
    location: "Pune · Onsite",
    salary: "₹18–28 LPA",
    source: "indeed",
    blurb: "Next.js + NestJS for clinic ops tooling.",
  },
  {
    title: "Product Engineer",
    company: "Harbor AI",
    location: "Gurugram · Hybrid",
    salary: "₹40–55 LPA",
    source: "careers",
    blurb: "0→1 product engineering for AI-assisted hiring.",
  },
  {
    title: "Platform Engineer",
    company: "Orbit Cloud",
    location: "Hyderabad · Hybrid",
    salary: "₹35–48 LPA",
    source: "linkedin",
    blurb: "Kubernetes, CI/CD, and developer platforms.",
  },
  {
    title: "Mobile Engineer (React Native)",
    company: "SwiftCart",
    location: "Mumbai · Hybrid",
    salary: "₹22–32 LPA",
    source: "indeed",
    blurb: "Ship consumer shopping experiences on RN.",
  },
  {
    title: "Data Engineer",
    company: "Lattice Analytics",
    location: "Remote · India",
    salary: "₹28–40 LPA",
    source: "linkedin",
    blurb: "Pipelines on Spark/dbt and warehouse modeling.",
  },
  {
    title: "DevOps Engineer",
    company: "Forge Infra",
    location: "Chennai · Onsite",
    salary: "₹20–30 LPA",
    source: "indeed",
    blurb: "Terraform, observability, and release automation.",
  },
  {
    title: "ML Engineer",
    company: "Pixelmind",
    location: "Bengaluru · Hybrid",
    salary: "₹45–60 LPA",
    source: "careers",
    blurb: "Train and serve ranking models in production.",
  },
  {
    title: "Security Engineer",
    company: "ShieldStack",
    location: "Remote · India",
    salary: "₹32–45 LPA",
    source: "linkedin",
    blurb: "AppSec reviews, threat modeling, and hardening.",
  },
  {
    title: "SRE",
    company: "Uptime Labs",
    location: "Pune · Hybrid",
    salary: "₹30–44 LPA",
    source: "careers",
    blurb: "SLOs, incident response, and capacity planning.",
  },
  {
    title: "QA Automation Engineer",
    company: "QualityForge",
    location: "Noida · Onsite",
    salary: "₹12–20 LPA",
    source: "indeed",
    blurb: "Playwright/Cypress suites and CI quality gates.",
  },
  {
    title: "iOS Engineer",
    company: "Northwind Apps",
    location: "Bengaluru · Hybrid",
    salary: "₹28–38 LPA",
    source: "linkedin",
    blurb: "SwiftUI product features for consumer apps.",
  },
  {
    title: "Android Engineer",
    company: "Riverbank",
    location: "Gurugram · Hybrid",
    salary: "₹26–36 LPA",
    source: "linkedin",
    blurb: "Kotlin multiplatform and Jetpack Compose.",
  },
  {
    title: "Staff Frontend Engineer",
    company: "Canvas HQ",
    location: "Remote · India",
    salary: "₹50–70 LPA",
    source: "careers",
    blurb: "Lead design-system and performance work.",
  },
  {
    title: "Solutions Engineer",
    company: "Relay CRM",
    location: "Mumbai · Hybrid",
    salary: "₹24–34 LPA",
    source: "indeed",
    blurb: "Customer PoCs, integrations, and demos.",
  },
  {
    title: "Growth Engineer",
    company: "Sparkloop",
    location: "Bengaluru · Hybrid",
    salary: "₹22–33 LPA",
    source: "linkedin",
    blurb: "Experimentation, funnel instrumentation, A/B tests.",
  },
  {
    title: "Embedded Software Engineer",
    company: "Volt Devices",
    location: "Pune · Onsite",
    salary: "₹18–28 LPA",
    source: "indeed",
    blurb: "Firmware on ARM and RTOS for IoT products.",
  },
  {
    title: "Blockchain Engineer",
    company: "LedgerPath",
    location: "Remote · India",
    salary: "₹35–50 LPA",
    source: "careers",
    blurb: "Smart contracts and indexer services.",
  },
  {
    title: "Technical Writer (Developer Docs)",
    company: "API Garden",
    location: "Remote · India",
    salary: "₹15–25 LPA",
    source: "linkedin",
    blurb: "API reference, tutorials, and DX content.",
  },
  {
    title: "Engineering Manager",
    company: "Summit Soft",
    location: "Hyderabad · Hybrid",
    salary: "₹55–75 LPA",
    source: "careers",
    blurb: "Lead a 6–8 person product engineering team.",
  },
  {
    title: "Cloud Architect",
    company: "BlueSky Systems",
    location: "Bengaluru · Hybrid",
    salary: "₹48–65 LPA",
    source: "linkedin",
    blurb: "Multi-cloud reference architectures and reviews.",
  },
  {
    title: "Support Engineer (L2)",
    company: "Helpdesk Pro",
    location: "Chennai · Hybrid",
    salary: "₹10–16 LPA",
    source: "indeed",
    blurb: "Troubleshoot SaaS incidents and write runbooks.",
  },
  {
    title: "Analytics Engineer",
    company: "Metric Tree",
    location: "Remote · India",
    salary: "₹20–30 LPA",
    source: "linkedin",
    blurb: "dbt models, metrics layer, and BI handoff.",
  },
  {
    title: "UI Engineer",
    company: "Palette Studio",
    location: "Mumbai · Hybrid",
    salary: "₹18–26 LPA",
    source: "indeed",
    blurb: "Accessible component libraries and motion.",
  },
  {
    title: "Rust Engineer",
    company: "EdgeRuntime",
    location: "Remote · India",
    salary: "₹40–58 LPA",
    source: "careers",
    blurb: "High-performance networking and WASM runtimes.",
  },
  {
    title: "Java Backend Engineer",
    company: "TradeLedger",
    location: "Pune · Onsite",
    salary: "₹22–34 LPA",
    source: "indeed",
    blurb: "Spring Boot services for trading workflows.",
  },
  {
    title: "Python Backend Engineer",
    company: "Insight Batch",
    location: "Bengaluru · Hybrid",
    salary: "₹24–36 LPA",
    source: "linkedin",
    blurb: "FastAPI services and async workers.",
  },
  {
    title: "Design Engineer",
    company: "Form & Function",
    location: "Remote · India",
    salary: "₹28–40 LPA",
    source: "careers",
    blurb: "Bridge Figma and production UI with strong craft.",
  },
  {
    title: "Intern — Software Engineering",
    company: "Launchpad Labs",
    location: "Bengaluru · Hybrid",
    salary: "Stipend",
    source: "linkedin",
    blurb: "Ship small features with mentorship on a product team.",
  },
  {
    title: "Site Reliability Intern",
    company: "Uptime Labs",
    location: "Pune · Hybrid",
    salary: "Stipend",
    source: "indeed",
    blurb: "Assist with monitoring dashboards and on-call tooling.",
  },
  {
    title: "Forward Deployed Engineer",
    company: "ClientForge",
    location: "Delhi NCR · Hybrid",
    salary: "₹30–45 LPA",
    source: "careers",
    blurb: "Embed with customers to customize platform rollouts.",
  },
  {
    title: "Database Administrator",
    company: "StableQuery",
    location: "Hyderabad · Onsite",
    salary: "₹18–28 LPA",
    source: "indeed",
    blurb: "Postgres/MySQL operations, backups, and tuning.",
  },
  {
    title: "AR/VR Engineer",
    company: "Horizon Spatial",
    location: "Bengaluru · Hybrid",
    salary: "₹32–48 LPA",
    source: "linkedin",
    blurb: "Unity/Unreal experiences for enterprise training.",
  },
  {
    title: "NLP Engineer",
    company: "Lingua Systems",
    location: "Remote · India",
    salary: "₹38–52 LPA",
    source: "careers",
    blurb: "LLM fine-tuning, evals, and retrieval pipelines.",
  },
  {
    title: "Payments Engineer",
    company: "Nimbus Pay",
    location: "Bengaluru · Hybrid",
    salary: "₹34–48 LPA",
    source: "linkedin",
    blurb: "Card rails, reconciliation, and ledger integrity.",
  },
  {
    title: "Customer Success Engineer",
    company: "Relay CRM",
    location: "Mumbai · Hybrid",
    salary: "₹14–22 LPA",
    source: "indeed",
    blurb: "Onboard accounts and unblock technical adopters.",
  },
  {
    title: "Release Engineer",
    company: "Orbit Cloud",
    location: "Remote · India",
    salary: "₹26–38 LPA",
    source: "linkedin",
    blurb: "Build pipelines, feature flags, and rollout tooling.",
  },
  {
    title: "Gameplay Engineer",
    company: "Pixel Play",
    location: "Pune · Onsite",
    salary: "₹20–32 LPA",
    source: "indeed",
    blurb: "Gameplay systems in Unity for mobile titles.",
  },
  {
    title: "Observability Engineer",
    company: "Forge Infra",
    location: "Gurugram · Hybrid",
    salary: "₹30–42 LPA",
    source: "careers",
    blurb: "OpenTelemetry, tracing, and alert quality.",
  },
];

function sampleFeedJobs(
  batchKey: string,
  limit: number,
): Array<{ feed: string; source: JobSource; items: FeedJobInput[] }> {
  const day = new Date().toISOString().slice(0, 10);
  const tag = `${batchKey}-${day}`;
  const target = Math.min(JOBS_INGEST_MAX, Math.max(1, limit));
  const seeds = SAMPLE_SEEDS.slice(0, target);
  const now = Date.now();

  const bySource = new Map<JobSource, FeedJobInput[]>();
  seeds.forEach((seed, index) => {
    const item: FeedJobInput = {
      externalId: `${tag}-${seed.source}-${index + 1}`,
      title: seed.title,
      company: seed.company,
      location: seed.location,
      salary: seed.salary,
      url: `https://example.com/feeds/${seed.company.toLowerCase().replace(/\s+/g, "-")}-${index + 1}`,
      description: `${seed.blurb}\n\nRequirements:\n• Relevant experience for ${seed.title}\n• Strong collaboration\n\nResponsibilities:\n• Deliver product work\n• Improve quality`,
      postedAt: new Date(now - index * 60_000).toISOString(),
    };
    const list = bySource.get(seed.source) ?? [];
    list.push(item);
    bySource.set(seed.source, list);
  });

  const feedFor = (source: JobSource) =>
    source === "linkedin"
      ? "sample-linkedin"
      : source === "indeed"
        ? "sample-indeed"
        : source === "careers"
          ? "sample-careers"
          : `sample-${source}`;

  return Array.from(bySource.entries()).map(([source, items]) => ({
    feed: feedFor(source),
    source,
    items,
  }));
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
    const postedRaw = row.postedAt ?? row.posted_at ?? row.published_at ?? row.created_at;
    const postedAt =
      typeof postedRaw === "string" && !Number.isNaN(Date.parse(postedRaw)) ? postedRaw : null;
    out.push({
      title,
      company,
      location: String(row.location ?? "Remote").trim() || "Remote",
      source: typeof row.source === "string" ? row.source : undefined,
      url: typeof row.url === "string" ? row.url : null,
      description: typeof row.description === "string" ? row.description : "",
      salary: typeof row.salary === "string" ? row.salary : null,
      externalId,
      postedAt,
    });
  }
  return out;
}

/**
 * Daily jobs ingest (Vercel Hobby: once per day).
 * - If JOBS_FEED_URL is set, fetch that JSON feed and upsert the 20–50 newest.
 * - When JOBS_INGEST_SAMPLE=1/true or no feed URL, upsert sample multi-source stubs (20–50).
 */
export async function runJobsIngest(): Promise<IngestResult> {
  await ensureAppSchema();
  const sources: IngestResult["sources"] = [];
  let totalUpserted = 0;
  const limit = resolveIngestLimit();

  const feedUrl = process.env.JOBS_FEED_URL?.trim();
  if (feedUrl) {
    try {
      const fetched = await fetchJsonFeed(feedUrl);
      const items = clampNewestJobs(fetched, limit);
      const stats = await upsertMany("jobs-feed-url", "other", items);
      sources.push({
        source: "jobs-feed-url",
        fetched: fetched.length,
        upserted: stats.upserted,
        created: stats.created,
        updated: stats.updated,
      });
      totalUpserted += stats.upserted;
      await recordRun(
        "jobs-feed-url",
        fetched.length,
        stats.upserted,
        "ok",
        `clamped_to=${items.length};limit=${limit}`,
      );
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
    process.env.JOBS_INGEST_SAMPLE === "1" || process.env.JOBS_INGEST_SAMPLE === "true" || !feedUrl;

  if (wantSample) {
    const remaining = Math.max(0, limit - totalUpserted);
    if (remaining > 0) {
      const take = totalUpserted === 0 ? limit : remaining;
      const batches = sampleFeedJobs("daily", take);
      let budget = take;
      for (const batch of batches) {
        if (budget <= 0) break;
        const items = clampNewestJobs(batch.items, budget);
        if (items.length === 0) continue;
        const stats = await upsertMany(batch.feed, batch.source, items);
        sources.push({
          source: batch.feed,
          fetched: batch.items.length,
          upserted: stats.upserted,
          created: stats.created,
          updated: stats.updated,
        });
        totalUpserted += stats.upserted;
        budget -= stats.upserted;
        await recordRun(batch.feed, batch.items.length, stats.upserted, "ok");
      }
    }
  }

  return { sources, totalUpserted, limit };
}
