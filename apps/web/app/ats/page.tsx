import type { Metadata } from "next";

import { AtsHub } from "@/components/ats-hub";
import { requireOnboarded } from "@/lib/app-access";
import { listResumes } from "@/lib/resumes";

export const metadata: Metadata = {
  title: "ATS score",
  description: "See ATS readiness for your resumes and score them against a job description.",
  robots: { index: false, follow: false },
};

export default async function AtsPage() {
  const { user } = await requireOnboarded();
  const resumes = await listResumes(user.id);

  return (
    <AtsHub
      initialResumes={resumes.map((resume) => ({
        id: resume.id,
        displayName: resume.displayName,
        originalFilename: resume.originalFilename,
        status: resume.status,
        atsScore: resume.atsScore,
        byteSize: resume.byteSize,
        updatedAt: resume.updatedAt,
      }))}
    />
  );
}
