/**
 * Width of the Jobs list pane in px. Kept in a cookie (not localStorage) so the server can
 * render the saved width on the first paint, which avoids a layout shift after hydration.
 */
export const JOBS_LIST_WIDTH_COOKIE = "aavedak-jobs-list-width";
export const JOBS_LIST_WIDTH_DEFAULT = 360;
export const JOBS_LIST_WIDTH_MIN = 260;
export const JOBS_LIST_WIDTH_MAX = 560;

export function clampJobsListWidth(width: number): number {
  return Math.min(JOBS_LIST_WIDTH_MAX, Math.max(JOBS_LIST_WIDTH_MIN, Math.round(width)));
}

export function parseJobsListWidth(raw: string | undefined | null): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) ? clampJobsListWidth(n) : JOBS_LIST_WIDTH_DEFAULT;
}
