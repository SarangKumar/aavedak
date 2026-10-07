import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { processDueQueuedFollowUps } from "@/lib/follow-ups";

/**
 * Cron/manual stub: mark due queued outreach as sent_stub.
 * Does not call Gmail. Safe to POST repeatedly.
 */
export async function POST() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const session = { user: authResult.user };

  const result = await processDueQueuedFollowUps(session.user.id);
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
