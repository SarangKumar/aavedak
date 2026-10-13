import type { Metadata } from "next";

import { OutreachBoard } from "./outreach-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Outreach",
  description: "Inbox of referral and follow-up emails for your applications.",
};

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string | string[] }>;
}) {
  const { thread } = await searchParams;
  return <OutreachBoard variant="page" threadId={typeof thread === "string" ? thread : null} />;
}
