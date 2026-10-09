import type { Metadata } from "next";

import { OutreachBoard } from "../outreach-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Outreach inbox",
  description: "Full-screen outreach inbox.",
};

export default function OutreachBoardPage() {
  return <OutreachBoard variant="board" />;
}
