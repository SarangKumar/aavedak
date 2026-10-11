import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ProfileOwner } from "@/components/profile-owner";
import { ProfileView } from "@/components/profile-view";
import { getOptionalAccess } from "@/lib/app-access";
import { getPreferences } from "@/lib/preferences";
import { getProfileByUsername as loadProfileByUsername } from "@/lib/profile";
import { getActiveResume, listResumes } from "@/lib/resumes";

type Props = { params: Promise<{ username: string }> };

// generateMetadata and the page both need the profile; share one query per request.
const getProfileByUsername = cache(loadProfileByUsername);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) return { title: `@${username}` };
  const titleName = profile.name?.trim() || `@${profile.username}`;
  return {
    title: titleName,
    description: profile.bio?.trim() || `${titleName} on Aavedak`,
  };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);
  if (!profile) notFound();

  const [access, active] = await Promise.all([
    getOptionalAccess(),
    getActiveResume(profile.userId),
  ]);
  const isOwner = access?.user.id === profile.userId;

  if (!isOwner) {
    return (
      <ProfileView
        profile={profile}
        isOwner={false}
        activeResumeTitle={active?.displayName ?? null}
        activeResumeId={active?.id ?? null}
      />
    );
  }

  const [resumeRows, preferences] = await Promise.all([
    listResumes(profile.userId, { includeArchived: false }),
    getPreferences(profile.userId),
  ]);
  const resumes = resumeRows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    status: r.status,
    originalFilename: r.originalFilename,
    byteSize: r.byteSize,
  }));

  return (
    <ProfileOwner
      profile={profile}
      discoveryEnabled={preferences.discoveryEnabled}
      isOwner
      activeResumeTitle={active?.displayName ?? null}
      activeResumeId={active?.id ?? null}
      settingsProfile={{
        username: profile.username,
        name: profile.name,
        bio: profile.bio,
        portfolioUrl: profile.portfolioUrl,
        linkedinUrl: profile.linkedinUrl,
        links: profile.links,
        customLinks: profile.customLinks,
        projects: profile.projects,
        career: profile.career,
      }}
      resumes={resumes}
    />
  );
}
