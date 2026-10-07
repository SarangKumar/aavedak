import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function Page() {
  return (
    <PageStub
      title="Dashboard"
      description="Application summary and what to do today."
      hint="Metrics, queues, and daily focus will appear here."
    />
  );
}
