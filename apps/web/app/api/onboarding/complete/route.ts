import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ensureProfile, setOnboardingComplete } from "@/lib/profile";
import { hasCompletedOnboardingRequirement } from "@/lib/resumes";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  if (!(await hasCompletedOnboardingRequirement(session.user.id))) {
    return NextResponse.json(
      { error: "Upload at least one PDF resume before continuing." },
      { status: 400 },
    );
  }

  await setOnboardingComplete(session.user.id, true);
  return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
}
