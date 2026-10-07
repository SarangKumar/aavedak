import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";
import { requireOnboarded } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "Documents",
};

export default async function Page() {
  await requireOnboarded();
  return (
    <PageStub
      title="Documents"
      description="Resumes, cover letters, and reusable templates."
      hint="Document library and versions will land here."
    />
  );
}
