import type { Metadata } from "next";

import { PeopleHub } from "@/components/people-hub";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { listPeople } from "@/lib/people";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "People",
  description: "Contacts for warm intros and cold outreach.",
};

export default async function PeoplePage() {
  const { user } = await requireOnboarded();
  const people = await listPeople({ includeArchived: true });
  const applications = await listApplications(user.id, "active");

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative">
        <PeopleHub
          initialPeople={people.map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            company: p.company,
            roleTitle: p.roleTitle,
            notes: p.notes,
            applicationId: p.applicationId,
            status: p.status,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
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
