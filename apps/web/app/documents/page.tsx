import type { Metadata } from "next";

import { DocumentsHub } from "@/components/documents-hub";
import { requireOnboarded } from "@/lib/app-access";
import { getProfile } from "@/lib/profile";
import { listApplications } from "@/lib/applications";
import { listCoverLetters } from "@/lib/cover-letters";
import { listJobsForUser } from "@/lib/jobs";
import {
  ensureDefaultFollowupTemplate,
  ensureDefaultOutreachTemplate,
  listTemplates,
} from "@/lib/templates";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Documents",
  description: "Resumes, cover letters, referral email, and follow-up email templates.",
};

export default async function DocumentsPage() {
  const { user } = await requireOnboarded();
  const [profile, coverLetters, applications, jobs] = await Promise.all([
    getProfile(user.id),
    listCoverLetters(user.id),
    listApplications(user.id, "active"),
    listJobsForUser(user.id),
    ensureDefaultOutreachTemplate(user.id),
    ensureDefaultFollowupTemplate(user.id),
  ]);
  // Must follow the ensure* calls above so the default templates exist.
  const templates = await listTemplates(user.id);

  return (
    <DocumentsHub
      userEmail={user.email}
      userName={user.name}
      profileEmail={profile?.email ?? user.email ?? null}
      profileLinks={profile?.links ?? {}}
      initialJobs={jobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        compatibilityScore: null,
        atsScore: null,
      }))}
      initialApplications={applications.map((a) => ({
        id: a.id,
        companyName: a.companyName,
        role: a.role,
        location: a.location,
      }))}
      // Resumes load client-side (`/api/resumes`) so the rest of the page is not blocked.
      initialResumes={null}
      initialCoverLetters={coverLetters.map((c) => ({
        id: c.id,
        title: c.title,
        body: c.body,
        applicationId: c.applicationId,
        jobId: c.jobId,
        companyName: c.companyName,
        roleTitle: c.roleTitle,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
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
    />
  );
}
