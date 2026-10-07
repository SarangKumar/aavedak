import type { Metadata } from "next";

import { DocumentsHub } from "@/components/documents-hub";
import { requireOnboarded } from "@/lib/app-access";
import { getProfile } from "@/lib/profile";
import { listApplications } from "@/lib/applications";
import { listCoverLetters } from "@/lib/cover-letters";
import { listJobsForUser } from "@/lib/jobs";
import { listResumes } from "@/lib/resumes";
import { listTemplates } from "@/lib/templates";

export const metadata: Metadata = {
  title: "Documents",
  description: "Resumes, cover letters, and reusable templates.",
};

export default async function DocumentsPage() {
  const { user } = await requireOnboarded();
  const profile = await getProfile(user.id);
  const resumes = await listResumes(user.id);
  const coverLetters = await listCoverLetters(user.id);
  const templates = await listTemplates(user.id);
  const applications = await listApplications(user.id, "active");
  const jobs = await listJobsForUser(user.id);

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
      initialResumes={resumes.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        status: r.status,
        originalFilename: r.originalFilename,
        byteSize: r.byteSize,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))}
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
