import type { Metadata } from "next";

import { JobTrackerBoard } from "@/components/job-tracker-board";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications, seedDemoAppliedApplications } from "@/lib/applications";
import { getPreferences, updatePreferences } from "@/lib/preferences";

export const metadata: Metadata = {
  title: "Job tracker",
  description: "Kanban and list views for every application stage.",
};

export default async function JobTrackerPage() {
  const { user } = await requireOnboarded();
  // Idempotent: upserts Sarang's four applied roles by company+role.
  seedDemoAppliedApplications(user.id);

  let preferences = getPreferences(user.id);
  const active = listApplications(user.id, "active");
  const archived = listApplications(user.id, "archived");

  // Don't leave the user on empty Archived when active pipeline has cards (e.g. after seed).
  if (preferences.trackerScope === "archived" && archived.length === 0 && active.length > 0) {
    preferences = updatePreferences(user.id, { trackerScope: "active" });
  }

  const applications = preferences.trackerScope === "archived" ? archived : active;

  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
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
            trackerScope: preferences.trackerScope,
            hiddenColumns: preferences.hiddenColumns,
          }}
        />
      </div>
    </div>
  );
}
