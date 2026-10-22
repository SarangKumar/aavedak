import "server-only";

import { unstable_cache } from "next/cache";

import { ensureAppSchema, getSql } from "@/lib/app-db";

import { GLOBE_CITY_MIN_COUNT, summarizeJobLocations, type JobMapSummary } from "./locations";

/**
 * Open shared (discovery) jobs by city — the same "open" rule Discover uses:
 * shared, not archived, not expired, not closed by its source. Counts only (no user data,
 * no job details), so it is the same for every visitor and safe on the public homepage.
 */
async function loadJobMapSummary(): Promise<JobMapSummary> {
  await ensureAppSchema();
  // Counts per location and company: enough for city dots and "companies hiring", without
  // sending any job details to the public homepage.
  const rows = (await getSql()`
    SELECT location, company, COUNT(*)::int AS count
    FROM jobs
    WHERE user_id IS NULL
      AND status != 'archived'
      AND expired_at IS NULL
      AND closed_at IS NULL
    GROUP BY location, company
  `) as Array<{ location: string | null; company: string | null; count: number }>;
  // Only cities with more than GLOBE_CITY_MIN_COUNT open roles are plotted; the totals
  // still count every open role.
  return summarizeJobLocations(
    rows.map((r) => ({ location: r.location ?? "", company: r.company, count: Number(r.count) })),
    { minCityCount: GLOBE_CITY_MIN_COUNT },
  );
}

// Discovery scans run every few hours, so an hourly refresh is plenty for the homepage.
const cachedJobMapSummary = unstable_cache(loadJobMapSummary, ["home-job-map-v6"], {
  revalidate: 3600,
});

/** Homepage globe data, or null when the database is unavailable (the section hides). */
export async function getJobMapSummary(): Promise<JobMapSummary | null> {
  try {
    return await cachedJobMapSummary();
  } catch (error) {
    console.error("[job-map] failed to load openings by location", error);
    return null;
  }
}
