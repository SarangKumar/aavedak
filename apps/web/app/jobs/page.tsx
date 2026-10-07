import type { Metadata } from "next";

import { JobsHub } from "@/components/jobs-hub";
import { requireOnboarded } from "@/lib/app-access";
import { ensureDemoJobs } from "@/lib/jobs";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Multi-source job cards with master-detail view.",
};

export default async function JobsPage() {
  const { user } = await requireOnboarded();
  const jobs = await ensureDemoJobs(user.id);

  return (
    <JobsHub
      initialJobs={jobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        source: job.source,
        url: job.url,
        description: job.description,
        salary: job.salary,
        status: job.status,
        externalId: job.externalId,
        atsScore: job.atsScore,
        resumeMatchScore: job.resumeMatchScore,
        decision: job.decision,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }))}
    />
  );
}
