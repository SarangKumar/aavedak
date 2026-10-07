import type { Metadata } from "next";
import Link from "next/link";

import { requireOnboarded } from "@/lib/app-access";
import { listResumes } from "@/lib/resumes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Avsar application summary and today’s focus.",
};

const stats = [
  { key: "bookmarked", label: "Bookmarked", value: 0 },
  { key: "applied", label: "Applied", value: 0 },
  { key: "interview", label: "Interview", value: 0 },
  { key: "offer", label: "Offer", value: 0 },
] as const;

const quickLinks = [
  { href: "/jobs", title: "Jobs", blurb: "Discover and shortlist roles" },
  { href: "/job-tracker", title: "Job tracker", blurb: "Pipeline by stage" },
  { href: "/documents", title: "Documents", blurb: "Resumes & cover letters" },
  { href: "/referrals", title: "Referrals", blurb: "Warm paths & asks" },
] as const;

export default async function DashboardPage() {
  const { user, profile } = await requireOnboarded();
  const resumes = listResumes(user.id);
  const active = resumes.find((r) => r.status === "active");

  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="avsar-fade-up relative mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="space-y-1">
            <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
              अवसर
            </p>
            <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">
              Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              Avsar recommends and prepares. You decide and send.
              {" · "}
              <Link href={`/${profile.username}`} className="text-primary hover:underline">
                /{profile.username}
              </Link>
            </p>
          </div>
          <p className="text-muted-foreground text-[11px]">
            Active resume:{" "}
            <span className="text-foreground font-medium">{active?.displayName ?? "None"}</span>
          </p>
        </header>

        <section aria-labelledby="summary-heading" className="space-y-2.5">
          <h2
            id="summary-heading"
            className="text-foreground text-[13px] font-semibold tracking-tight"
          >
            Application summary
          </h2>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.key}
                className="border-border/80 bg-card/70 ring-ring/5 rounded-2xl border p-3.5 shadow-sm ring-1 backdrop-blur-sm"
              >
                <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className="avsar-display text-foreground mt-1 text-2xl tabular-nums">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
          <div className="border-border/70 bg-card/50 text-muted-foreground rounded-xl border border-dashed px-4 py-5 text-[13px] leading-relaxed">
            No applications yet. Bookmark a role from{" "}
            <Link href="/jobs" className="text-primary hover:underline">
              Jobs
            </Link>{" "}
            or add one in{" "}
            <Link href="/job-tracker" className="text-primary hover:underline">
              Job tracker
            </Link>
            .
          </div>
        </section>

        <section aria-labelledby="quick-heading" className="space-y-2.5">
          <h2
            id="quick-heading"
            className="text-foreground text-[13px] font-semibold tracking-tight"
          >
            Workspace
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "avsar-card-lift border-border/80 bg-card/70 ring-ring/5 hover:border-primary/25 group rounded-2xl border p-4 shadow-sm ring-1 backdrop-blur-sm",
                )}
              >
                <p className="text-foreground text-[13px] font-semibold tracking-tight">
                  {link.title}
                </p>
                <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">
                  {link.blurb}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
