import { cookies } from "next/headers";

import { JobsHub, type JobsSort, type JobsTab } from "@/components/jobs-hub";
import { requireOnboarded } from "@/lib/app-access";
import { toJobDto } from "@/lib/job-dto";
import { listJobScores } from "@/lib/job-scoring";
import { listAppliedJobs, listDiscoverJobs } from "@/lib/jobs";
import { getPreferences } from "@/lib/preferences";
import { listResumes } from "@/lib/resumes";
import { JOBS_LIST_WIDTH_COOKIE, parseJobsListWidth } from "@/lib/jobs-list-width";

export type JobsSearchParams = Promise<{
  tab?: string | string[];
  job?: string | string[];
  sort?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Shared loader for /jobs (page) and /jobs/board (full-screen board). */
export async function JobsBoard({
  variant,
  searchParams,
}: {
  variant: "page" | "board";
  searchParams: JobsSearchParams;
}) {
  const { user, profile } = await requireOnboarded();
  const params = await searchParams;
  const listWidth = parseJobsListWidth((await cookies()).get(JOBS_LIST_WIDTH_COOKIE)?.value);
  // Scores are written by discovery (FastAPI) and on manual job create — never computed here.
  const [discover, applied, scores, prefs, resumes] = await Promise.all([
    listDiscoverJobs(user.id),
    listAppliedJobs(user.id),
    listJobScores(user.id),
    getPreferences(user.id),
    listResumes(user.id),
  ]);
  const byJob = new Map(scores.map((s) => [s.jobId, s]));
  // Unknown or missing values fall back to the defaults (Discover, newest first).
  const initialTab: JobsTab = first(params.tab) === "applied" ? "applied" : "discover";
  const initialSort: JobsSort = first(params.sort) === "oldest" ? "oldest" : "newest";
  const pool = initialTab === "applied" ? applied : discover;
  const requested = first(params.job);
  const initialJobId = requested && pool.some((j) => j.id === requested) ? requested : null;

  return (
    <JobsHub
      variant={variant}
      initialListWidth={listWidth}
      initialTab={initialTab}
      initialSort={initialSort}
      initialJobId={initialJobId}
      initialDiscover={discover.map((job) => toJobDto(job, byJob.get(job.id)))}
      initialApplied={applied.map((job) => toJobDto(job, byJob.get(job.id)))}
      discoveryEnabled={prefs.discoveryEnabled}
      resumes={resumes.map((r) => ({ id: r.id, displayName: r.displayName, status: r.status }))}
      profileSettingsHref={`/${profile.username}/settings`}
    />
  );
}
