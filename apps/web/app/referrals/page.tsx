import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";
import { requireOnboarded } from "@/lib/app-access";

export const metadata: Metadata = {
  title: "Referrals",
};

export default async function Page() {
  await requireOnboarded();
  return (
    <PageStub
      title="Referrals"
      description="Track asks, follow-ups, and introductions."
      hint="Referral CRM features will land here."
    />
  );
}
