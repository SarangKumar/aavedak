import type { Metadata } from "next";

import { JobsHub } from "@/components/jobs-hub";
import { requireOnboarded } from "@/lib/app-access";
import { ensureDemoJobs, listJobsForUser } from "@/lib/jobs";
import { listJobScores, scoreJobForUser } from "@/lib/job-scoring";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Jobs",
  description: "Multi-source job cards with master-detail view.",
};

export default async function JobsPage() {
  const { user } = await requireOnboarded();
  await ensureDemoJobs(user.id);
  const jobs = await listJobsForUser(user.id);
  let scores = await listJobScores(user.id);
  if (scores.length < Math.min(jobs.length, 8)) {
    for (const job of jobs.slice(0, 24)) {
      await scoreJobForUser(user.id, job);
    }
    scores = await listJobScores(user.id);
  }
  const byJob = new Map(scores.map((s) => [s.jobId, s]));

  return (
    <JobsHub
      initialJobs={jobs.map((job) => {
        const score = byJob.get(job.id);
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
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          compatibilityScore: score?.compatibilityScore ?? null,
          atsScore: score?.atsScore ?? null,
        };
      })}
    />
  );
}
