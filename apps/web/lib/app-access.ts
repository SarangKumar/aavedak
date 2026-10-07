import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ensureProfile, type Profile } from "@/lib/profile";
import { hasCompletedOnboardingRequirement } from "@/lib/resumes";

export type AppSessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type AppAccess = {
  user: AppSessionUser;
  profile: Profile;
};

async function getSessionUser(): Promise<AppSessionUser | null> {
  const { data: session } = await auth.getSession();
  if (!session?.user?.email) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  };
}

/** Authenticated + ≥1 non-archived resume. Otherwise redirect to onboarding / sign-in. */
export async function requireOnboarded(): Promise<AppAccess> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  const profile = await ensureProfile(user);
  if (!(await hasCompletedOnboardingRequirement(user.id))) {
    redirect("/onboarding");
  }
  return { user, profile };
}

/** Authenticated user for onboarding. If already has a usable resume → dashboard. */
export async function requireOnboardingSession(): Promise<AppAccess> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/onboarding");
  const profile = await ensureProfile(user);
  if (await hasCompletedOnboardingRequirement(user.id)) {
    if (!profile.onboardingComplete) {
      const { setOnboardingComplete } = await import("@/lib/profile");
      await setOnboardingComplete(user.id, true);
    }
    redirect("/dashboard");
  }
  return { user, profile };
}

export async function getOptionalAccess(): Promise<AppAccess | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  return { user, profile };
}
