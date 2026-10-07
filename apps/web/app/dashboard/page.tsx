import type { Metadata } from "next";
import Link from "next/link";

import { requireOnboarded } from "@/lib/app-access";
import { STATUS_LABELS } from "@/lib/application-status";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { SHELL_X } from "@/lib/layout";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Arambh application summary and today’s focus.",
};

const quickLinks = [
  { href: "/jobs", title: "Jobs", blurb: "Discover and shortlist roles" },
  { href: "/job-tracker", title: "Job tracker", blurb: "Pipeline by stage" },
  { href: "/documents", title: "Documents", blurb: "Resumes & cover letters" },
  { href: "/referrals", title: "Referrals", blurb: "Warm paths & asks" },
] as const;

function formatDue(dueDate: string | null): string {
  if (!dueDate) return "No due date";
  const d = dueDate.slice(0, 10);
  return d;
}

export default async function DashboardPage() {
  const { user, profile } = await requireOnboarded();
  const dash = getDashboardSnapshot(user.id);

  const metaStats = [
    { label: "Active apps", value: dash.activeApplicationCount, href: "/job-tracker" },
    { label: "Follow-ups", value: dash.pendingFollowUpCount, href: "/referrals" },
    { label: "Due ≤7d", value: dash.dueSoonFollowUpCount, href: "/referrals" },
    { label: "Resumes", value: dash.resumeCount, href: "/documents" },
    { label: "Jobs", value: dash.jobCount, href: "/jobs" },
  ] as const;

  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className={cn("avsar-fade-up relative mx-auto w-full space-y-8 py-8 sm:py-10", SHELL_X)}>
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="space-y-1">
            <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
              आरंभ
            </p>
            <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">
              Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              Arambh recommends and prepares. You decide and send.
              {" · "}
              <Link href={`/${profile.username}`} className="text-primary hover:underline">
                /{profile.username}
              </Link>
            </p>
          </div>
          <p className="text-muted-foreground text-[11px]">
            Active resume:{" "}
            <span className="text-foreground font-medium">{dash.activeResumeName ?? "None"}</span>
          </p>
        </header>

        <section aria-labelledby="pulse-heading" className="space-y-2.5">
          <h2
            id="pulse-heading"
            className="text-foreground text-[13px] font-semibold tracking-tight"
          >
            Pulse
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {metaStats.map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="border-border/80 bg-card/80 ring-ring/5 hover:border-primary/30 rounded-2xl border p-3 shadow-sm ring-1 backdrop-blur-sm transition-colors"
              >
                <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className="avsar-display text-foreground mt-0.5 text-xl tabular-nums">
                  {stat.value}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="summary-heading" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="summary-heading"
              className="text-foreground text-[13px] font-semibold tracking-tight"
            >
              Pipeline by status
            </h2>
            <Link
              href="/job-tracker"
              className="text-primary text-[12px] font-medium hover:underline"
            >
              Open tracker
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {dash.highlightCounts.map((stat) => (
              <div
                key={stat.status}
                className="border-border/80 bg-card/80 ring-ring/5 rounded-2xl border p-3 shadow-sm ring-1 backdrop-blur-sm"
              >
                <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className="avsar-display text-foreground mt-0.5 text-xl tabular-nums">
                  {stat.count}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section
            aria-labelledby="recent-apps-heading"
            className="border-border/80 bg-card/80 ring-ring/5 space-y-2.5 rounded-2xl border p-4 shadow-sm ring-1 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="recent-apps-heading"
                className="text-foreground text-[13px] font-semibold tracking-tight"
              >
                Recent applications
              </h2>
              <Link href="/job-tracker" className="text-primary text-[11px] hover:underline">
                View all
              </Link>
            </div>
            {dash.recentApplications.length === 0 ? (
              <p className="text-muted-foreground text-[12px] leading-relaxed">
                No applications yet. Add one in{" "}
                <Link href="/job-tracker" className="text-primary hover:underline">
                  Job tracker
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-border/60 divide-y">
                {dash.recentApplications.map((app) => (
                  <li key={app.id}>
                    <Link
                      href="/job-tracker"
                      className="hover:bg-muted/40 -mx-1 flex items-start justify-between gap-2 rounded-lg px-1 py-2.5 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-foreground truncate text-[13px] font-medium">
                          {app.companyName}
                        </p>
                        <p className="text-muted-foreground truncate text-[11px]">
                          {app.role}
                          {app.location ? ` · ${app.location}` : ""}
                        </p>
                      </div>
                      <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
                        {STATUS_LABELS[app.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="followups-heading"
            className="border-border/80 bg-card/80 ring-ring/5 space-y-2.5 rounded-2xl border p-4 shadow-sm ring-1 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="followups-heading"
                className="text-foreground text-[13px] font-semibold tracking-tight"
              >
                Upcoming follow-ups
              </h2>
              <Link href="/referrals" className="text-primary text-[11px] hover:underline">
                Referrals
              </Link>
            </div>
            {dash.upcomingFollowUps.length === 0 ? (
              <p className="text-muted-foreground text-[12px] leading-relaxed">
                No pending follow-ups. Track asks on{" "}
                <Link href="/referrals" className="text-primary hover:underline">
                  Referrals
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-border/60 divide-y">
                {dash.upcomingFollowUps.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-[13px] font-medium">
                        {task.title}
                      </p>
                      <p className="text-muted-foreground text-[11px]">{formatDue(task.dueDate)}</p>
                    </div>
                    <span className="bg-primary/15 text-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
                      pending
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

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
                  "avsar-card-lift border-border/80 bg-card/80 ring-ring/5 hover:border-primary/25 group rounded-2xl border p-4 shadow-sm ring-1 backdrop-blur-sm",
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
