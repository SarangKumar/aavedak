"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export type HeaderUser = {
  name: string;
  email: string;
  image?: string | null;
};

export function AuthHeaderActions({ user }: { user: HeaderUser | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
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
        className="bg-primary text-primary-foreground ring-primary/25 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 transition-opacity hover:opacity-90"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 sm:flex">
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={24}
            height={24}
            className="ring-border rounded-full ring-1"
            unoptimized
          />
        ) : (
          <span className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full text-[10px] font-medium uppercase">
            {(user.name || user.email || "?").slice(0, 1)}
          </span>
        )}
        <span className="text-muted-foreground max-w-[10rem] truncate text-xs" title={user.email}>
          {user.email}
        </span>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="border-border bg-card text-foreground hover:bg-accent rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
      >
        {pending ? "…" : "Sign out"}
      </button>
    </div>
  );
}
