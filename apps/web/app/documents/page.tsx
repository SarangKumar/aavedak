import type { Metadata } from "next";

import { DocumentsHub } from "@/components/documents-hub";
import { requireOnboarded } from "@/lib/app-access";
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

  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative">
        <DocumentsHub
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
      </div>
    </div>
  );
}
