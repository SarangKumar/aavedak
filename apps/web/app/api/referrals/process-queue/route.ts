import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { processDueQueuedFollowUps } from "@/lib/follow-ups";
import { ensureProfile } from "@/lib/profile";

/**
 * Cron/manual stub: mark due queued outreach as sent_stub.
 * Does not call Gmail. Safe to POST repeatedly.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  const result = processDueQueuedFollowUps(session.user.id);
  return NextResponse.json({
    processed: result.processed.length,
    followUps: result.processed,
    gmail: "not_wired",
    skippedGmail: true,
    note: "Marked due queued items as sent_stub. Wire Gmail (or another mailer) inside processDueQueuedFollowUps.",
  });
}

export async function GET() {
  return POST();
}
