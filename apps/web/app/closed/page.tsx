import Link from "next/link";
import type { Metadata } from "next";

import { MAX_APP_USERS, USER_CAP_MESSAGE } from "@/lib/user-cap";

export const metadata: Metadata = {
  title: "Closed to new accounts",
  description: USER_CAP_MESSAGE,
};

type Props = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function ClosedPage({ searchParams }: Props) {
  const params = await searchParams;
  const reason = params.reason?.trim() || USER_CAP_MESSAGE;

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="aavedak-fade-up relative mx-auto flex w-full max-w-md flex-col items-center px-4 py-16 sm:px-6">
        <p className="text-primary/90 mb-1.5 font-mono text-[13px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-xl sm:text-2xl">Closed for now</h1>
        <p className="text-muted-foreground mt-3 max-w-sm text-center text-[13px] leading-relaxed">
          {reason}
        </p>
        <p className="text-muted-foreground mt-2 max-w-sm text-center text-[12px] leading-relaxed">
          Aavedak currently allows only the first {MAX_APP_USERS} Google accounts. If you already
          have an account, sign in with that same Google profile.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/sign-in"
            className="aavedak-btn bg-primary text-primary-foreground inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-semibold"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="aavedak-btn border-border bg-card text-foreground inline-flex h-9 items-center rounded-lg border px-3.5 text-[13px] font-medium"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
