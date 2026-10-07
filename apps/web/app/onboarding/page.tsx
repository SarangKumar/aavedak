import type { Metadata } from "next";

import { OnboardingForm } from "@/components/onboarding-form";
import { requireOnboardingSession } from "@/lib/app-access";
import { profileHasCompleteCareer } from "@/lib/profile";
import { hasCompletedOnboardingRequirement } from "@/lib/resumes";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Onboarding",
  description: "Set career preferences and upload your PDF resume to start using Aavedak.",
};

export default async function OnboardingPage() {
  const { user, profile } = await requireOnboardingSession();
  const careerComplete = profileHasCompleteCareer(profile);
  const hasResume = await hasCompletedOnboardingRequirement(user.id);

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="relative">
        <OnboardingForm
          username={profile.username}
          email={user.email}
          name={user.name}
          initialCareer={profile.career}
          careerComplete={careerComplete}
          hasResume={hasResume}
        />
      </div>
    </div>
  );
}
