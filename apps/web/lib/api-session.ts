import "server-only";

import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { PENDING_APPROVAL_MESSAGE, REJECTED_APPROVAL_MESSAGE } from "@/lib/user-approval-shared";

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

/**
 * Session + approved profile for API routes.
 * Returns 401 if unauthenticated, 403 if pending/rejected.
 */
export async function requireApiUser(): Promise<
  { user: ApiUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const profile = await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
  if (profile.approvalStatus === "pending") {
    return {
      error: NextResponse.json({ error: PENDING_APPROVAL_MESSAGE }, { status: 403 }),
    };
  }
  if (profile.approvalStatus === "rejected") {
    return {
      error: NextResponse.json({ error: REJECTED_APPROVAL_MESSAGE }, { status: 403 }),
    };
  }
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
  };
}

/** `requireApiUser` + ADMIN_EMAILS allowlist (403 otherwise). */
export async function requireApiAdmin(): Promise<
  { user: ApiUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const result = await requireApiUser();
  if (result.error) return result;
  if (!isAdminEmail(result.user.email)) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return result;
}
