import type { Metadata } from "next";
import Link from "next/link";

import { requirePendingApprovalSession } from "@/lib/app-access";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Waiting for approval",
  description: "An admin must approve your Aavedak access before onboarding.",
};

export default async function PendingApprovalPage() {
  const { user, profile } = await requirePendingApprovalSession();

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="aavedak-fade-up relative mx-auto flex w-full max-w-md flex-col items-center px-4 py-16 sm:px-6">
        <p className="text-primary/90 mb-1.5 font-mono text-[13px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-xl sm:text-2xl">
          Waiting for approval
        </h1>
        <p className="text-muted-foreground mt-3 max-w-sm text-center text-[13px] leading-relaxed">
          Thanks{user.name ? `, ${user.name.split(" ")[0]}` : ""}. Your sign-in worked — an admin
          needs to approve{" "}
          <span className="text-foreground font-medium">{profile.email ?? user.email}</span> before
          you can start onboarding and use Aavedak.
        </p>
        <p className="text-muted-foreground mt-2 max-w-sm text-center text-[12px] leading-relaxed">
          Refresh this page after you hear back. Admins see a notification when someone new joins.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/pending-approval"
            className="aavedak-btn bg-primary text-primary-foreground inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-semibold"
          >
            Check again
          </Link>
          <Link
            href="/"
            className="border-border text-foreground inline-flex h-9 items-center rounded-lg border px-3.5 text-[13px]"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
