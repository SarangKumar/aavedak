import type { Metadata } from "next";

import { JobsBoard, type JobsSearchParams } from "./jobs-board-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Jobs",
  description: "Discovered junior engineering roles in India and the jobs you applied to.",
};

export default function JobsPage({ searchParams }: { searchParams: JobsSearchParams }) {
  return <JobsBoard variant="page" searchParams={searchParams} />;
}
