import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  return (
    <PageStub
      title={`@${username}`}
      description="Shareable public profile. App routes stay at the root — only profiles use a username prefix."
      hint="Bio, links, and active resume will appear when this profile is published."
    />
  );
}
