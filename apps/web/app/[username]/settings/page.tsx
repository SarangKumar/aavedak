import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageStub } from "@/components/page-stub";
import { getProfileByUsername } from "@/lib/profile";

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

  return (
    <PageStub
      title={`@${profile.username} / settings`}
      description="Profile settings including resume upload, activate, and deactivate."
      hint="Visibility, documents, and account prefs for this profile will be managed here."
    />
  );
}
