"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminNotificationsMenu } from "@/components/admin-notifications-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOutAndRedirect } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type HeaderUser = {
  name: string;
  email: string;
  image?: string | null;
  username: string;
  isAdmin?: boolean;
  pendingApprovals?: number;
};

function AdminStar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="m6 0.8 1.35 2.74 3.02.44-2.18 2.13.52 3.01L6 7.7 3.29 9.12l.52-3.01L1.63 3.98l3.02-.44L6 .8Z" />
    </svg>
  );
}

export function AuthHeaderActions({ user }: { user: HeaderUser | null }) {
  const router = useRouter();
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

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      await signOutAndRedirect("/sign-in");
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Sign out failed");
    }
  }

  const menuItems: Array<{ href: string; label: string; badge?: number }> = [
    { href: profileHref, label: "Profile" },
    { href: `${profileHref}/settings`, label: "Settings" },
    ...(user.isAdmin ? [{ href: "/admin", label: "Admin", badge: pendingCount }] : []),
    { href: "/people", label: "People" },
    { href: "/outreach", label: "Outreach" },
    { href: "/ats", label: "ATS" },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {user.isAdmin ? (
        <AdminNotificationsMenu pendingCount={pendingCount} onCountChange={setPendingCount} />
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger>
          <button
            type="button"
            aria-label="Account menu"
            className="focus-visible:ring-primary/50 relative flex size-8 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2"
          >
            <span className="relative inline-flex size-8">
              <Avatar className="size-8">
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
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-foreground truncate text-[13px] font-medium">{user.name}</span>
            <span className="text-muted-foreground truncate text-[11px] font-normal">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {menuItems.map((item) => (
              <DropdownMenuItem key={item.href} onClick={() => router.push(item.href)}>
                {item.label}
                {item.badge ? (
                  <span className="text-primary ml-1 text-[11px]">({item.badge})</span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {error ? (
            <p className="text-destructive px-2 py-1.5 text-[11px]" role="alert">
              {error}
            </p>
          ) : null}
          <DropdownMenuItem variant="destructive" disabled={pending} onClick={() => void signOut()}>
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
