import type { Metadata } from "next";

import { JobTrackerBoard } from "@/components/job-tracker-board";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { listCoverLetters } from "@/lib/cover-letters";
import { getJobById } from "@/lib/jobs";
import { getPreferences, updatePreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Job tracker",
  description: "Kanban and list views for every application stage.",
};

export default async function JobTrackerPage() {
  const { user } = await requireOnboarded();

  let preferences = await getPreferences(user.id);
  if (preferences.trackerScope !== "active") {
    preferences = await updatePreferences(user.id, { trackerScope: "active" });
  }

  const applications = await listApplications(user.id, "active");
  const coverLetters = await listCoverLetters(user.id);
  const coversById = new Map(coverLetters.map((c) => [c.id, c]));

  const jobCache = new Map<string, { title: string; company: string } | null>();
  async function jobMeta(jobId: string | null) {
    if (!jobId) return null;
    if (jobCache.has(jobId)) return jobCache.get(jobId) ?? null;
    const job = await getJobById(jobId);
    const meta = job ? { title: job.title, company: job.company } : null;
    jobCache.set(jobId, meta);
    return meta;
  }

  const initialApplications = [];
  for (const app of applications) {
    const cover = app.coverLetterId ? coversById.get(app.coverLetterId) : undefined;
    const linkedJob = await jobMeta(app.jobId);
    initialApplications.push({
      id: app.id,
      companyName: app.companyName,
      companyId: app.companyId,
      role: app.role,
      location: app.location,
      salaryCtc: app.salaryCtc,
      jobLink: app.jobLink,
      jobId: app.jobId,
      coverLetterId: app.coverLetterId,
      coverLetterTitle: cover?.title ?? null,
      jobTitle: linkedJob?.title ?? null,
      status: app.status,
      statusReason: app.statusReason,
      notes: app.notes,
      appliedAt: app.appliedAt,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    });
  }

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative">
        <JobTrackerBoard
          initialApplications={initialApplications}
          initialCoverLetters={coverLetters.map((c) => ({
            id: c.id,
            title: c.title,
            companyName: c.companyName,
            roleTitle: c.roleTitle,
            jobId: c.jobId,
          }))}
          initialPreferences={{
            trackerView: preferences.trackerView,
            trackerScope: "active",
            hiddenColumns: preferences.hiddenColumns,
          }}
        />
      </div>
    </div>
  );
}
