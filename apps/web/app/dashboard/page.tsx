import type { Metadata } from "next";
import Link from "next/link";

import { requireOnboarded } from "@/lib/app-access";
import { STATUS_LABELS } from "@/lib/application-status";
import {
  getDashboardSnapshot,
  STALE_AFTER_DAYS,
  type DashboardFunnel,
  type DashboardMatch,
} from "@/lib/dashboard";
import type { FollowUpRecord } from "@/lib/follow-ups";
import { ApplicationsActivityCharts } from "@/components/applications-activity-charts";
import { PipelineStatusChart } from "@/components/pipeline-status-chart";
import { ShellWidth } from "@/components/shell-width";
import { cn } from "@/lib/utils";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScoreRing } from "@/components/ui/score-ring";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Dashboard",
  description: "Your Aavedak application summary and today’s focus.",
};

/** Whole-number percentage, or null when there is no denominator yet. */
function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function weekDeltaLabel(thisWeek: number, lastWeek: number): string {
  const diff = thisWeek - lastWeek;
  if (diff === 0) return "same as last week";
  return `${diff > 0 ? "↑" : "↓"} ${Math.abs(diff)} vs last week`;
}

type DueState = { label: string; variant: BadgeVariant };

function followUpDueState(task: FollowUpRecord, today: string, soon: string): DueState {
  const due = task.dueDate?.slice(0, 10);
  if (!due) return { label: "No date", variant: "secondary" };
  if (due < today) return { label: "Overdue", variant: "destructive" };
  if (due === today) return { label: "Today", variant: "engineNative" };
  if (due <= soon) return { label: "This week", variant: "engineNative" };
  return { label: "Later", variant: "secondary" };
}

const FUNNEL_STAGES: Array<{ key: keyof DashboardFunnel; label: string; hint: string }> = [
  { key: "applied", label: "Applied", hint: "Submitted at any point" },
  { key: "screening", label: "Screening", hint: "Under review, assessment or beyond" },
  { key: "interview", label: "Interview", hint: "Reached an interview" },
  { key: "offer", label: "Offer", hint: "Received an offer" },
];

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function agoLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/** "Posted 3d ago", or "Seen 3d ago" when the source gave no posting date. */
function matchAgeLabel(match: DashboardMatch): string | null {
  if (match.postedAt && !match.postedAtEstimated)
    return `Posted ${agoLabel(daysAgo(match.postedAt))}`;
  const seen = match.firstSeenAt ?? match.postedAt;
  return seen ? `Seen ${agoLabel(daysAgo(seen))}` : null;
}

/** A titled band of related dashboard blocks, so the page reads top to bottom by purpose. */
function DashboardGroup({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4">
      <div className="space-y-0.5">
        <h2
          id={`${id}-heading`}
          className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground/80 text-[12px] leading-relaxed">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant: "link", size: "xs" }), "text-[11px]")}
    >
      {children}
    </Link>
  );
}

export default async function DashboardPage() {
  const { user, profile } = await requireOnboarded();
  const dash = await getDashboardSnapshot(user.id);
  const { funnel } = dash;

  const todayIso = new Date().toISOString().slice(0, 10);
  const soonDate = new Date();
  soonDate.setUTCDate(soonDate.getUTCDate() + 7);
  const soonIso = soonDate.toISOString().slice(0, 10);

  const responseRate = pct(funnel.heardBack, funnel.applied);
  const interviewRate = pct(funnel.interview, funnel.applied);

  const kpis = [
    {
      label: "Active applications",
      value: String(dash.activeApplicationCount),
      detail: `${dash.addedThisWeek} this week · ${weekDeltaLabel(dash.addedThisWeek, dash.addedLastWeek)}`,
      href: "/job-tracker",
    },
    {
      label: "Response rate",
      value: formatPct(responseRate),
      detail:
        funnel.applied > 0
          ? `${funnel.heardBack} of ${funnel.applied} applied heard back`
          : "Apply to a role to start tracking",
      href: "/job-tracker",
    },
    {
      label: "Interviews",
      value: String(funnel.interview),
      detail: `${formatPct(interviewRate)} of applied · ${funnel.offer} offer${funnel.offer === 1 ? "" : "s"}`,
      href: "/job-tracker",
    },
    {
      label: "Pending follow-ups",
      value: String(dash.pendingFollowUpCount),
      detail:
        dash.overdueFollowUpCount > 0
          ? `${dash.overdueFollowUpCount} overdue`
          : `${dash.dueSoonFollowUpCount} due in the next 7 days`,
      tone: dash.overdueFollowUpCount > 0 ? ("warn" as const) : undefined,
      href: "/outreach",
    },
  ];

  const workspace = [
    { label: "Saved jobs", value: dash.jobCount, href: "/jobs" },
    { label: "Resumes", value: dash.resumeCount, href: "/documents" },
    { label: "Cover letters", value: dash.coverLetterCount, href: "/documents" },
    { label: "People", value: dash.peopleCount, href: "/people" },
    { label: "Archived", value: dash.archivedApplicationCount, href: "/job-tracker" },
  ];

  return (
    <div className="relative overflow-hidden">
      <ShellWidth className="aavedak-fade-up relative space-y-8 py-8 sm:py-10">
        <header>
          <div className="min-w-0 space-y-1">
            <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
              आवेदक
            </p>
            <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">
              Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              Aavedak recommends and prepares. You decide and send.
              {" · "}
              <Link href={`/${profile.username}`} className="text-primary hover:underline">
                /{profile.username}
              </Link>
            </p>
            <p className="text-muted-foreground truncate text-[12px]">
              Active resume:{" "}
              <Link href="/documents" className="text-foreground font-medium hover:underline">
                {dash.activeResumeName ?? "None — upload one"}
              </Link>
            </p>
          </div>
        </header>

        <DashboardGroup
          id="overview"
          title="Overview"
          description="Where your search stands right now."
        >
          <section aria-label="Key stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Link
                key={kpi.label}
                href={kpi.href}
                className="focus-visible:ring-ring group rounded-md focus-visible:outline-none focus-visible:ring-2"
              >
                <Card
                  size="sm"
                  className={cn(
                    "h-full gap-1 transition-colors sm:p-4",
                    kpi.tone === "warn"
                      ? "border-destructive/40 group-hover:border-destructive/60"
                      : "group-hover:border-primary/40",
                  )}
                >
                  <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                    {kpi.label}
                  </p>
                  <p className="aavedak-display text-foreground text-2xl tabular-nums sm:text-3xl">
                    {kpi.value}
                  </p>
                  <p
                    className={cn(
                      "text-[11px] leading-snug",
                      kpi.tone === "warn" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {kpi.detail}
                  </p>
                </Card>
              </Link>
            ))}
          </section>
          <ApplicationsActivityCharts />
        </DashboardGroup>

        <DashboardGroup
          id="attention"
          title="Needs attention"
          description="Housekeeping and follow-ups that keep your tracker accurate."
        >
          {dash.focusItems.length > 0 ? (
            <div
              aria-label="Today’s focus"
              role="list"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
            >
              {dash.focusItems.map((item) => (
                <Link
                  role="listitem"
                  key={item.id}
                  href={item.href}
                  className="focus-visible:ring-ring group rounded-md focus-visible:outline-none focus-visible:ring-2"
                >
                  <Card
                    size="sm"
                    className={cn(
                      "h-full gap-1 border-l-2 transition-colors",
                      item.tone === "warn" &&
                        "border-l-destructive group-hover:border-destructive/50",
                      item.tone === "primary" && "border-l-primary group-hover:border-primary/40",
                      item.tone === "muted" && "group-hover:border-primary/30",
                    )}
                  >
                    <p className="text-foreground text-[13px] font-semibold tracking-tight">
                      {item.title}
                    </p>
                    <p className="text-muted-foreground text-[12px] leading-relaxed">
                      {item.blurb}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card role="region" aria-labelledby="stale-heading" className="gap-2">
              <CardHeader>
                <CardTitle id="stale-heading" className="text-[13px] tracking-tight">
                  Needs a status update
                </CardTitle>
                <CardDescription className="text-[11px] leading-relaxed">
                  {dash.staleApplicationCount === 0
                    ? "Your tracker is up to date."
                    : `${dash.staleApplicationCount} application${dash.staleApplicationCount === 1 ? "" : "s"} unchanged for ${STALE_AFTER_DAYS}+ days. Update the status, or mark Ghosted or Rejected to keep your stats honest.`}
                </CardDescription>
                <CardAction>
                  <SectionLink href="/job-tracker">Open tracker</SectionLink>
                </CardAction>
              </CardHeader>
              {dash.staleApplications.length === 0 ? (
                <p className="text-muted-foreground text-[12px] leading-relaxed">
                  Nothing in Applied, Under review, Assessment or Interview has gone{" "}
                  {STALE_AFTER_DAYS} days without a change.
                </p>
              ) : (
                <ul className="divide-border/60 divide-y">
                  {dash.staleApplications.map((app) => (
                    <li key={app.id}>
                      <Link
                        href="/job-tracker"
                        className="hover:bg-muted/40 -mx-1 flex items-center justify-between gap-2 rounded-md px-1 py-2.5 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-[13px] font-medium">
                            {app.companyName}
                          </p>
                          <p className="text-muted-foreground truncate text-[11px]">
                            {app.role} · {STATUS_LABELS[app.status]}
                          </p>
                        </div>
                        <Badge
                          variant={
                            app.daysIdle >= STALE_AFTER_DAYS * 2 ? "destructive" : "secondary"
                          }
                          className="shrink-0 text-[10px] tabular-nums"
                        >
                          {app.daysIdle}d idle
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card role="region" aria-labelledby="followups-heading" className="gap-2">
              <CardHeader>
                <CardTitle id="followups-heading" className="text-[13px] tracking-tight">
                  Upcoming follow-ups
                </CardTitle>
                <CardAction>
                  <SectionLink href="/outreach">View all</SectionLink>
                </CardAction>
              </CardHeader>
              {dash.upcomingFollowUps.length === 0 ? (
                <p className="text-muted-foreground text-[12px] leading-relaxed">
                  No pending follow-ups. Track asks on{" "}
                  <Link href="/outreach" className="text-primary hover:underline">
                    Outreach
                  </Link>{" "}
                  or compose on{" "}
                  <Link href="/referrals" className="text-primary hover:underline">
                    Referrals
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-border/60 divide-y">
                  {dash.upcomingFollowUps.map((task) => {
                    const due = followUpDueState(task, todayIso, soonIso);
                    return (
                      <li key={task.id} className="flex items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-[13px] font-medium">
                            {task.title}
                          </p>
                          <p className="text-muted-foreground text-[11px] tabular-nums">
                            {task.dueDate ? task.dueDate.slice(0, 10) : "No due date"}
                          </p>
                        </div>
                        <Badge variant={due.variant} className="shrink-0 text-[10px]">
                          {due.label}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </DashboardGroup>

        <DashboardGroup
          id="jobs"
          title="Jobs and applications"
          description="New roles worth a look, and what you touched most recently."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card role="region" aria-labelledby="matches-heading" className="gap-2 lg:col-span-2">
              <CardHeader>
                <CardTitle id="matches-heading" className="text-[13px] tracking-tight">
                  Top new matches
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {dash.newMatchesThisWeek} new recommendation
                  {dash.newMatchesThisWeek === 1 ? "" : "s"} in the last 7 days · best match first
                </CardDescription>
                <CardAction>
                  <SectionLink href="/jobs">Open Jobs</SectionLink>
                </CardAction>
              </CardHeader>
              {dash.topMatches.length === 0 ? (
                <p className="text-muted-foreground text-[12px] leading-relaxed">
                  No open recommendations right now. New matches arrive after each daily scan — turn
                  on discovery in{" "}
                  <Link href={`/${profile.username}`} className="text-primary hover:underline">
                    your profile
                  </Link>{" "}
                  if you haven&apos;t, or browse{" "}
                  <Link href="/jobs" className="text-primary hover:underline">
                    Jobs
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-border/60 divide-y">
                  {dash.topMatches.map((match) => {
                    const age = matchAgeLabel(match);
                    return (
                      <li key={match.id} className="flex items-center gap-3 py-2.5">
                        <ScoreRing value={match.score} size="xs" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/jobs?job=${encodeURIComponent(match.id)}`}
                            className="text-foreground block truncate text-[13px] font-medium hover:underline"
                          >
                            {match.title}
                          </Link>
                          <p className="text-muted-foreground truncate text-[11px]">
                            {match.company}
                            {match.location ? ` · ${match.location}` : ""}
                            {age ? ` · ${age}` : ""}
                          </p>
                          {match.matchedSkills.length > 0 ? (
                            <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
                              {match.matchedSkills.map((skill) => (
                                <Badge key={skill} variant="secondary" className="text-[10px]">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {match.url ? (
                          <a
                            href={match.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              buttonVariants({ variant: "outline", size: "xs" }),
                              "shrink-0 text-[11px]",
                            )}
                            aria-label={`Original posting for ${match.title} at ${match.company} (opens in a new tab)`}
                          >
                            Posting ↗
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card role="region" aria-labelledby="recent-apps-heading" className="gap-2">
              <CardHeader>
                <CardTitle id="recent-apps-heading" className="text-[13px] tracking-tight">
                  Recent applications
                </CardTitle>
                <CardAction>
                  <SectionLink href="/job-tracker">View all</SectionLink>
                </CardAction>
              </CardHeader>
              {dash.recentApplications.length === 0 ? (
                <p className="text-muted-foreground text-[12px] leading-relaxed">
                  No applications yet. Add one in{" "}
                  <Link href="/job-tracker" className="text-primary hover:underline">
                    Job tracker
                  </Link>{" "}
                  or bookmark from{" "}
                  <Link href="/jobs" className="text-primary hover:underline">
                    Jobs
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-border/60 divide-y">
                  {dash.recentApplications.map((app) => (
                    <li key={app.id}>
                      <Link
                        href="/job-tracker"
                        className="hover:bg-muted/40 -mx-1 flex items-center justify-between gap-2 rounded-md px-1 py-2.5 transition-colors"
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
                        <Badge
                          variant={app.status === "offer" ? "engineNative" : "secondary"}
                          className="shrink-0 text-[10px]"
                        >
                          {STATUS_LABELS[app.status]}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </DashboardGroup>

        <DashboardGroup
          id="pipeline"
          title="Pipeline health"
          description="How your applications are spread across statuses and how far they get."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card role="region" aria-labelledby="pipeline-heading" className="gap-3">
              <CardHeader>
                <CardTitle id="pipeline-heading" className="text-[13px] tracking-tight">
                  Pipeline by status
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {dash.activeApplicationCount} active · archived excluded
                </CardDescription>
                <CardAction>
                  <SectionLink href="/job-tracker">Open tracker</SectionLink>
                </CardAction>
              </CardHeader>
              <PipelineStatusChart data={dash.statusCounts} />
            </Card>
            <Card role="region" aria-labelledby="funnel-heading" className="gap-4">
              <CardHeader>
                <CardTitle id="funnel-heading" className="text-[13px] tracking-tight">
                  Conversion funnel
                </CardTitle>
                <CardDescription className="text-[11px] leading-relaxed">
                  Furthest stage each application reached, including past status changes.
                </CardDescription>
              </CardHeader>
              <CardContent className="gap-4">
                {funnel.applied === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-[12px]">
                    Move an application to Applied to see your funnel.
                  </p>
                ) : (
                  <ol className="space-y-3.5">
                    {FUNNEL_STAGES.map((stage) => {
                      const count = funnel[stage.key];
                      const share = pct(count, funnel.applied) ?? 0;
                      return (
                        <li key={stage.key} className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2 text-[12px]">
                            <span className="text-foreground font-medium" title={stage.hint}>
                              {stage.label}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              <span className="text-foreground font-semibold">{count}</span>
                              {stage.key === "applied" ? "" : ` · ${share}%`}
                            </span>
                          </div>
                          <Progress
                            value={share}
                            aria-label={`${stage.label}: ${count} of ${funnel.applied} applied`}
                          />
                        </li>
                      );
                    })}
                  </ol>
                )}
                <dl className="border-border/60 mt-auto grid grid-cols-2 gap-2 border-t pt-3 text-[11px]">
                  <div>
                    <dt className="text-muted-foreground">Response rate</dt>
                    <dd className="text-foreground text-[15px] font-semibold tabular-nums">
                      {formatPct(responseRate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Offer rate</dt>
                    <dd className="text-foreground text-[15px] font-semibold tabular-nums">
                      {formatPct(pct(funnel.offer, funnel.applied))}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </DashboardGroup>

        <DashboardGroup id="workspace" title="Workspace">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {workspace.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="focus-visible:ring-ring group rounded-md focus-visible:outline-none focus-visible:ring-2"
              >
                <Card
                  size="sm"
                  className="group-hover:border-primary/40 h-full flex-row items-center justify-between transition-colors"
                >
                  <span className="text-muted-foreground text-[12px]">{item.label}</span>
                  <span className="text-foreground text-[15px] font-semibold tabular-nums">
                    {item.value}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </DashboardGroup>
      </ShellWidth>
    </div>
  );
}
