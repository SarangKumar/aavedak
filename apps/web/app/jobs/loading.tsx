import { JobsPageHeader } from "@/components/jobs-page-header";
import { JobsBoardSkeleton } from "@/components/page-loading-skeleton";
import { ShellWidth } from "@/components/shell-width";

/**
 * Prefetchable shell for /jobs: same heading and board skeleton the page streams, so a click
 * shows the real layout instantly instead of the generic fallback. Uses the default list width
 * (the cookie-sized one takes over once the page responds).
 */
export default function JobsLoading() {
  return (
    <ShellWidth className="flex flex-col gap-4 py-6 sm:py-8">
      <JobsPageHeader />
      <JobsBoardSkeleton />
    </ShellWidth>
  );
}
