"use client";

import { useCallback, useEffect, useState } from "react";

import { FriendGraph, type ChartSeries } from "@/components/friend-graph";
import { ShellWidth } from "@/components/shell-width";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type FriendDto = {
  userId: string;
  username: string;
  name: string;
  email: string | null;
  since: string;
};

type InviteRow = {
  friendship: { id: string };
  from?: FriendDto;
  to?: FriendDto;
};

type FriendsHubProps = {
  initialMe: { userId: string; name: string; email: string; image?: string | null };
};

export function FriendsHub({ initialMe }: FriendsHubProps) {
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [series, setSeries] = useState<ChartSeries[]>([]);
  const [incoming, setIncoming] = useState<InviteRow[]>([]);
  const [outgoing, setOutgoing] = useState<InviteRow[]>([]);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<InviteRow | null>(null);
  const [duration, setDuration] = useState<"30d" | "all">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/friends");
      const data = (await res.json()) as {
        friends?: FriendDto[];
        series?: ChartSeries[];
        incoming?: InviteRow[];
        outgoing?: InviteRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not load friends.");
      setFriends(data.friends ?? []);
      setSeries(data.series ?? []);
      setIncoming(data.incoming ?? []);
      setOutgoing(data.outgoing ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load friends.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sendInvite() {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Invite failed.");
      return;
    }
    setUsername("");
    setNotice("Invite sent.");
    await refresh();
  }

  async function acceptInvite(id: string) {
    setError(null);
    const res = await fetch(`/api/friends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    const data = (await res.json()) as { error?: string; notice?: string };
    if (!res.ok) {
      setError(data.error || "Could not accept.");
      return;
    }
    setPendingInvite(null);
    setNotice(
      data.notice ||
        "Friendship is bidirectional. You can see their application history, and they can see yours.",
    );
    await refresh();
  }

  async function declineInvite(id: string) {
    await fetch(`/api/friends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    });
    setPendingInvite(null);
    await refresh();
  }

  return (
    <ShellWidth className="space-y-5 py-6 sm:py-8">
      <header className="space-y-1.5">
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Friends</h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          One shared chart for you and your friends — each person is a colored line of cumulative
          applications. Up to 10 friends appear at once. Friendship is bidirectional — both of you
          can see each other’s application history.
        </p>
      </header>

      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      {notice ? <p className="text-primary text-[13px] font-medium">{notice}</p> : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-[12px]">
          <span className="text-muted-foreground">Invite by username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="friend-username"
            className="border-border bg-background text-foreground block h-9 w-56 rounded-lg border px-3 text-[13px]"
          />
        </label>
        <Button
          type="button"
          size="sm"
          onClick={() => void sendInvite()}
          disabled={!username.trim()}
        >
          Send invite
        </Button>
        {friends.length > 0 ? (
          <p className="text-muted-foreground ml-auto text-[12px]">
            {friends.length} friend{friends.length === 1 ? "" : "s"} on the chart
          </p>
        ) : null}
      </div>

      <FriendGraph
        series={
          series.length > 0
            ? series
            : [
                {
                  userId: initialMe.userId,
                  name: initialMe.name || "You",
                  isMe: true,
                  color: "oklch(0.62 0.14 155)",
                  points: [],
                },
              ]
        }
        loading={loading}
        duration={duration}
        onDurationChange={setDuration}
      />

      <section className="space-y-2">
        <h2 className="text-foreground text-[13px] font-semibold">Incoming invites</h2>
        {incoming.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">No pending invites.</p>
        ) : (
          <ul className="space-y-2">
            {incoming.map((row) => (
              <li
                key={row.friendship.id}
                className="border-border/80 bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
              >
                <p className="text-foreground text-[13px]">
                  {row.from?.name}{" "}
                  <span className="text-muted-foreground">/{row.from?.username}</span>
                </p>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" onClick={() => setPendingInvite(row)}>
                    Review
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void declineInvite(row.friendship.id)}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-foreground text-[13px] font-semibold">Outgoing invites</h2>
          <ul className="text-muted-foreground space-y-1 text-[12px]">
            {outgoing.map((row) => (
              <li key={row.friendship.id}>
                Waiting on {row.to?.name} /{row.to?.username}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal
        open={Boolean(pendingInvite)}
        onClose={() => setPendingInvite(null)}
        title="Accept friend invite?"
        description="Friendship goes both ways."
        footer={
          <>
            <button
              type="button"
              className="border-border text-muted-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
              onClick={() => setPendingInvite(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold"
              onClick={() => pendingInvite && void acceptInvite(pendingInvite.friendship.id)}
            >
              Accept both ways
            </button>
          </>
        }
      >
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          If you accept, this friendship is bidirectional. You can see{" "}
          <span className="text-foreground font-medium">{pendingInvite?.from?.name}</span>
          ’s application history, and they can see yours.
        </p>
      </Modal>
    </ShellWidth>
  );
}
