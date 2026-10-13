import type { NeonQueryFunction } from "@neondatabase/serverless";

import { canonicalLocation, canonicalLocationList } from "./index";

/**
 * Same as discovery's `display_location`: each "·"-separated part becomes its canonical
 * "City, Country" when it maps confidently; parts that don't map are kept as they were.
 */
export function canonicalDisplayLocation(location: string): string {
  const parts = location
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const value = canonicalLocation(part) ?? part;
    if (!out.some((o) => o.toLowerCase() === value.toLowerCase())) out.push(value);
  }
  return out.join(" · ");
}

function slugKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Mirrors `app/discovery/jobs/text.py` dedupe_key (company + title + first location token). */
export function dedupeKey(company: string, title: string, location: string): string {
  const first = (location || "").split(/[,;/|·()]/)[0] ?? "";
  return [slugKey(company), slugKey(title), slugKey(first)].join("|");
}

const MIGRATION_ID = "canonical_locations_v1";

/**
 * One-time: rewrite stored job locations and profile preferred locations to canonical
 * values where they map confidently. The previous job text is kept in `location_raw`;
 * shared jobs get their dedupe key recomputed so ingest keeps matching them.
 */
export async function normalizeStoredLocations(
  db: NeonQueryFunction<false, false>,
): Promise<{ jobs: number; profiles: number } | null> {
  const done = (await db`SELECT 1 FROM app_migrations WHERE id = ${MIGRATION_ID}`) as unknown[];
  if (done.length) return null;

  const jobs = (await db`
    SELECT id, user_id, title, company, location FROM jobs
  `) as Array<{
    id: string;
    user_id: string | null;
    title: string;
    company: string;
    location: string;
  }>;
  const ids: string[] = [];
  const locations: string[] = [];
  const raws: string[] = [];
  const keys: Array<string | null> = [];
  for (const job of jobs) {
    // The user's own jobs hold one canonical value ("Pune, India · Hybrid" → "Pune, India");
    // shared jobs keep several places, each mapped when confident.
    const next =
      (job.user_id !== null ? canonicalLocation(job.location ?? "") : null) ??
      canonicalDisplayLocation(job.location ?? "");
    if (!next || next === job.location) continue;
    ids.push(job.id);
    locations.push(next);
    raws.push(job.location);
    keys.push(job.user_id === null ? dedupeKey(job.company, job.title, next) : null);
  }
  if (ids.length) {
    await db`
      UPDATE jobs AS j SET
        location = u.location,
        location_raw = COALESCE(j.location_raw, u.raw),
        dedupe_key = COALESCE(u.key, j.dedupe_key)
      FROM unnest(${ids}::text[], ${locations}::text[], ${raws}::text[], ${keys}::text[])
        AS u(id, location, raw, key)
      WHERE j.id = u.id
    `;
  }

  const profiles = (await db`
    SELECT user_id, preferred_locations_json FROM profiles
    WHERE preferred_locations_json IS NOT NULL AND preferred_locations_json <> '[]'
  `) as Array<{ user_id: string; preferred_locations_json: string }>;
  let profileCount = 0;
  for (const row of profiles) {
    let list: unknown;
    try {
      list = JSON.parse(row.preferred_locations_json);
    } catch {
      continue;
    }
    if (!Array.isArray(list)) continue;
    const before = list.map(String);
    const after = canonicalLocationList(before);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    await db`UPDATE profiles SET preferred_locations_json = ${JSON.stringify(after)}
      WHERE user_id = ${row.user_id}`;
    profileCount += 1;
  }

  await db`INSERT INTO app_migrations (id, applied_at) VALUES (${MIGRATION_ID}, ${new Date().toISOString()})
    ON CONFLICT (id) DO NOTHING`;
  return { jobs: ids.length, profiles: profileCount };
}
