/**
 * Admin-facing description of the repetitive discovery crons (as scheduled in `vercel.json`,
 * all UTC) plus helpers to show them in India time and count down to the next run.
 *
 * Keep the `scheduleUtcMinutes` here in sync with `vercel.json` crons.
 */

const IST_OFFSET_MIN = 330;

export type RunKindMeta = {
  label: string;
  /** Chart line + accent colour. */
  color: string;
  /** Minutes-past-midnight UTC when this kind's cron(s) fire. Empty = manual only. */
  scheduleUtcMinutes: number[];
};

export const RUN_KIND_META: Record<string, RunKindMeta> = {
  jobs_scan: {
    label: "Job scan",
    color: "var(--primary)",
    // Spread evenly every 4h: 00:15 / 04:15 / 08:15 / 12:15 / 16:15 / 20:15 UTC.
    scheduleUtcMinutes: [0, 4, 8, 12, 16, 20].map((h) => h * 60 + 15),
  },
  people_discovery: {
    label: "People discovery",
    color: "oklch(0.58 0.14 210)",
    // Six daily Vercel crons at 00:17, 04:17 … 20:17 UTC (00:17, 04:17 … UTC) + the daily Vercel fallback 02:15 UTC.
    scheduleUtcMinutes: [...[0, 4, 8, 12, 16, 20].map((h) => h * 60 + 17), 2 * 60 + 15],
  },
  people_import: {
    label: "People import",
    color: "oklch(0.55 0.18 290)",
    scheduleUtcMinutes: [], // manual only
  },
};

export const RUN_KINDS = Object.keys(RUN_KIND_META);

function istClock(utcMinutes: number): string {
  const m = (((utcMinutes + IST_OFFSET_MIN) % 1440) + 1440) % 1440;
  let hour = Math.floor(m / 60);
  const minute = String(m % 60).padStart(2, "0");
  const ampm = hour >= 12 ? "pm" : "am";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

/** The India-time clock labels at which this kind runs, sorted. */
export function istRunTimes(kind: string): string[] {
  const mins = RUN_KIND_META[kind]?.scheduleUtcMinutes ?? [];
  return [...mins]
    .map((m) => ({ ist: (((m + IST_OFFSET_MIN) % 1440) + 1440) % 1440, label: istClock(m) }))
    .sort((a, b) => a.ist - b.ist)
    .map((e) => e.label);
}

/** Milliseconds until this kind's next scheduled run, or null if it has no cron. */
export function msToNextRun(kind: string, now: Date = new Date()): number | null {
  const mins = RUN_KIND_META[kind]?.scheduleUtcMinutes ?? [];
  if (mins.length === 0) return null;
  const nowUtcMin = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  let best = Infinity;
  for (const m of mins) {
    let delta = m - nowUtcMin;
    if (delta <= 0) delta += 1440; // next occurrence tomorrow
    best = Math.min(best, delta);
  }
  return Math.round(best * 60_000);
}

/** For a group of kinds (e.g. the "all" filter), the soonest next run across them. */
export function msToNextRunAcross(kinds: string[], now: Date = new Date()): number | null {
  const candidates = kinds.map((k) => msToNextRun(k, now)).filter((v): v is number => v != null);
  return candidates.length ? Math.min(...candidates) : null;
}

/** "2h 13m" / "under a minute" from a millisecond duration. */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return "under a minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
