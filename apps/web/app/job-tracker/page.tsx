import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";
import { requireOnboarded } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "Job tracker",
};

export default async function Page() {
  await requireOnboarded();
  return (
    <PageStub
      title="Job tracker"
      description="Kanban and list views for every application stage."
      hint="Pipeline columns and status updates will appear here."
    />
  );
}
