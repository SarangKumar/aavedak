import type { Metadata } from "next";

import { FriendsHub } from "@/components/friends-hub";
import { requireOnboarded } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "Friends",
  description: "Shared friend graph and bidirectional application history on Aavedak.",
};

export default async function FriendsPage() {
  const { user } = await requireOnboarded();
  return (
    <FriendsHub
      initialMe={{
        userId: user.id,
        name: user.name || user.email,
        email: user.email,
        image: user.image,
      }}
    />
  );
}
