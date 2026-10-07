import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FriendInviteConfirm } from "@/components/friend-invite-confirm";
import { ShellWidth } from "@/components/shell-width";
import { getServerSession } from "@/lib/auth";
import { getFriendshipByToken } from "@/lib/friends";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Friend invite",
  description: "Confirm a friendship invite on Aavedak.",
};

type Props = { params: Promise<{ token: string }> };

export default async function FriendInvitePage({ params }: Props) {
  const { token } = await params;
  const session = await getServerSession();
  if (!session?.user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/friends/invite/${token}`)}`);
  }

  const friendship = await getFriendshipByToken(token);
  if (!friendship || friendship.status === "revoked") {
    return (
      <ShellWidth className="aavedak-fade-up space-y-3 py-10">
        <h1 className="aavedak-display text-foreground text-2xl">Invite not found</h1>
        <p className="text-muted-foreground text-[13px]">
          This link is invalid or was rotated. Ask your friend for a fresh invite from Profile →
          Friends.
        </p>
        <Link href="/dashboard" className="text-primary text-[13px] hover:underline">
          Back to dashboard
        </Link>
      </ShellWidth>
    );
  }

  const inviter = await getProfile(friendship.inviterId);
  const isSelf = friendship.inviterId === session.user.id;
  const alreadyFriends =
    friendship.status === "accepted" && friendship.inviteeId === session.user.id;

  return (
    <ShellWidth className="aavedak-fade-up max-w-lg space-y-4 py-10">
      <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
        आवेदक
      </p>
      <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Friend invite</h1>
      <FriendInviteConfirm
        token={token}
        inviterName={inviter?.name?.trim() || (inviter ? `@${inviter.username}` : "Someone")}
        inviterUsername={inviter?.username ?? null}
        isSelf={isSelf}
        alreadyFriends={alreadyFriends}
        status={friendship.status}
      />
    </ShellWidth>
  );
}
