"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { HeaderMenu } from "@/components/header-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOutAndRedirect } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type HeaderUser = {
  name: string;
  email: string;
  image?: string | null;
  username: string;
  isAdmin?: boolean;
  pendingApprovals?: number;
};

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

function AdminStar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="m6 0.8 1.35 2.74 3.02.44-2.18 2.13.52 3.01L6 7.7 3.29 9.12l.52-3.01L1.63 3.98l3.02-.44L6 .8Z" />
    </svg>
  );
}

export function AuthHeaderActions({ user }: { user: HeaderUser | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(user?.pendingApprovals ?? 0);

  const refreshPending = useCallback(async () => {
    if (!user?.isAdmin) return;
    try {
      const res = await fetch("/api/admin/pending-users");
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      setPendingCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      /* ignore */
    }
  }, [user?.isAdmin]);

  useEffect(() => {
    setPendingCount(user?.pendingApprovals ?? 0);
  }, [user?.pendingApprovals]);

  useEffect(() => {
    if (!user?.isAdmin) return;
    void refreshPending();
    const id = window.setInterval(() => void refreshPending(), 60_000);
    return () => window.clearInterval(id);
  }, [user?.isAdmin, refreshPending]);

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="aavedak-btn bg-primary text-primary-foreground ring-primary/25 inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-[12px] font-semibold shadow-sm ring-1 hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }

  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();
  const profileHref = `/${user.username}`;

  async function signOut(close: () => void) {
    setPending(true);
    setError(null);
    close();
    try {
      await signOutAndRedirect("/sign-in");
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Sign out failed");
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {user.isAdmin ? (
        <Link
          href="/admin"
          title={
            pendingCount > 0
              ? `${pendingCount} pending registration${pendingCount === 1 ? "" : "s"}`
              : "Admin notifications"
          }
          aria-label={
            pendingCount > 0 ? `${pendingCount} pending registrations` : "Admin notifications"
          }
          className={cn(
            "relative inline-flex size-8 cursor-pointer items-center justify-center rounded-full",
            "text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
          )}
        >
          <BellIcon className="size-4" />
          {pendingCount > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          ) : null}
        </Link>
      ) : null}

      <HeaderMenu
        label="Account menu"
        menuClassName="w-44"
        triggerClassName={(open) =>
          cn(
            "relative flex size-8 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            open && "ring-primary/50 ring-2",
          )
        }
        trigger={
          <span className="relative inline-flex size-8">
            <Avatar className="border-border size-8 border">
              {user.image ? (
                <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />
              ) : null}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            {user.isAdmin ? (
              <span
                className="bg-primary text-primary-foreground ring-background absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full ring-2"
                title="Admin"
                aria-label="Admin"
              >
                <AdminStar className="size-2.5" />
              </span>
            ) : null}
          </span>
        }
      >
        {({ close }) => (
          <>
            <Link
              href={profileHref}
              role="menuitem"
              onClick={close}
              className="hover:text-foreground text-muted-foreground block px-3 py-2 text-[13px] font-medium transition-colors"
            >
              Profile
            </Link>
            <Link
              href={`${profileHref}/settings`}
              role="menuitem"
              onClick={close}
              className="hover:text-foreground text-muted-foreground block px-3 py-2 text-[13px] transition-colors"
            >
              Settings
            </Link>
            {user.isAdmin ? (
              <Link
                href="/admin"
                role="menuitem"
                onClick={close}
                className="hover:text-foreground text-muted-foreground block px-3 py-2 text-[13px] transition-colors"
              >
                Admin
                {pendingCount > 0 ? (
                  <span className="text-primary ml-1 text-[11px]">({pendingCount})</span>
                ) : null}
              </Link>
            ) : null}
            <Link
              href="/people"
              role="menuitem"
              onClick={close}
              className="hover:text-foreground text-muted-foreground block px-3 py-2 text-[13px] transition-colors"
            >
              People
            </Link>
            <Link
              href="/outreach"
              role="menuitem"
              onClick={close}
              className="hover:text-foreground text-muted-foreground block px-3 py-2 text-[13px] transition-colors"
            >
              Outreach
            </Link>
            <Link
              href="/ats"
              role="menuitem"
              onClick={close}
              className="hover:text-foreground text-muted-foreground block px-3 py-2 text-[13px] transition-colors"
            >
              ATS
            </Link>
            <div className="border-border border-t" />
            {error ? (
              <p className="text-destructive px-3 py-1.5 text-[11px]" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut(close)}
              disabled={pending}
              className="hover:text-foreground text-muted-foreground w-full cursor-pointer px-3 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </>
        )}
      </HeaderMenu>
    </div>
  );
}
