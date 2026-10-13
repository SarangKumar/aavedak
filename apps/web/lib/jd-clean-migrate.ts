import type { NeonQueryFunction } from "@neondatabase/serverless";

import { stripJdBoilerplate } from "./jd-clean";

const MIGRATION_ID = "jd_boilerplate_v1";

/**
 * One-time backfill: strip boilerplate from stored job descriptions. Only rows whose text
 * changes are touched, the original goes to `description_raw` (never overwritten if already
 * set), and `stripJdBoilerplate` returns the original when it would remove too much.
 */
export async function cleanStoredDescriptions(
  db: NeonQueryFunction<false, false>,
): Promise<{ jobs: number } | null> {
  const done = (await db`SELECT 1 FROM app_migrations WHERE id = ${MIGRATION_ID}`) as unknown[];
  if (done.length) return null;
  const rows = (await db`
    SELECT id, description FROM jobs WHERE description_raw IS NULL AND description <> ''
  `) as Array<{ id: string; description: string }>;
  const ids: string[] = [];
  const cleaned: string[] = [];
  for (const row of rows) {
    const next = stripJdBoilerplate(row.description);
    if (next === row.description) continue;
    ids.push(row.id);
    cleaned.push(next);
  }
  for (let i = 0; i < ids.length; i += 500) {
    await db`
      UPDATE jobs AS j SET
        description_raw = COALESCE(j.description_raw, j.description),
        description = u.description
      FROM unnest(${ids.slice(i, i + 500)}::text[], ${cleaned.slice(i, i + 500)}::text[])
        AS u(id, description)
      WHERE j.id = u.id AND j.description_raw IS NULL
    `;
  }
  await db`INSERT INTO app_migrations (id, applied_at) VALUES (${MIGRATION_ID}, ${new Date().toISOString()})
    ON CONFLICT (id) DO NOTHING`;
  return { jobs: ids.length };
}
