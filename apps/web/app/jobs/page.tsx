import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { JobsPageHeader } from "@/components/jobs-page-header";
import { JobsBoardSkeleton } from "@/components/page-loading-skeleton";
import { ShellWidth } from "@/components/shell-width";
import { JOBS_LIST_WIDTH_COOKIE, parseJobsListWidth } from "@/lib/jobs-list-width";

import { JobsBoard, type JobsSearchParams } from "./jobs-board-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Jobs",
  description: "Discovered junior engineering roles in India and the jobs you applied to.",
};

export default async function JobsPage({ searchParams }: { searchParams: JobsSearchParams }) {
  // The heading renders at once; only the board waits on the session and job queries.
  const listWidth = parseJobsListWidth((await cookies()).get(JOBS_LIST_WIDTH_COOKIE)?.value);
  return (
    <ShellWidth className="aavedak-fade-up flex flex-col gap-4 py-6 sm:py-8">
      <JobsPageHeader />
      <Suspense fallback={<JobsBoardSkeleton listWidth={listWidth} />}>
        <JobsBoard variant="page" searchParams={searchParams} />
      </Suspense>
    </ShellWidth>
  );
}
