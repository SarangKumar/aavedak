import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProfileSettings } from "@/components/profile-settings";
import { getOptionalAccess } from "@/lib/app-access";
import { getProfileByUsername } from "@/lib/profile";
import { listResumes } from "@/lib/resumes";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = getProfileByUsername(username);
  return { title: profile ? `@${profile.username} · Settings` : `@${username} · Settings` };
}

export default async function ProfileSettingsPage({ params }: Props) {
  const { username } = await params;
  const profile = getProfileByUsername(username);
  if (!profile) notFound();

  const access = await getOptionalAccess();
  if (!access) {
    redirect(`/sign-in?next=/${profile.username}/settings`);
  }
  if (access.user.id !== profile.userId) {
    notFound();
  }

  const resumes = listResumes(profile.userId, { includeArchived: false }).map((r) => ({
    id: r.id,
    displayName: r.displayName,
    status: r.status,
    originalFilename: r.originalFilename,
    byteSize: r.byteSize,
  }));

  return (
    <ProfileSettings
      profile={{
        username: profile.username,
        name: profile.name,
        bio: profile.bio,
        portfolioUrl: profile.portfolioUrl,
        linkedinUrl: profile.linkedinUrl,
      }}
      initialResumes={resumes}
    />
  );
}
