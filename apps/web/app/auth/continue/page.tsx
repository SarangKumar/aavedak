import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, getServerSession } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { hasFullyOnboarded } from "@/lib/onboarding";
import { isUserCapError, USER_CAP_MESSAGE } from "@/lib/user-cap";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

/**
 * Post-OAuth gate: claim a profile slot (max 8 users) then send to onboarding/dashboard.
 */
export default async function AuthContinuePage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getServerSession();
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
        await auth.api.signOut({ headers: await headers() });
      } catch {
        /* ignore */
      }
      redirect(`/closed?reason=${encodeURIComponent(USER_CAP_MESSAGE)}`);
    }
    throw err;
  }

  const next = params.next?.startsWith("/") ? params.next : null;
  if (next) redirect(next);

  if (await hasFullyOnboarded(session.user.id)) {
    redirect("/dashboard");
  }
  redirect("/onboarding");
}
