import type { Metadata } from "next";

import { ReferralsHub } from "@/components/referrals-hub";
import { requireOnboarded } from "@/lib/app-access";
import { listFollowUps } from "@/lib/follow-ups";
import { listPeople } from "@/lib/people";

export const metadata: Metadata = {
  title: "Referrals",
  description: "Track referral contacts and follow-ups.",
};

export default async function ReferralsPage() {
  const { user } = await requireOnboarded();
  const people = listPeople(user.id);
  const followUps = listFollowUps(user.id, { includeClosed: false });

  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative">
        <ReferralsHub
          userEmail={user.email}
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
          initialFollowUps={followUps.map((f) => ({
            id: f.id,
            title: f.title,
            dueDate: f.dueDate,
            status: f.status,
            personId: f.personId,
            applicationId: f.applicationId,
            notes: f.notes,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          }))}
        />
      </div>
    </div>
  );
}
