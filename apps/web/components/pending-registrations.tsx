"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeFixed } from "@/lib/format-datetime";
import type { PendingUserRow } from "@/lib/user-approval-shared";

export function PendingRegistrations({ initialPending }: { initialPending: PendingUserRow[] }) {
  const [pendingUsers, setPendingUsers] = useState(initialPending);
  /** `${userId}:approved` | `${userId}:rejected` — loader only on the clicked button. */
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function decide(userId: string, status: "approved" | "rejected") {
    const key = `${userId}:${status}`;
    setActionKey(key);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update approval.");
      setPendingUsers((list) => list.filter((u) => u.userId !== userId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update approval.");
    } finally {
      setActionKey(null);
    }
  }

  return (
    <Card className="border-border/80 bg-card gap-2.5 rounded-xl border p-3.5 shadow-sm">
      <CardHeader className="gap-0.5 p-0">
        <CardTitle className="text-foreground text-[13px] font-semibold tracking-tight">
          Pending registrations
          {pendingUsers.length > 0 ? (
            <span className="text-primary ml-1.5 font-mono text-[12px]">
              ({pendingUsers.length})
            </span>
          ) : null}
        </CardTitle>
        <CardDescription className="text-muted-foreground text-[11px]">
          New Google sign-ins wait here until you approve them for onboarding.
        </CardDescription>
      </CardHeader>
      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      {pendingUsers.length === 0 ? (
        <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-3 py-8 text-center text-[12px]">
          No pending access requests.
        </div>
      ) : (
        <ul className="divide-border/60 border-border/70 divide-y rounded-xl border">
          {pendingUsers.map((u) => (
            <li
              key={u.userId}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-foreground truncate text-[13px] font-medium">
                  {u.name || u.username}
                </p>
                <p className="text-muted-foreground truncate font-mono text-[11px]">
                  {u.email || "—"} · @{u.username} · {formatDateTimeFixed(u.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="cursor-pointer"
                  disabled={actionKey?.startsWith(`${u.userId}:`) ?? false}
                  loading={actionKey === `${u.userId}:approved`}
                  loadingText=""
                  onClick={() => void decide(u.userId, "approved")}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={actionKey?.startsWith(`${u.userId}:`) ?? false}
                  loading={actionKey === `${u.userId}:rejected`}
                  loadingText=""
                  onClick={() => void decide(u.userId, "rejected")}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
