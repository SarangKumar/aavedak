import type { Metadata } from "next";

import { PageStub } from "@/components/page-stub";

export const metadata: Metadata = {
  title: "Referrals",
};

export default function Page() {
  return (
    <PageStub
      title="Referrals"
      description="Referral tracker and follow-ups."
      hint="Contacts, asks, and reminders will show up here."
    />
  );
}
