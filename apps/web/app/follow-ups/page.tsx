import type { Metadata } from "next";

import { FollowUpsHub } from "@/components/follow-ups-hub";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { listFollowUps } from "@/lib/follow-ups";
import { listPeople } from "@/lib/people";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Follow-ups",
  description: "Pending asks and queued outreach for your applications.",
};

export default async function FollowUpsPage() {
  const { user } = await requireOnboarded();
  const followUps = await listFollowUps(user.id, { includeClosed: true });
  const people = await listPeople({ includeArchived: true });
  const applications = await listApplications(user.id, "active");

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative">
        <FollowUpsHub
          initialFollowUps={followUps.map((f) => ({
            id: f.id,
            title: f.title,
            dueDate: f.dueDate,
            sendAfter: f.sendAfter,
            status: f.status,
            personId: f.personId,
            applicationId: f.applicationId,
            notes: f.notes,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          }))}
          people={people.map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            company: p.company,
          }))}
          applications={applications.map((a) => ({
            id: a.id,
            companyName: a.companyName,
            role: a.role,
          }))}
        />
      </div>
    </div>
  );
}
