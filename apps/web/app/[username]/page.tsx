import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageStub } from "@/components/page-stub";
import { getProfileByUsername } from "@/lib/profile";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = getProfileByUsername(username);
  return { title: profile ? `@${profile.username}` : `@${username}` };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const profile = getProfileByUsername(username);
  if (!profile) notFound();

  return (
    <PageStub
      title={`@${profile.username}`}
      description={
        profile.name
          ? `${profile.name}'s shareable Avsar profile.`
          : "Shareable public profile. App routes stay at the root — only profiles use a username prefix."
      }
      hint="Bio, links, and active resume will appear when this profile is published."
    />
  );
}
