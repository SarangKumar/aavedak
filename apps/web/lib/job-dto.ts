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
