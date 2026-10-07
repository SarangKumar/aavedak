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
        className="avsar-btn bg-primary text-primary-foreground ring-primary/25 inline-flex h-8 items-center justify-center rounded-lg px-2.5 text-[12px] font-semibold shadow-sm ring-1 hover:opacity-90"
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
          "ring-border hover:ring-primary/40 focus-visible:ring-primary/50 flex size-8 items-center justify-center overflow-hidden rounded-full ring-1 transition focus-visible:outline-none focus-visible:ring-2",
          open && "ring-primary/50",
        )}
      >
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center text-xs font-medium">
            {initial}
          </span>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="border-border bg-popover text-popover-foreground absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border shadow-lg shadow-black/30"
        >
          <Link
            href={profileHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="hover:text-foreground text-muted-foreground block px-3 py-2 text-[13px] font-medium transition-colors"
          >
            Profile
          </Link>
          <Link
            href={`${profileHref}/settings`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="hover:text-foreground text-muted-foreground block px-3 py-2 text-[13px] transition-colors"
          >
            Settings
          </Link>
          <div className="border-border border-t" />
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={pending}
            className="hover:text-foreground text-muted-foreground w-full px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
