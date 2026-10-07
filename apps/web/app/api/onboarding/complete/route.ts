import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getProfile, profileHasCompleteCareer, setOnboardingComplete } from "@/lib/profile";
import { hasCompletedOnboardingRequirement } from "@/lib/resumes";

export async function POST() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const user = authResult.user;

  if (!(await hasCompletedOnboardingRequirement(user.id))) {
    return NextResponse.json(
      { error: "Upload at least one PDF resume before continuing." },
      { status: 400 },
    );
  }

  const profile = await getProfile(user.id);
  if (!profile || !profileHasCompleteCareer(profile)) {
    return NextResponse.json(
      { error: "Complete your career preferences before continuing." },
      { status: 400 },
    );
  }

  await setOnboardingComplete(user.id, true);
  return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
}
