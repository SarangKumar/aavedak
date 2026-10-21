import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getProfile, profileHasCompleteCareer, setOnboardingComplete } from "@/lib/profile";
import { rerankUser } from "@/lib/rerank-user";
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
  // Rank now, after the flag is set: the career save earlier in onboarding re-ranked while the
  // user was not yet onboarded, which ranks nothing. This fills today's list (cap, experience
  // window and India-first order as usual) from jobs already in the pool, so Jobs is not empty
  // until the next scan. A user still pending approval gets zeros and is ranked on approval.
  // A ranking failure does not block onboarding; the daily rank cron catches up.
  const rank = await rerankUser(user.id);
  return NextResponse.json({ ok: true, redirectTo: "/dashboard", rank });
}
