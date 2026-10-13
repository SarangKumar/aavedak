/**
 * Jobs page "Posted" filter. Jobs are kept by posting date, falling back to when Aavedak
 * first saw the job (or created it) when the source gave no date. Nothing older than a
 * month is ever listed on the Jobs page; "Last month" is the widest window.
 */
export const POSTED_WINDOWS = [
  { value: "24h", label: "Last 24 hours", days: 1 },
  { value: "3d", label: "Last 3 days", days: 3 },
  { value: "1w", label: "Last week", days: 7 },
  { value: "2w", label: "Last 2 weeks", days: 14 },
  { value: "1m", label: "Last month", days: 30 },
] as const;

export type PostedWindow = (typeof POSTED_WINDOWS)[number]["value"];

export const DEFAULT_POSTED_WINDOW: PostedWindow = "24h";
export const MAX_POSTED_DAYS = 30;

export function parsePostedWindow(value: string | null | undefined): PostedWindow {
  return POSTED_WINDOWS.some((w) => w.value === value)
    ? (value as PostedWindow)
    : DEFAULT_POSTED_WINDOW;
}

export function postedWindowDays(window: PostedWindow): number {
  return Math.min(POSTED_WINDOWS.find((w) => w.value === window)?.days ?? 1, MAX_POSTED_DAYS);
}

/** ISO cutoff: jobs posted (or first seen) at or after this instant are listed. */
export function postedCutoffIso(window: PostedWindow, now = new Date()): string {
  return new Date(now.getTime() - postedWindowDays(window) * 86_400_000).toISOString();
}
