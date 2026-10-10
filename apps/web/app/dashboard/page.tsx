import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireOnboarded } from "@/lib/app-access";
import { ApplicationsActivityCharts } from "@/components/applications-activity-charts";
import {
  DashboardFocusSkeleton,
  DashboardFunnelSkeleton,
  DashboardKpisSkeleton,
  DashboardListCardSkeleton,
  DashboardPipelineSkeleton,
  DashboardWorkspaceSkeleton,
} from "@/components/page-loading-skeleton";
import { ShellWidth } from "@/components/shell-width";
import { Skeleton } from "@/components/ui/skeleton";

import {
  ActiveResumeLine,
  FocusTiles,
  FollowUpsCard,
  FunnelCard,
  KpiTiles,
  PipelineCard,
  RecentApplicationsCard,
  StaleApplicationsCard,
  TopMatchesCard,
  WorkspaceTiles,
} from "./sections";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Dashboard",
  description: "Your Aavedak application summary and today’s focus.",
};

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

/**
 * Only the session check blocks the page. Every block below loads its own data inside its
 * own <Suspense> boundary, so fast blocks appear first and a slow query (e.g. discovery
 * matches) never holds up the rest.
 */
export default async function DashboardPage() {
  const { user, profile } = await requireOnboarded();
  const userId = user.id;

  return (
    <div className="relative overflow-hidden">
      <ShellWidth className="aavedak-fade-up relative space-y-8 py-8 sm:py-10">
        <header className="min-w-0 space-y-1">
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
          <Suspense fallback={<Skeleton className="h-4 w-48" />}>
            <ActiveResumeLine userId={userId} />
          </Suspense>
        </header>

        <DashboardGroup
          id="overview"
          title="Overview"
          description="Where your search stands right now."
        >
          <Suspense fallback={<DashboardKpisSkeleton />}>
            <KpiTiles userId={userId} />
          </Suspense>
          {/* Client component: fetches /api/dashboard/activity and shows its own loader. */}
          <ApplicationsActivityCharts />
        </DashboardGroup>

        <DashboardGroup
          id="attention"
          title="Needs attention"
          description="Housekeeping and follow-ups that keep your tracker accurate."
        >
          <Suspense fallback={<DashboardFocusSkeleton />}>
            <FocusTiles userId={userId} />
          </Suspense>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Suspense fallback={<DashboardListCardSkeleton />}>
              <StaleApplicationsCard userId={userId} />
            </Suspense>
            <Suspense fallback={<DashboardListCardSkeleton />}>
              <FollowUpsCard userId={userId} />
            </Suspense>
          </div>
        </DashboardGroup>

        <DashboardGroup
          id="jobs"
          title="Jobs and applications"
          description="New roles worth a look, and what you touched most recently."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Suspense fallback={<DashboardListCardSkeleton className="lg:col-span-2" withRing />}>
              <TopMatchesCard userId={userId} username={profile.username} />
            </Suspense>
            <Suspense fallback={<DashboardListCardSkeleton />}>
              <RecentApplicationsCard userId={userId} />
            </Suspense>
          </div>
        </DashboardGroup>

        <DashboardGroup
          id="pipeline"
          title="Pipeline health"
          description="How your applications are spread across statuses and how far they get."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Suspense fallback={<DashboardPipelineSkeleton />}>
              <PipelineCard userId={userId} />
            </Suspense>
            <Suspense fallback={<DashboardFunnelSkeleton />}>
              <FunnelCard userId={userId} />
            </Suspense>
          </div>
        </DashboardGroup>

        <DashboardGroup id="workspace" title="Workspace">
          <Suspense fallback={<DashboardWorkspaceSkeleton />}>
            <WorkspaceTiles userId={userId} />
          </Suspense>
        </DashboardGroup>
      </ShellWidth>
    </div>
  );
}
