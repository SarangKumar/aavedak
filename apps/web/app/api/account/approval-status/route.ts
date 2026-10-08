import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { hasFullyOnboarded } from "@/lib/onboarding";

/** Lightweight poll for the approval waiting page. */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const profile = await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  let next: "/dashboard" | "/onboarding" | null = null;
  if (profile.approvalStatus === "approved") {
    next = (await hasFullyOnboarded(session.user.id)) ? "/dashboard" : "/onboarding";
  }

  return NextResponse.json({
    status: profile.approvalStatus,
    next,
  });
}
