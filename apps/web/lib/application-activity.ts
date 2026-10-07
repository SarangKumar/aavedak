import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";

export const ACTIVITY_RANGE_MONTHS = [1, 3, 6, 12] as const;
export type ActivityRangeMonths = (typeof ACTIVITY_RANGE_MONTHS)[number];

export type ActivityDay = {
  date: string;
  count: number;
};

export function parseActivityRange(raw: unknown): ActivityRangeMonths {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if ((ACTIVITY_RANGE_MONTHS as readonly number[]).includes(n)) {
    return n as ActivityRangeMonths;
  }
  return 3;
}

function startDateForMonths(months: ActivityRangeMonths): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Live applications/day for a user.
 * Buckets by applied_at (else created_at). Excludes archived so Delete (archive) reduces the day.
 */
export async function getApplicationsPerDay(
  userId: string,
  months: ActivityRangeMonths,
): Promise<ActivityDay[]> {
  await ensureAppSchema();
  const start = startDateForMonths(months);
  const end = todayUtc();

  const rows = (await getSql()`
    SELECT day, COUNT(*)::int AS count
    FROM (
      SELECT COALESCE(
        NULLIF(substring(applied_at, 1, 10), ''),
        substring(created_at, 1, 10)
      ) AS day
      FROM applications
      WHERE user_id = ${userId}
        AND status != 'archived'
        AND COALESCE(applied_at, created_at) >= ${start}
    ) t
    WHERE day IS NOT NULL AND day >= ${start} AND day <= ${end}
    GROUP BY day
    ORDER BY day ASC
  `) as Array<{ day: string; count: number }>;

  const byDay = new Map(rows.map((r) => [r.day, Number(r.count) || 0]));
  return enumerateDays(start, end).map((date) => ({
    date,
    count: byDay.get(date) ?? 0,
  }));
}
