import { ReferralsComposer } from "@/components/referrals-composer";
import { isAdminEmail } from "@/lib/admin";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { listFollowUps } from "@/lib/follow-ups";
import { listDiscoverJobs } from "@/lib/jobs";
import { listPeople } from "@/lib/people";
import { ensureDefaultOutreachTemplate, listTemplates } from "@/lib/templates";

/** Shared loader for /referrals (page) and /referrals/board (full-screen columns). */
export async function ReferralsBoard({ variant }: { variant: "page" | "board" }) {
  const { user } = await requireOnboarded();
  await ensureDefaultOutreachTemplate(user.id);

  const applications = await listApplications(user.id, "active");
  const people = await listPeople();
  const templates = await listTemplates(user.id);
  // Include sent follow-ups so Applications can split Needs referral vs Already sent.
  const followUps = await listFollowUps(user.id, { includeClosed: true });
  // Jobs-page jobs with no application yet (shown as "Not applied" in Active applications).
  const discoverJobs = await listDiscoverJobs(user.id);

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative">
        <ReferralsComposer
          variant={variant}
          userEmail={user.email}
          userName={user.name ?? ""}
          isAdmin={isAdminEmail(user.email)}
          initialApplications={applications.map((app) => ({
            id: app.id,
            companyName: app.companyName,
            role: app.role,
            location: app.location,
            status: app.status,
            jobId: app.jobId,
            updatedAt: app.updatedAt,
          }))}
          initialDiscoverJobs={discoverJobs.map((j) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
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
            mailKind: f.mailKind,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          }))}
        />
      </div>
    </div>
  );
}
