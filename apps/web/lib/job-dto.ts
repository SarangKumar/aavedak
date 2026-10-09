import type { AppliedJob, DiscoverJob, JobRecord } from "@/lib/jobs";
import type { JobScoreRecord } from "@/lib/job-scoring";

/** Shape sent to the Jobs UI (client-safe; built on the server). */
export type JobDtoBase = {
  id: string;
  title: string;
  company: string;
  companyId: string | null;
  location: string;
  source: JobRecord["source"];
  url: string | null;
  description: string;
  salary: string | null;
  status: JobRecord["status"];
  /** True for shared, discovered jobs (vs the user's own manual/pasted ones). */
  discovered: boolean;
  /** Where the job came from, for display: "Greenhouse", "Lever", "LinkedIn", "Company site", … */
  sourceLabel: string;
  postedAt: string | null;
  postedAtEstimated: boolean;
  firstSeenAt: string | null;
  minYears: number | null;
  createdAt: string;
  updatedAt: string;
  compatibilityScore: number | null;
  atsScore: number | null;
  reasons?: DiscoverJob["reasons"];
  applicationId?: string | null;
  applicationStatus?: string | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  jsonld: "Company site",
  json_feed: "Job feed",
};

const MANUAL_SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  linkedin: "LinkedIn",
  careers: "Careers page",
  indeed: "Indeed",
  other: "Other",
};

/** Display name of a job's source: the discovery provider, or the source a user picked. */
export function jobSourceLabel(job: Pick<JobRecord, "userId" | "feedSource" | "source">): string {
  if (job.userId === null && job.feedSource && PROVIDER_LABELS[job.feedSource]) {
    return PROVIDER_LABELS[job.feedSource]!;
  }
  return MANUAL_SOURCE_LABELS[job.source] ?? "Other";
}

export function toJobDto(
  job: JobRecord | DiscoverJob | AppliedJob,
  score?: Pick<JobScoreRecord, "compatibilityScore" | "atsScore"> | null,
): JobDtoBase {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companyId: job.companyId,
    location: job.location,
    source: job.source,
    url: job.url,
    description: job.description,
    salary: job.salary,
    status: job.status,
    discovered: job.userId === null,
    sourceLabel: jobSourceLabel(job),
    postedAt: job.postedAt,
    postedAtEstimated: job.postedAtEstimated,
    firstSeenAt: job.firstSeenAt,
    minYears: job.minYears,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    compatibilityScore:
      score?.compatibilityScore ?? ("recommendationScore" in job ? job.recommendationScore : null),
    atsScore: score?.atsScore ?? null,
    reasons: "reasons" in job ? job.reasons : undefined,
    applicationId: "applicationId" in job ? job.applicationId : null,
    applicationStatus: "applicationStatus" in job ? job.applicationStatus : null,
  };
}
