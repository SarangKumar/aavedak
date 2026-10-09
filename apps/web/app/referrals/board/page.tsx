import type { Metadata } from "next";

import { ReferralsBoard } from "../referrals-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Referrals board",
  description: "Full-screen referrals board.",
};

export default function ReferralsBoardPage() {
  return <ReferralsBoard variant="board" />;
}
