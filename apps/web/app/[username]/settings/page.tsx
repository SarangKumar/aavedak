import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} · Settings` };
}

export default async function ProfileSettingsPage({ params }: Props) {
  const { username } = await params;
  return (
    <PageStub
      title={`@${username} / settings`}
      description="Profile settings including resume upload, activate, and deactivate."
      hint="Visibility, documents, and account prefs for this profile will be managed here."
    />
  );
}
