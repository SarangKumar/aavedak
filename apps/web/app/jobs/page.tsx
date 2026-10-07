import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

export const metadata: Metadata = {
  title: "Jobs",
};

export default function Page() {
  return (
    <PageStub
      title="Jobs"
      description="Multi-source jobs as cards with resizable list and detail."
      hint="Ingested roles and filters will land in this workspace."
    />
  );
}
