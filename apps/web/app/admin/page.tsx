import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";
import { requireOnboarded } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function Page() {
  await requireOnboarded();
  return (
    <PageStub
      title="Admin"
      description="Global catalog and ops tools."
      hint="Admin tooling will land here."
    />
  );
}
