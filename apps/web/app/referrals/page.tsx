import type { Metadata } from "next";
import Link from "next/link";

import { ReferralsComposer } from "@/components/referrals-composer";
import { ShellWidth } from "@/components/shell-width";
import { isAdminEmail } from "@/lib/admin";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { listFollowUps } from "@/lib/follow-ups";
import { listPeople } from "@/lib/people";
import { ensureDefaultOutreachTemplate, listTemplates } from "@/lib/templates";

export const metadata: Metadata = {
  title: "Referrals",
  description: "Compose cold outreach, pick recipients, and queue follow-ups.",
};

export default async function ReferralsPage() {
  const { user } = await requireOnboarded();
  ensureDefaultOutreachTemplate(user.id);

  const applications = listApplications(user.id, "active");
  const people = listPeople(user.id);
  const templates = listTemplates(user.id);
  const followUps = listFollowUps(user.id, { includeClosed: false });

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative space-y-3 pt-6">
        <ShellWidth className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <Link href="/people" className="text-primary font-medium hover:underline">
            Manage people
          </Link>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <Link href="/follow-ups" className="text-primary font-medium hover:underline">
            Open follow-ups
          </Link>
        </ShellWidth>
        <ReferralsComposer
          userEmail={user.email}
          userName={user.name ?? ""}
          isAdmin={isAdminEmail(user.email)}
          initialApplications={applications.map((app) => ({
            id: app.id,
            companyName: app.companyName,
            role: app.role,
            location: app.location,
            status: app.status,
            updatedAt: app.updatedAt,
          }))}
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
          initialTemplates={templates.map((t) => ({
            id: t.id,
            title: t.title,
            subject: t.subject,
            body: t.body,
            kind: t.kind,
            status: t.status,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }))}
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
        />
      </div>
    </div>
  );
}
