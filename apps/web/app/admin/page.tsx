import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CollapsibleSection } from "@/components/collapsible-section";
import { PendingRegistrations } from "@/components/pending-registrations";
import { RecentResumesTable } from "@/components/recent-resumes-table";
import { AdminCareersPagesPanel } from "@/components/admin-careers-pages-panel";
import { AdminDiscoveryPanel } from "@/components/admin-discovery-panel";
import { AdminJobsPanel } from "@/components/admin-jobs-panel";
import { ShellWidth } from "@/components/shell-width";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminEmails, isAdminEmail } from "@/lib/admin";
import {
  getAdminOverviewCounts,
  listRecentResumesForAdmin,
  type AdminOverviewCounts,
} from "@/lib/admin-data";
import { requireOnboarded } from "@/lib/app-access";
import { listPendingApprovals } from "@/lib/user-approval";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Admin",
  description: "Aavedak admin tools (allowlisted emails only).",
};

const STAT_CARDS: Array<{ key: keyof AdminOverviewCounts; label: string }> = [
  { key: "profiles", label: "Profiles" },
  { key: "applications", label: "Applications" },
  { key: "resumes", label: "Resumes" },
  { key: "people", label: "People" },
  { key: "templates", label: "Templates" },
];

/** Each data-backed section fetches on its own and streams in behind a Suspense boundary,
 * so the page shell paints immediately and a slow query never blocks the rest. */
async function StatCards() {
  const counts = await getAdminOverviewCounts();
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {STAT_CARDS.map((card) => (
        <Card
          key={card.key}
          className="border-border/80 bg-card gap-0 rounded-xl border px-3 py-2.5 shadow-sm"
        >
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            {card.label}
          </p>
          <p className="text-foreground mt-0.5 font-mono text-xl tabular-nums tracking-tight">
            {counts[card.key]}
          </p>
        </Card>
      ))}
    </section>
  );
}

async function PendingSection() {
  const pendingUsers = await listPendingApprovals();
  return <PendingRegistrations initialPending={pendingUsers} />;
}

async function ResumesSection() {
  const resumes = await listRecentResumesForAdmin(50);
  return <RecentResumesTable resumes={resumes} />;
}

function StatCardsSkeleton() {
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {STAT_CARDS.map((card) => (
        <Card
          key={card.key}
          className="border-border/80 bg-card gap-0 rounded-xl border px-3 py-2.5 shadow-sm"
        >
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            {card.label}
          </p>
          <Skeleton className="mt-1 h-6 w-10" />
        </Card>
      ))}
    </section>
  );
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="border-border/80 bg-card gap-2.5 rounded-xl border p-3.5 shadow-sm">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-64" />
      <div className="space-y-2 pt-1">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </Card>
  );
}

export default async function AdminPage() {
  const { user } = await requireOnboarded();
  if (!isAdminEmail(user.email)) {
    redirect("/dashboard");
  }
  const allowlist = getAdminEmails();

  return (
    <ShellWidth className="aavedak-fade-up space-y-4 py-7 sm:py-9">
      <header className="space-y-0.5">
        <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          Admin · {user.email}
        </p>
        <h1 className="aavedak-display text-foreground text-xl tracking-tight sm:text-2xl">
          Ops overview
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[12px] leading-relaxed">
          Approve new registrations, review resumes, manage jobs, and see allowlisted admins.
        </p>
      </header>

      <Suspense fallback={<StatCardsSkeleton />}>
        <StatCards />
      </Suspense>

      <Suspense fallback={<CardSkeleton rows={2} />}>
        <PendingSection />
      </Suspense>

      <Suspense fallback={<CardSkeleton rows={5} />}>
        <ResumesSection />
      </Suspense>

      <AdminJobsPanel />

      <AdminDiscoveryPanel />

      <AdminCareersPagesPanel />

      <CollapsibleSection
        title="Person email suggest-corrections"
        summary="Queue for proposed email fixes on global/user contacts. Coming later — no items yet."
      >
        <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-3 py-10 text-center text-[12px]">
          Empty queue — nothing to review.
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="ADMIN_EMAILS allowlist"
        summary={`${allowlist.length} admin${allowlist.length === 1 ? "" : "s"}`}
      >
        <ul className="text-muted-foreground space-y-1 font-mono text-[11px]">
          {allowlist.map((email) => (
            <li key={email}>{email}</li>
          ))}
        </ul>
      </CollapsibleSection>
    </ShellWidth>
  );
}
