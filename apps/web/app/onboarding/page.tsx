import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

export const metadata: Metadata = {
  title: "Onboarding",
};

export default function Page() {
  return (
    <PageStub
      title="Onboarding"
      description="Google sign-in, resume upload, and preferences."
      hint="Guided setup steps will walk you through first-run config."
    />
  );
}
