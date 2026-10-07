import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileView } from "@/components/profile-view";
import { getOptionalAccess } from "@/lib/app-access";
import { getProfileByUsername } from "@/lib/profile";
import { getActiveResume } from "@/lib/resumes";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = getProfileByUsername(username);
  if (!profile) return { title: `@${username}` };
  const titleName = profile.name?.trim() || `@${profile.username}`;
  return {
    title: titleName,
    description: profile.bio?.trim() || `${titleName} on Aavedak`,
  };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const profile = getProfileByUsername(username);
  if (!profile) notFound();

  const access = await getOptionalAccess();
  const isOwner = access?.user.id === profile.userId;
  const active = getActiveResume(profile.userId);

  return (
    <ProfileView
      profile={profile}
      isOwner={Boolean(isOwner)}
      activeResumeTitle={active?.displayName ?? null}
    />
  );
}
