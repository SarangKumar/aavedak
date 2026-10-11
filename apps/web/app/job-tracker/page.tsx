import type { Metadata } from "next";

import { JobTrackerBoard } from "@/components/job-tracker-board";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { listCoverLetters } from "@/lib/cover-letters";
import { getJobsByIds } from "@/lib/jobs";
import { getPreferences, updatePreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Job tracker",
  description: "Kanban and list views for every application stage.",
};

export default async function JobTrackerPage() {
  const { user } = await requireOnboarded();

  // Independent reads run in parallel; linked jobs come back in one batched query.
  const [initialPreferences, applications, coverLetters] = await Promise.all([
    getPreferences(user.id),
    listApplications(user.id, "active"),
    listCoverLetters(user.id),
  ]);
  const preferences =
    initialPreferences.trackerScope === "active"
      ? initialPreferences
      : await updatePreferences(user.id, { trackerScope: "active" });
  const coversById = new Map(coverLetters.map((c) => [c.id, c]));
  const jobsById = await getJobsByIds(
    applications.flatMap((app) => (app.jobId ? [app.jobId] : [])),
  );

  const initialApplications = [];
  for (const app of applications) {
    const cover = app.coverLetterId ? coversById.get(app.coverLetterId) : undefined;
    const linkedJob = app.jobId ? jobsById.get(app.jobId) : undefined;
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
      jobRemovedFromPortal: app.jobRemovedFromPortal,
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
