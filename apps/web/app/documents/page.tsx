import type { Metadata } from "next";

import { DocumentsHub } from "@/components/documents-hub";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { listCoverLetters } from "@/lib/cover-letters";
import { listResumes } from "@/lib/resumes";
import { listTemplates } from "@/lib/templates";

export const metadata: Metadata = {
  title: "Documents",
  description: "Resumes, cover letters, and reusable templates.",
};

export default async function DocumentsPage() {
  const { user } = await requireOnboarded();
  const resumes = listResumes(user.id);
  const coverLetters = listCoverLetters(user.id);
  const templates = listTemplates(user.id);
  const applications = listApplications(user.id, "active");

  return (
    <DocumentsHub
      userEmail={user.email}
      userName={user.name}
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
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))}
      initialTemplates={templates.map((t) => ({
        id: t.id,
        title: t.title,
        body: t.body,
        kind: t.kind,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))}
    />
  );
}
