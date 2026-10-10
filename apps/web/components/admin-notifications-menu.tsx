"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeFixed } from "@/lib/format-datetime";
import type { PendingUserRow } from "@/lib/user-approval-shared";

function NotificationsLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-0" aria-busy="true" aria-label="Loading notifications">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-border/60 space-y-1.5 border-b px-3 py-2.5 last:border-b-0">
          <Skeleton className="h-3.5 w-32 max-w-full" />
          <Skeleton className="h-3 w-44 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.75a3.5 3.5 0 0 0-3.5 3.5v1.2c0 .5-.16.98-.46 1.38L3.2 9.1A.75.75 0 0 0 3.8 10.3h8.4a.75.75 0 0 0 .6-1.2l-.84-1.27a2.25 2.25 0 0 1-.46-1.38V5.25A3.5 3.5 0 0 0 8 1.75Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M6.4 12.2a1.75 1.75 0 0 0 3.2 0"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

type PanelProps = {
  close: () => void;
  pendingCount: number;
  onCountChange?: (count: number) => void;
};

function NotificationsPanel({ close, pendingCount, onCountChange }: PanelProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pending-users");
      if (!res.ok) throw new Error("Could not load notifications.");
      const data = (await res.json()) as { pending?: PendingUserRow[]; count?: number };
      const pending = Array.isArray(data.pending) ? data.pending : [];
      setItems(pending);
      onCountChange?.(typeof data.count === "number" ? data.count : pending.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

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
      setItems((list) => {
        const next = list.filter((u) => u.userId !== userId);
        onCountChange?.(next.length);
        return next;
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update approval.");
    } finally {
      setActionKey(null);
    }
  }

  return (
    // The panel sets its own width; the dropdown keeps its default Vinyaas styling.
    <div className="w-[19rem] sm:w-[21rem]">
      <div className="border-border/70 flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-foreground text-[12px] font-semibold tracking-tight">Notifications</p>
        {pendingCount > 0 ? (
          <span className="text-primary font-mono text-[11px] tabular-nums">
            {pendingCount} pending
          </span>
        ) : null}
      </div>

      {loading ? (
        <NotificationsLoading rows={3} />
      ) : error ? (
        <p className="text-destructive px-3 py-4 text-center text-[12px]" role="alert">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground px-3 py-6 text-center text-[12px]">
          No pending registrations.
        </p>
      ) : (
        <ScrollArea className="max-h-80">
          <ul>
            {items.map((u) => {
              const busy = actionKey?.startsWith(`${u.userId}:`) ?? false;
              return (
                <li
                  key={u.userId}
                  className="border-border/60 space-y-2 border-b px-3 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[13px] font-medium">
                      {u.name || u.username}
                    </p>
                    <p className="text-muted-foreground truncate font-mono text-[11px]">
                      {u.email || "—"} · {formatDateTimeFixed(u.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 cursor-pointer px-2.5 text-[11px]"
                      disabled={busy}
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
                      className="h-7 cursor-pointer px-2.5 text-[11px]"
                      disabled={busy}
                      loading={actionKey === `${u.userId}:rejected`}
                      loadingText=""
                      onClick={() => void decide(u.userId, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}

      {actionError ? (
        <p
          className="text-destructive border-border/70 border-t px-3 py-2 text-[11px]"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="border-border/70 border-t">
        <Link
          href="/admin"
          role="menuitem"
          onClick={close}
          className="text-primary hover:bg-muted/40 block px-3 py-2.5 text-center text-[12px] font-medium transition-colors"
        >
          Open admin
        </Link>
      </div>
    </div>
  );
}

type Props = {
  pendingCount: number;
  onCountChange?: (count: number) => void;
};

export function AdminNotificationsMenu({ pendingCount, onCountChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger>
        <button
          type="button"
          aria-label={
            pendingCount > 0
              ? `${pendingCount} pending registration${pendingCount === 1 ? "" : "s"}`
              : "Admin notifications"
          }
          className="text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:ring-ring relative inline-flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2"
        >
          <span className="relative inline-flex size-8 items-center justify-center">
            <BellIcon className="size-4" />
            {pendingCount > 0 ? (
              <span className="bg-primary text-primary-foreground absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            ) : null}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <NotificationsPanel
          close={() => setOpen(false)}
          pendingCount={pendingCount}
          onCountChange={onCountChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
