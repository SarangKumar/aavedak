import type { Metadata } from "next";

import { AtsHub } from "@/components/ats-hub";
import { requireOnboarded } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "ATS score",
  description: "See ATS readiness for your resumes and score them against a job description.",
  robots: { index: false, follow: false },
};

export default async function AtsPage() {
  await requireOnboarded();

  // Resumes load client-side (`/api/resumes`) so the page shell renders immediately.
  return <AtsHub initialResumes={null} />;
}
