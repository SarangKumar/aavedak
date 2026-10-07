import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { hasCompletedOnboardingRequirement } from "@/lib/resumes";
import { isUserCapError, USER_CAP_MESSAGE } from "@/lib/user-cap";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

/**
 * Post-OAuth gate: claim a profile slot (max 8 users) then send to onboarding/dashboard.
 */
export default async function AuthContinuePage({ searchParams }: Props) {
  const params = await searchParams;
  const { data: session } = await auth.getSession();
  if (!session?.user?.email) {
    redirect("/sign-in");
  }

  try {
    await ensureProfile({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    });
  } catch (err) {
    if (isUserCapError(err)) {
      try {
        await auth.signOut();
      } catch {
        /* ignore */
      }
      redirect(`/closed?reason=${encodeURIComponent(USER_CAP_MESSAGE)}`);
    }
    throw err;
  }

  const next = params.next?.startsWith("/") ? params.next : null;
  if (next) redirect(next);

  if (await hasCompletedOnboardingRequirement(session.user.id)) {
    redirect("/dashboard");
  }
  redirect("/onboarding");
}
