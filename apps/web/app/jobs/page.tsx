import type { Metadata } from "next";

import { JobsHub } from "@/components/jobs-hub";
import { requireOnboarded } from "@/lib/app-access";
import { toJobDto } from "@/lib/job-dto";
import { listJobScores } from "@/lib/job-scoring";
import { listAppliedJobs, listDiscoverJobs } from "@/lib/jobs";
import { getPreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Jobs",
  description: "Discovered junior engineering roles in India and the jobs you applied to.",
};

export default async function JobsPage() {
  const { user, profile } = await requireOnboarded();
  // Scores are written by discovery (FastAPI) and on manual job create — never computed here.
  const [discover, applied, scores, prefs] = await Promise.all([
    listDiscoverJobs(user.id),
    listAppliedJobs(user.id),
    listJobScores(user.id),
    getPreferences(user.id),
  ]);
  const byJob = new Map(scores.map((s) => [s.jobId, s]));

  return (
    <JobsHub
      initialDiscover={discover.map((job) => toJobDto(job, byJob.get(job.id)))}
      initialApplied={applied.map((job) => toJobDto(job, byJob.get(job.id)))}
      discoveryEnabled={prefs.discoveryEnabled}
      profileSettingsHref={`/${profile.username}/settings`}
    />
  );
}
