import { ShellWidth } from "@/components/shell-width";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Variant =
  | "dashboard"
  | "documents"
  | "job-tracker"
  | "people"
  | "jobs"
  | "follow-ups"
  | "referrals"
  | "onboarding"
  | "profile"
  | "admin"
  | "ats"
  | "fallback"
  /** @deprecated use a specific variant */
  | "default"
  | "form"
  | "board";

function PageHeaderSkeleton({
  titleWidth = "w-40",
  blurbWidth = "w-72",
  withToolbar = false,
}: {
  titleWidth?: string;
  blurbWidth?: string;
  withToolbar?: boolean;
}) {
  return (
    <header
      className={
        withToolbar
          ? "flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
          : "space-y-1"
      }
    >
      <div className="space-y-1">
        <Skeleton className="h-3 w-14" />
        <Skeleton className={`h-8 sm:h-9 ${titleWidth}`} />
        <Skeleton className={`h-4 max-w-full ${blurbWidth}`} />
      </div>
      {withToolbar ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-8 w-16 rounded-[10px]" />
          <Skeleton className="h-8 w-8 rounded-[10px]" />
          <Skeleton className="h-8 w-32 rounded-[10px]" />
        </div>
      ) : null}
    </header>
  );
}

function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <div className="border-border/80 bg-card overflow-hidden rounded-lg border shadow-sm">
      <div className="border-border/60 flex gap-3 border-b px-3 py-2.5">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className={`h-3 ${i === columns - 1 ? "ml-auto w-14" : "w-16"}`} />
        ))}
      </div>
      <div className="divide-border/60 divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-3 px-3 py-3">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className={`h-3.5 ${
                  c === 0
                    ? "w-28"
                    : c === columns - 1
                      ? "ml-auto h-7 w-20 rounded-md"
                      : "w-20 max-w-[8rem] flex-1"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="relative overflow-hidden">
      <ShellWidth className="relative space-y-7 py-8 sm:py-10">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="space-y-1">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-8 w-56 sm:h-9" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-3 w-36" />
        </header>

        <section className="space-y-2.5">
          <Skeleton className="h-4 w-28" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="border-border/80 bg-card space-y-2 rounded-lg border p-3.5 shadow-sm"
              >
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        </section>

        {/* Matches ApplicationsActivityCharts: chart card + range chips outside, bottom-right */}
        <section className="space-y-3">
          <div className="space-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <div className="space-y-2">
            <div className="border-border/80 bg-card rounded-lg border p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap gap-2">
                <Skeleton className="h-3 w-16 rounded-full" />
                <Skeleton className="h-3 w-20 rounded-full" />
              </div>
              <Skeleton className="h-[280px] w-full rounded-md" />
            </div>
            <div className="flex justify-end">
              <div className="border-border/70 bg-card flex gap-1 rounded-lg border p-1">
                <Skeleton className="h-7 w-16 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2.5">
          <Skeleton className="h-4 w-14" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="border-border/80 bg-card space-y-1.5 rounded-lg border p-3 shadow-sm"
              >
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="h-6 w-8" />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="border-border/80 bg-card space-y-1.5 rounded-lg border p-3 shadow-sm"
              >
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-6 w-8" />
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((col) => (
            <section
              key={col}
              className="border-border/80 bg-card space-y-2.5 rounded-lg border p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-14" />
              </div>
              <div className="divide-border/60 divide-y">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32 max-w-full" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </ShellWidth>
    </div>
  );
}

function DocumentsSkeleton() {
  return (
    <ShellWidth className="space-y-6 py-8 sm:py-10">
      <PageHeaderSkeleton titleWidth="w-36" blurbWidth="w-full max-w-xl" />

      <div className="border-border bg-card inline-flex h-8 items-center gap-0.5 rounded-lg border p-0.5">
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-36 rounded-md" />
      </div>

      <section className="space-y-4">
        <div className="border-border/80 bg-card ring-ring/10 space-y-3 rounded-lg border p-4 shadow-sm ring-1">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="min-h-32 w-full rounded-xl" />
          </div>
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="border-border/80 bg-card flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40 max-w-full" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </ShellWidth>
  );
}

function JobTrackerSkeleton() {
  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative">
        <ShellWidth className="space-y-6 py-8 sm:py-10">
          <PageHeaderSkeleton titleWidth="w-40" blurbWidth="w-full max-w-2xl" withToolbar />

          <Skeleton className="h-9 w-full rounded-xl" />

          <div className="border-border/70 bg-card overflow-hidden rounded-xl border">
            <div className="p-3 sm:p-4">
              <div className="flex gap-3 overflow-hidden pb-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <section
                    key={i}
                    className="border-border/60 bg-muted/25 flex h-[min(50vh,28rem)] w-[18rem] shrink-0 flex-col overflow-hidden rounded-lg border"
                  >
                    <div className="mb-0 flex shrink-0 items-center justify-between gap-2 px-2.5 pb-2 pt-2.5">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-5 w-5 rounded-full" />
                    </div>
                    <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden p-2.5 pt-0">
                      {Array.from({ length: i % 3 === 0 ? 3 : 2 }).map((_, j) => (
                        <div
                          key={j}
                          className="border-border/50 bg-muted/40 space-y-2 rounded-lg border p-3"
                        >
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3 w-36 max-w-full" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </ShellWidth>
      </div>
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative">
        <ShellWidth className="space-y-6 py-8 sm:py-10">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-8 w-28 sm:h-9" />
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-9 w-32 rounded-lg" />
          </header>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-9 w-full rounded-md sm:max-w-sm" />
            <Skeleton className="h-8 w-32 rounded-md" />
          </div>

          <TableSkeleton columns={7} rows={6} />
        </ShellWidth>
      </div>
    </div>
  );
}

/** Matches components/jobs-hub.tsx: tabs + search inside the panel, two scrolling panes, accordion. */
function JobsSkeleton() {
  return (
    <ShellWidth className="flex flex-col gap-4 py-6 sm:py-8">
      <PageHeaderSkeleton titleWidth="w-20" blurbWidth="w-full max-w-2xl" withToolbar />

      <div className="flex flex-col gap-4 md:h-[calc(100dvh-13.5rem)] md:min-h-[32rem] md:flex-row">
        <Card className="w-full shrink-0 gap-0 overflow-hidden p-0 md:w-[360px]">
          <div className="border-border/60 space-y-2 border-b p-3">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-md" />
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-20 rounded-full" />
              ))}
            </div>
          </div>
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-2.5 rounded-md px-2.5 py-2.5">
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40 max-w-full" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="bg-muted/20 min-w-0 flex-1 gap-4 overflow-hidden p-3 sm:p-4">
          <Card className="gap-3">
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-64 max-w-full" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-7 w-28 rounded-md" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-20 rounded-full" />
              ))}
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </Card>
          <Card className="gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </Card>
          <Card className="gap-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-7 w-2/3" />
          </Card>
          <Card className="gap-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-16 w-full rounded-md" />
          </Card>
        </Card>
      </div>

      <Card className="gap-0 rounded-xl p-0">
        <div className="flex items-center justify-between px-4 py-4 md:px-5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="size-4 rounded-sm" />
        </div>
      </Card>
    </ShellWidth>
  );
}

function FollowUpsSkeleton() {
  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative">
        <ShellWidth className="space-y-6 py-8 sm:py-10">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-36 sm:h-9" />
              <Skeleton className="h-4 w-full max-w-2xl" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-36 rounded-md" />
              <Skeleton className="h-4 w-12" />
            </div>
          </header>

          <section className="border-border/80 bg-card space-y-3 rounded-lg border p-4 shadow-sm">
            <Skeleton className="h-4 w-28" />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <Skeleton className="min-h-[72px] w-full rounded-md" />
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
            <Skeleton className="h-9 w-full rounded-md sm:max-w-xs" />
          </div>

          <TableSkeleton columns={7} rows={5} />
        </ShellWidth>
      </div>
    </div>
  );
}

function ReferralsSkeleton() {
  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative space-y-3 pt-6">
        <ShellWidth className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-1" />
          <Skeleton className="h-3 w-28" />
        </ShellWidth>

        <ShellWidth className="space-y-6 py-8 sm:py-10">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-8 w-32 sm:h-9" />
              <Skeleton className="h-4 w-full max-w-2xl" />
            </div>
            <Skeleton className="h-8 w-36 rounded-lg" />
          </header>

          <div className="flex w-full gap-3 overflow-hidden pb-1">
            {(["Applications", "Template", "People"] as const).map((label, i) => (
              <section
                key={label}
                className="border-border/80 bg-card relative flex h-[min(70vh,40rem)] min-w-[240px] flex-1 flex-col rounded-xl border shadow-sm"
                style={{ flex: `${i === 1 ? 1.1 : 1} 1 0%` }}
              >
                <header className="border-border/60 flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2.5">
                  <div className="min-w-0 space-y-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-36 max-w-full" />
                  </div>
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                </header>
                <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
                  {i === 1 ? (
                    <>
                      <Skeleton className="h-3 w-10" />
                      <Skeleton className="h-8 w-full rounded-lg" />
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-8 w-full rounded-lg" />
                      <Skeleton className="min-h-40 w-full rounded-lg" />
                    </>
                  ) : (
                    Array.from({ length: 5 }).map((_, j) => (
                      <div
                        key={j}
                        className="border-border/70 bg-muted/30 space-y-1.5 rounded-xl border px-2.5 py-2"
                      >
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-36 max-w-full" />
                        {i === 0 ? <Skeleton className="mt-1 h-5 w-16 rounded-full" /> : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>

          <section className="border-border/80 bg-card space-y-2 rounded-xl border p-4">
            <Skeleton className="h-4 w-36" />
            <div className="divide-border/60 divide-y">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-48 max-w-full" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </section>
        </ShellWidth>
      </div>
    </div>
  );
}

function OnboardingSkeleton() {
  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="relative">
        <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
          <header className="space-y-1.5 text-center sm:text-left">
            <Skeleton className="mx-auto h-3 w-14 sm:mx-0" />
            <Skeleton className="mx-auto h-8 w-56 sm:mx-0 sm:h-9" />
            <Skeleton className="mx-auto h-4 w-64 max-w-full sm:mx-0" />
            <Skeleton className="mx-auto h-4 w-72 max-w-full sm:mx-0" />
          </header>

          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>

          <section className="border-border/80 bg-card ring-ring/10 space-y-4 rounded-xl border p-4 shadow-sm ring-1 sm:p-5">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
            <Skeleton className="h-9 w-48 rounded-lg" />
          </section>
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <ShellWidth className="space-y-5 py-8 sm:py-10">
      <div className="border-border/80 bg-card ring-ring/10 relative overflow-hidden rounded-lg border p-5 shadow-sm ring-1 sm:p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <Skeleton className="size-14 shrink-0 rounded-full sm:size-16" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-7 w-48 max-w-full sm:h-8" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="mt-2 h-4 w-full max-w-xl" />
              <Skeleton className="h-4 w-3/4 max-w-md" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
        </div>
        <div className="relative mt-5 flex flex-wrap gap-x-3 gap-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>

      <div className="border-border/80 bg-card ring-ring/10 rounded-lg border p-4 shadow-sm ring-1 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="border-border/70 bg-background/50 mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Skeleton className="h-7 w-14 rounded-md" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
    </ShellWidth>
  );
}

function AdminSkeleton() {
  return (
    <ShellWidth className="space-y-4 py-7 sm:py-9" aria-busy="true" aria-label="Loading admin">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-7 w-40 sm:h-8" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-border/80 bg-card space-y-1.5 rounded-xl border px-3 py-2.5 shadow-sm"
          >
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </section>

      <section className="border-border/80 bg-card space-y-2.5 rounded-xl border p-3.5 shadow-sm">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <div className="border-border/70 divide-border/60 divide-y rounded-xl border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36 max-w-full" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Skeleton className="h-8 w-16 rounded-md" />
                <Skeleton className="h-8 w-14 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border/80 bg-card space-y-2.5 rounded-xl border p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
        <div className="border-border/70 space-y-0 overflow-hidden rounded-xl border">
          <div className="bg-muted/40 flex gap-4 px-2.5 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-border/60 flex gap-4 border-t px-2.5 py-2.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-14" />
            </div>
          ))}
        </div>
      </section>
    </ShellWidth>
  );
}

/** Generic route placeholder when no page-specific skeleton exists. */
/** One ATS step card header: numbered badge, title + summary, chevron (mirrors StepBlock). */
function AtsStepHeader({ titleWidth, summaryWidth }: { titleWidth: string; summaryWidth: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3.5 sm:gap-3 sm:px-5">
      <Skeleton className="size-7 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className={`h-3.5 ${titleWidth}`} />
        <Skeleton className={`h-2.5 max-w-full ${summaryWidth}`} />
      </div>
      <Skeleton className="size-4 shrink-0 rounded-sm" />
    </div>
  );
}

/** Matches components/ats-hub.tsx on first load: steps 1, 3, 5 open; 2 and 4 collapsed. */
function AtsSkeleton() {
  return (
    <ShellWidth className="space-y-4 py-6 sm:space-y-5 sm:py-8">
      <header className="space-y-1.5">
        <Skeleton className="h-8 w-40 sm:h-9" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </header>

      <div className="space-y-3 sm:space-y-4">
        {/* 1 · Select engine — engine cards grid */}
        <Card className="border-border/80 gap-0 rounded-xl p-0">
          <AtsStepHeader titleWidth="w-28" summaryWidth="w-64" />
          <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 sm:px-5 md:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Card key={i} size="sm" className="border-border/60 flex-row items-start gap-2">
                <Skeleton className="mt-0.5 size-4 shrink-0 rounded" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-4 w-10 rounded-full" />
                  </div>
                  <Skeleton className="h-2.5 w-full" />
                  <Skeleton className="h-2.5 w-2/3" />
                </div>
                <Skeleton className="size-5 shrink-0 rounded-md" />
              </Card>
            ))}
          </div>
        </Card>

        {/* 2 · Select resume — collapsed */}
        <Card className="border-border/80 gap-0 rounded-xl p-0">
          <AtsStepHeader titleWidth="w-28" summaryWidth="w-48" />
        </Card>

        {/* 3 · Job content — title input + JD textarea */}
        <Card className="border-border/80 gap-0 rounded-xl p-0">
          <AtsStepHeader titleWidth="w-24" summaryWidth="w-72" />
          <div className="space-y-3 px-4 pb-4 sm:px-5">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-64 max-w-full" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-72 max-w-full" />
              <Skeleton className="h-36 w-full rounded-lg" />
            </div>
          </div>
        </Card>

        {/* 4 · Review and run — collapsed */}
        <Card className="border-border/80 gap-0 rounded-xl p-0">
          <AtsStepHeader titleWidth="w-32" summaryWidth="w-56" />
        </Card>

        {/* 5 · Results — filters + score table */}
        <Card className="border-border/80 gap-0 rounded-xl p-0">
          <AtsStepHeader titleWidth="w-16" summaryWidth="w-80" />
          <div className="space-y-3 px-4 pb-4 sm:px-5">
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-36 rounded-lg" />
              <Skeleton className="h-8 w-36 rounded-lg" />
            </div>
            <div className="border-border/60 overflow-hidden rounded-lg border">
              <div className="border-border/40 flex gap-4 border-b px-3 py-2.5">
                <Skeleton className="h-3 w-24" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-20" />
                ))}
              </div>
              {Array.from({ length: 2 }).map((_, row) => (
                <div
                  key={row}
                  className="border-border/40 flex items-center gap-4 border-b px-3 py-3 last:border-b-0"
                >
                  <Skeleton className="h-3.5 w-24" />
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex w-20 items-center gap-2">
                      <Skeleton className="size-11 shrink-0 rounded-full" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* How scoring works (accordion card) */}
      <Card className="border-border/80 gap-0 rounded-xl p-0">
        <div className="flex items-center justify-between px-4 py-4 md:px-5">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="size-4 rounded-sm" />
        </div>
      </Card>
    </ShellWidth>
  );
}

function FallbackSkeleton() {
  return (
    <ShellWidth className="space-y-5 py-8 sm:py-10" aria-busy="true" aria-label="Loading">
      <PageHeaderSkeleton titleWidth="w-36" blurbWidth="w-64" />
      <div className="border-border/80 bg-card space-y-3 rounded-xl border p-4 shadow-sm sm:p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full max-w-xl" />
        <Skeleton className="h-3 w-3/4 max-w-md" />
        <div className="mt-2 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </ShellWidth>
  );
}

/** Route-level placeholder while RSC / navigation loads — mirrors each page layout. */
export function PageLoadingSkeleton({ variant = "fallback" }: { variant?: Variant }) {
  switch (variant) {
    case "dashboard":
      return <DashboardSkeleton />;
    case "documents":
      return <DocumentsSkeleton />;
    case "job-tracker":
    case "board":
      return <JobTrackerSkeleton />;
    case "people":
      return <PeopleSkeleton />;
    case "jobs":
      return <JobsSkeleton />;
    case "follow-ups":
      return <FollowUpsSkeleton />;
    case "referrals":
      return <ReferralsSkeleton />;
    case "onboarding":
    case "form":
      return <OnboardingSkeleton />;
    case "profile":
      return <ProfileSkeleton />;
    case "ats":
      return <AtsSkeleton />;
    case "admin":
      return <AdminSkeleton />;
    case "fallback":
    case "default":
    default:
      return <FallbackSkeleton />;
  }
}
