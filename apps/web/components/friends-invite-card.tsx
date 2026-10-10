"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";

type FriendRow = {
  userId: string;
  username: string;
  name: string | null;
  friendshipId: string;
};

type InvitePayload = {
  friends: FriendRow[];
  invite: { url: string; token: string };
};

export function FriendsInviteCard() {
  const [loading, setLoading] = useState(true);
  // Which action is running ("rotate" or "unfriend:<id>"), so only the pressed button spins.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pending = pendingKey !== null;
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState<InvitePayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/friends");
      const json = (await res.json()) as InvitePayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not load friends.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load friends.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyInvite() {
    if (!data?.invite.url) return;
    try {
      await navigator.clipboard.writeText(data.invite.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the URL manually.");
    }
  }

  async function rotate() {
    setPendingKey("rotate");
    setError(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const json = (await res.json()) as {
        invite?: { url: string; token: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Could not rotate invite.");
      setData((prev) => (prev && json.invite ? { ...prev, invite: json.invite } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rotate invite.");
    } finally {
      setPendingKey(null);
    }
  }

  async function unfriend(friendshipId: string) {
    setPendingKey(`unfriend:${friendshipId}`);
    setError(null);
    try {
      const res = await fetch("/api/friends", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not remove friend.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove friend.");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-lg border p-4 shadow-sm">
      <div>
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Friends</h2>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Copy an invite URL and share it. When they confirm, you both see each other&apos;s
          applications/day on the dashboard.
        </p>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-[12px]">
          <Spinner label="" /> Loading…
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              readOnly
              value={data?.invite.url ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 font-mono text-[11px]"
            />
            <div className="flex shrink-0 gap-1.5">
              <Button type="button" size="sm" onClick={() => void copyInvite()}>
                {copied ? "Copied" : "Copy URL"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={pendingKey === "rotate"}
                disabled={pending}
                onClick={() => void rotate()}
              >
                New link
              </Button>
            </div>
          </div>

          {data?.friends && data.friends.length > 0 ? (
            <ul className="divide-border/60 border-border/70 divide-y rounded-lg border">
              {data.friends.map((f) => (
                <li
                  key={f.friendshipId}
                  className="flex items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[13px] font-medium">
                      {f.name?.trim() || f.username}
                    </p>
                    <p className="text-muted-foreground text-[11px]">@{f.username}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={pendingKey === `unfriend:${f.friendshipId}`}
                    loadingText="Removing…"
                    disabled={pending}
                    onClick={() => void unfriend(f.friendshipId)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-[12px]">
              No friends yet — share your invite URL.
            </p>
          )}
        </>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </Card>
  );
}
