import type { Metadata } from "next";

import { AtsHub } from "@/components/ats-hub";
import { requireOnboarded } from "@/lib/app-access";
import { cardAtsInputs } from "@/lib/resumes";

export const metadata: Metadata = {
  title: "ATS score",
  description: "See ATS readiness for your resumes and score them against a job description.",
  robots: { index: false, follow: false },
};

export default async function AtsPage() {
  const { user } = await requireOnboarded();
  // Same role + years the Documents card score uses, so default runs agree with the card.
  const inputs = await cardAtsInputs(user.id);

  // Resumes load client-side (`/api/resumes`) so the page shell renders immediately.
  return (
    <AtsHub
      initialResumes={null}
      defaultRole={inputs.role}
      defaultYearsExperience={inputs.yearsExperience}
    />
  );
}
