import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { hasFullyOnboarded } from "@/lib/onboarding";
import { REJECTED_APPROVAL_MESSAGE } from "@/lib/user-approval";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

/**
 * Post-OAuth gate: create profile (pending unless admin), then route by approval + onboarding.
 */
export default async function AuthContinuePage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getServerSession();
  if (!session?.user?.email) {
    redirect("/sign-in");
  }

  const profile = await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  if (profile.approvalStatus === "pending") {
    redirect("/pending-approval");
  }
  if (profile.approvalStatus === "rejected") {
    redirect(`/closed?reason=${encodeURIComponent(REJECTED_APPROVAL_MESSAGE)}`);
  }

  const next = params.next?.startsWith("/") ? params.next : null;
  if (next && next !== "/onboarding" && next !== "/pending-approval") {
    // Only send to app routes after approval; still honor deep links for approved users.
    if (await hasFullyOnboarded(session.user.id)) redirect(next);
  }
  if (next) redirect(next);

  if (await hasFullyOnboarded(session.user.id)) {
    redirect("/dashboard");
  }
  redirect("/onboarding");
}
