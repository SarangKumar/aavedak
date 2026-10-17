/**
 * Shared between the admin Jobs panel (client) and the search query (server), so the
 * rows-per-page group can only ask for a page size the query accepts. `lib/admin-jobs.ts`
 * is server-only, which is why these live on their own.
 */

/** Rows per page offered in the admin Jobs table; the first is the default. */
export const ADMIN_JOBS_PAGE_SIZES = [5, 10, 25, 50] as const;

export const ADMIN_JOBS_PAGE_SIZE = ADMIN_JOBS_PAGE_SIZES[0];

/** Only the offered sizes are honoured, so the query can never be asked for an unbounded page. */
export function parseAdminJobsPageSize(value: unknown): number {
  const size = Number(value);
  return ADMIN_JOBS_PAGE_SIZES.find((n) => n === size) ?? ADMIN_JOBS_PAGE_SIZE;
}
