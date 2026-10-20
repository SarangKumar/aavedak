import type { Metadata } from "next";

import { ResumeImprover } from "@/components/resume-improver";
import { requireOnboarded } from "@/lib/app-access";
import { cardAtsInputs } from "@/lib/resumes";

export const metadata: Metadata = {
  title: "Improve resume",
  description: "Tighten resume wording and ordering for a role without inventing anything.",
  robots: { index: false, follow: false },
};

export default async function ResumeImproverPage() {
  const { user, profile } = await requireOnboarded();
  const inputs = await cardAtsInputs(user.id);
  return (
    <ResumeImprover
      defaultRole={inputs.role}
      defaultYearsExperience={inputs.yearsExperience}
      // Offered first in the role picker; the user can still type any other role.
      preferredRoles={profile.career.preferredRoles}
    />
  );
}
