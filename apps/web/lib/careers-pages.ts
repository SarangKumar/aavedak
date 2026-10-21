/**
 * Careers-page sources shared by the admin panel and the homepage: the labels for the way
 * each page's jobs are read (the `career_pages.strategy` values written by the FastAPI
 * crawler, apps/api/app/discovery/jobs/careers_crawl.py — keep in sync).
 */
export type CareersStrategy =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "workday"
  | "jsonld"
  | "embedded_json"
  | "jsonld_links"
  | "jsonld_sitemap";

export const STRATEGY_LABELS: Record<CareersStrategy, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  workday: "Workday",
  jsonld: "schema.org JobPosting",
  embedded_json: "Page data",
  jsonld_links: "Job pages (JobPosting)",
  jsonld_sitemap: "Sitemap (JobPosting)",
};

/** Hiring platforms (as opposed to reading the company's own page markup). */
export const PLATFORM_STRATEGIES: readonly CareersStrategy[] = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "workday",
];

export function strategyLabel(strategy: string | null | undefined): string {
  if (!strategy) return "—";
  return STRATEGY_LABELS[strategy as CareersStrategy] ?? strategy;
}

export type CareersPageStatus = "ok" | "no_job_data" | "blocked" | "error";

export const STATUS_LABELS: Record<CareersPageStatus, string> = {
  ok: "Jobs read",
  no_job_data: "No job data",
  blocked: "Blocked",
  error: "Error",
};
