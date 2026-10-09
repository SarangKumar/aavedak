import type { Metadata } from "next";

import { JobsBoard, type JobsSearchParams } from "../jobs-board-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Jobs board",
  description: "Full-screen jobs board.",
};

export default function JobsBoardPage({ searchParams }: { searchParams: JobsSearchParams }) {
  return <JobsBoard variant="board" searchParams={searchParams} />;
}
