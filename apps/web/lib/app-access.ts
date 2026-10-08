import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, getServerSession } from "@/lib/auth";
import { ensureProfile, type Profile } from "@/lib/profile";
import { hasFullyOnboarded } from "@/lib/onboarding";
import { PENDING_APPROVAL_MESSAGE, REJECTED_APPROVAL_MESSAGE } from "@/lib/user-approval-shared";

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
  const session = await getServerSession();
  if (!session?.user?.email) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  };
}

function enforceApproval(profile: Profile): void {
  if (profile.approvalStatus === "pending" || profile.approvalStatus === "rejected") {
    redirect("/pending-approval");
  }
}

/** Authenticated + approved + career preferences + ≥1 resume. */
export async function requireOnboarded(): Promise<AppAccess> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  const profile = await ensureProfile(user);
  enforceApproval(profile);
  if (!(await hasFullyOnboarded(user.id))) {
    redirect("/onboarding");
  }
  return { user, profile };
}

/** Authenticated + approved user for onboarding. If fully onboarded → dashboard. */
export async function requireOnboardingSession(): Promise<AppAccess> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/onboarding");
  const profile = await ensureProfile(user);
  enforceApproval(profile);
  if (await hasFullyOnboarded(user.id)) {
    if (!profile.onboardingComplete) {
      const { setOnboardingComplete } = await import("@/lib/profile");
      await setOnboardingComplete(user.id, true);
    }
    redirect("/dashboard");
  }
  return { user, profile };
}

/** Session for the approval status page (pending or rejected). */
export async function requirePendingApprovalSession(): Promise<AppAccess> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/pending-approval");
  const profile = await ensureProfile(user);
  if (profile.approvalStatus === "approved") {
    if (await hasFullyOnboarded(user.id)) redirect("/dashboard");
    redirect("/onboarding");
  }
  return { user, profile };
}

export async function getOptionalAccess(): Promise<AppAccess | null> {
  const user = await getSessionUser();
  if (!user) return null;
  try {
    const profile = await ensureProfile(user);
    return { user, profile };
  } catch {
    return null;
  }
}

/** Sign out helper used by rejected/closed flows. */
export async function signOutBestEffort(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    /* ignore */
  }
}

export { PENDING_APPROVAL_MESSAGE, REJECTED_APPROVAL_MESSAGE };
