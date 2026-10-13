import "server-only";

import { getProfile, profileHasCompleteCareer, type Profile } from "@/lib/profile";
import { hasCompletedOnboardingRequirement } from "@/lib/resumes";

/** Resume uploaded AND YC-style career profile filled. */
export async function hasFullyOnboarded(userId: string, known?: Profile | null): Promise<boolean> {
  // Both lookups at once: each is a Neon round trip. Pass `known` to skip the profile read.
  const [hasResume, profile] = await Promise.all([
    hasCompletedOnboardingRequirement(userId),
    known !== undefined ? known : getProfile(userId),
  ]);
  return hasResume && !!profile && profileHasCompleteCareer(profile);
}
