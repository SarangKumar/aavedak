"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { HeaderMenu } from "@/components/header-menu";
import { signOutAndRedirect } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type HeaderUser = {
  name: string;
  email: string;
  image?: string | null;
  username: string;
};

export function AuthHeaderActions({ user }: { user: HeaderUser | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <HeaderMenu
      label="Account menu"
      menuClassName="w-44"
      triggerClassName={(open) =>
        cn(
          "ring-border hover:ring-primary/40 focus-visible:ring-primary/50 flex size-8 items-center justify-center overflow-hidden rounded-full ring-1 transition focus-visible:outline-none focus-visible:ring-2",
          open && "ring-primary/50",
        )
      }
      trigger={
        user.image ? (
          <Image
            src={user.image}
            alt=""
            width={32}
            height={32}
            className="pointer-events-none size-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="bg-muted text-muted-foreground pointer-events-none flex size-8 items-center justify-center text-xs font-medium">
            {initial}
          </span>
        )
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
  );
}
