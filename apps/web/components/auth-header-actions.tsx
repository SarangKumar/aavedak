"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { HeaderMenu } from "@/components/header-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type HeaderUser = {
  name: string;
  email: string;
  image?: string | null;
  username: string;
};

export function AuthHeaderActions({ user }: { user: HeaderUser | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="avsar-btn bg-primary text-primary-foreground ring-primary/25 inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-[12px] font-semibold shadow-sm ring-1 hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }

  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();
  const profileHref = `/${user.username}`;

  async function signOut(close: () => void) {
    setPending(true);
    close();
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <HeaderMenu
      label="Account menu"
      menuClassName="w-40"
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
          <div className="border-border border-t" />
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut(close)}
            disabled={pending}
            className="hover:text-foreground text-muted-foreground w-full px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </>
      )}
    </HeaderMenu>
  );
}
