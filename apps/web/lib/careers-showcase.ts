import "server-only";

import { unstable_cache } from "next/cache";

import { getSql } from "@/lib/app-db";
import { PLATFORM_STRATEGIES, strategyLabel, type CareersStrategy } from "@/lib/careers-pages";

export type CareersShowcase = {
  /** Well-known companies whose own careers page we last read jobs from. */
  companies: Array<{ name: string; url: string }>;
  /** Hiring platforms behind those pages, most pages first. */
  platforms: Array<{ label: string; pages: number }>;
  /** Pages read straight from their own markup (schema.org JobPosting / page data). */
  ownMarkupPages: number;
  readablePages: number;
  trackedPages: number;
};

const COMPANY_LIMIT = 36;

/**
 * Homepage "where the jobs come from": straight from the `career_pages` registry (owned by
 * the FastAPI discovery schema). Only pages whose last crawl actually returned job data are
 * named, so the list never claims a source we don't read. Better-known names first.
 */
async function loadShowcase(): Promise<CareersShowcase | null> {
  const sql = getSql();
  const [exists] = (await sql`SELECT to_regclass('career_pages') IS NOT NULL AS ok`) as Array<{
    ok: boolean;
  }>;
  if (!exists?.ok) return null;
  const [companies, strategies, totals] = (await Promise.all([
    sql`
      SELECT company_name AS name, careers_url AS url
      FROM career_pages
      WHERE enabled = 1 AND last_status = 'ok' AND jobs_found > 0
      ORDER BY tier, jobs_found DESC, company_name
      LIMIT ${COMPANY_LIMIT}
    `,
    sql`
      SELECT strategy, COUNT(*)::int AS pages
      FROM career_pages
      WHERE enabled = 1 AND last_status = 'ok' AND strategy IS NOT NULL
      GROUP BY strategy
      ORDER BY pages DESC
    `,
    sql`
      SELECT COUNT(*)::int AS tracked,
             COUNT(*) FILTER (WHERE last_status = 'ok')::int AS readable
      FROM career_pages WHERE enabled = 1
    `,
  ])) as [
    Array<{ name: string; url: string }>,
    Array<{ strategy: string; pages: number }>,
    Array<{ tracked: number; readable: number }>,
  ];
  const platforms = strategies
    .filter((s) => PLATFORM_STRATEGIES.includes(s.strategy as CareersStrategy))
    .map((s) => ({ label: strategyLabel(s.strategy), pages: Number(s.pages) }));
  const ownMarkupPages = strategies
    .filter((s) => !PLATFORM_STRATEGIES.includes(s.strategy as CareersStrategy))
    .reduce((sum, s) => sum + Number(s.pages), 0);
  return {
    companies,
    platforms,
    ownMarkupPages,
    readablePages: Number(totals[0]?.readable ?? 0),
    trackedPages: Number(totals[0]?.tracked ?? 0),
  };
}

// Pages are re-crawled daily; an hourly refresh is plenty for the homepage.
const cachedShowcase = unstable_cache(loadShowcase, ["home-careers-showcase-v1"], {
  revalidate: 3600,
});

/** Null when the registry is empty or unavailable (the homepage section hides). */
export async function getCareersShowcase(): Promise<CareersShowcase | null> {
  try {
    return await cachedShowcase();
  } catch (error) {
    console.error("[careers-showcase] failed to load careers sources", error);
    return null;
  }
}
