import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminEmails, isAdminEmail } from "@/lib/admin";
import { requireOnboarded } from "@/lib/app-access";
import { SHELL_X } from "@/lib/layout";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin",
  description: "Arambh admin tools (allowlisted emails only).",
};

export default async function AdminPage() {
  const { user } = await requireOnboarded();
  if (!isAdminEmail(user.email)) {
    redirect("/dashboard");
  }

  const allowlist = getAdminEmails();

  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className={cn("avsar-fade-up relative mx-auto w-full space-y-6 py-8 sm:py-10", SHELL_X)}>
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आरंभ
        </p>
        <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Admin</h1>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Signed in as <span className="text-foreground font-medium">{user.email}</span>. Global
          catalog and ops tools will land here.
        </p>
        <div className="border-border/80 bg-card/80 rounded-2xl border p-4 shadow-sm">
          <p className="text-foreground text-[12px] font-semibold tracking-tight">
            ADMIN_EMAILS allowlist
          </p>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-[12px]">
            {allowlist.map((email) => (
              <li key={email} className="font-mono text-[11px]">
                {email}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground text-[12px]">
          <Link href="/referrals" className="text-primary hover:underline">
            Referrals composer
          </Link>
          {" · "}
          <Link href="/dashboard" className="text-primary hover:underline">
            Dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
