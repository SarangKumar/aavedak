"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  token: string;
  inviterName: string;
  inviterUsername: string | null;
  isSelf: boolean;
  alreadyFriends: boolean;
  status: string;
};

export function FriendInviteConfirm({
  token,
  inviterName,
  inviterUsername,
  isSelf,
  alreadyFriends,
  status,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyFriends);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/friends/invite/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not accept invite.");
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite.");
    } finally {
      setPending(false);
    }
  }

  if (isSelf) {
    return (
      <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-lg border p-5 shadow-sm">
        <p className="text-foreground text-[13px] leading-relaxed">
          This is your own invite link. Share it with another Aavedak user — they will confirm to
          become friends.
        </p>
        <Link href="/dashboard" className="text-primary text-[13px] hover:underline">
          Go to dashboard
        </Link>
      </Card>
    );
  }

  if (done || alreadyFriends) {
    return (
      <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-lg border p-5 shadow-sm">
        <p className="text-foreground text-[14px] font-semibold">
          You&apos;re friends with {inviterName}
        </p>
        <p className="text-muted-foreground text-[12px] leading-relaxed">
          Open the dashboard to compare applications/day graphs.
        </p>
        <Button type="button" size="sm" onClick={() => router.push("/dashboard")}>
          Open dashboard
        </Button>
      </Card>
    );
  }

  if (status === "accepted") {
    return (
      <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-lg border p-5 shadow-sm">
        <p className="text-foreground text-[13px]">This invite was already used.</p>
        <Link href="/dashboard" className="text-primary text-[13px] hover:underline">
          Dashboard
        </Link>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 bg-card gap-0 space-y-4 rounded-lg border p-5 shadow-sm">
      <p className="text-foreground text-[14px] leading-relaxed">
        <span className="font-semibold">{inviterName}</span>
        {inviterUsername ? (
          <span className="text-muted-foreground"> (@{inviterUsername})</span>
        ) : null}{" "}
        invited you to be friends on Aavedak for a friendly applications/day competition.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" loading={pending} onClick={() => void accept()}>
          Confirm — become friends
        </Button>
        <Link
          href="/dashboard"
          className="border-border text-foreground hover:bg-muted inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium"
        >
          Not now
        </Link>
      </div>
    </Card>
  );
}
