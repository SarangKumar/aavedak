import "server-only";

import { getProfile, profileHasCompleteCareer } from "@/lib/profile";
import { hasCompletedOnboardingRequirement } from "@/lib/resumes";

/** Resume uploaded AND YC-style career profile filled. */
export async function hasFullyOnboarded(userId: string): Promise<boolean> {
  if (!(await hasCompletedOnboardingRequirement(userId))) return false;
  const profile = await getProfile(userId);
  if (!profile) return false;
  return profileHasCompleteCareer(profile);
}
