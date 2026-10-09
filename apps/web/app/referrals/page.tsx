import type { Metadata } from "next";

import { ReferralsBoard } from "./referrals-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Referrals",
  description: "Compose cold outreach, pick recipients, and queue follow-ups.",
};

export default function ReferralsPage() {
  return <ReferralsBoard variant="page" />;
}
