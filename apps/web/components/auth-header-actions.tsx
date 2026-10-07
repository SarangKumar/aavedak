"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setPending(true);
    setOpen(false);
    try {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="bg-primary text-primary-foreground ring-primary/25 inline-flex min-h-10 items-center justify-center rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm ring-1 transition-opacity hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }

  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();
  const profileHref = `/${user.username}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "ring-border hover:ring-primary/40 focus-visible:ring-primary/50 flex size-10 items-center justify-center overflow-hidden rounded-full ring-1 transition focus-visible:outline-none focus-visible:ring-2",
          open && "ring-primary/50",
        )}
      >
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={40}
            height={40}
            className="size-10 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center text-sm font-medium">
            {initial}
          </span>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="border-border bg-popover text-popover-foreground absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border shadow-lg shadow-black/40"
        >
          <Link
            href={profileHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="hover:bg-accent hover:text-accent-foreground block px-3.5 py-2.5 text-sm font-medium transition-colors"
          >
            Profile
          </Link>
          <Link
            href={`${profileHref}/settings`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="hover:bg-accent hover:text-accent-foreground block px-3.5 py-2.5 text-sm transition-colors"
          >
            Settings
          </Link>
          <div className="border-border border-t" />
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={pending}
            className="hover:bg-accent hover:text-accent-foreground w-full px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
