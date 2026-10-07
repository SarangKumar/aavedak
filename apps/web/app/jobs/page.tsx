import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";
import { requireOnboarded } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "Jobs",
};

export default async function Page() {
  await requireOnboarded();
  return (
    <PageStub
      title="Jobs"
      description="Multi-source jobs as cards with resizable list and detail."
      hint="Ingested roles and filters will land in this workspace."
    />
  );
}
