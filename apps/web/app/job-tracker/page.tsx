import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

export const metadata: Metadata = {
  title: "Job tracker",
};

export default function Page() {
  return (
    <PageStub
      title="Job tracker"
      description="Applications as Kanban or list with resizable columns."
      hint="Stages, notes, and status changes will live here."
    />
  );
}
