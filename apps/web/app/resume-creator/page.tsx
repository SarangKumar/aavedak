import type { Metadata } from "next";

import { ResumeCreator } from "@/components/resume-creator";
import { getServerSession } from "@/lib/auth";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = {
  title: "Create resume",
  description:
    "Build a formal resume with live A4 preview. Download for free; sign in to save and run ATS scores.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/resume-creator" },
};

/**
 * Public builder: signed-out users can edit + download. Save and live ATS scoring
 * are gated in the client. Intentionally NOT in middleware matcher.
 */
export default async function ResumeCreatorPage() {
  const session = await getServerSession();
  let yearsExperience: number | null = null;
  if (session?.user?.id) {
    try {
      const profile = await getProfile(session.user.id);
      const y = profile?.career?.yearsExperience;
      yearsExperience = typeof y === "number" && Number.isFinite(y) ? y : null;
    } catch {
      yearsExperience = null;
    }
  }
  return <ResumeCreator yearsExperience={yearsExperience} />;
}
