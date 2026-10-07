import type { Metadata } from "next";

import { OnboardingForm } from "@/components/onboarding-form";
import { requireOnboardingSession } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Upload your PDF resume to start using Arambh.",
};

export default async function OnboardingPage() {
  const { user, profile } = await requireOnboardingSession();

  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="relative">
        <OnboardingForm username={profile.username} email={user.email} name={user.name} />
      </div>
    </div>
  );
}
