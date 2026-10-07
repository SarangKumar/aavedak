import type { Metadata } from "next";

import { JobTrackerBoard } from "@/components/job-tracker-board";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications, seedDemoAppliedApplications } from "@/lib/applications";
import { seedBulkApplications } from "@/lib/applications-bulk-seed";
import { getPreferences, updatePreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  title: "Job tracker",
  description: "Kanban and list views for every application stage.",
};

export default async function JobTrackerPage() {
  const { user } = await requireOnboarded();
  seedDemoAppliedApplications(user.id);
  seedBulkApplications(user.id);

  let preferences = getPreferences(user.id);
  if (preferences.trackerScope !== "active") {
    preferences = updatePreferences(user.id, { trackerScope: "active" });
  }

  const applications = listApplications(user.id, "active");

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative">
        <JobTrackerBoard
          initialApplications={applications.map((app) => ({
            id: app.id,
            companyName: app.companyName,
            role: app.role,
            location: app.location,
            salaryCtc: app.salaryCtc,
            jobLink: app.jobLink,
            jobId: app.jobId,
            status: app.status,
            notes: app.notes,
            appliedAt: app.appliedAt,
            createdAt: app.createdAt,
            updatedAt: app.updatedAt,
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
