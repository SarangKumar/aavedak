import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { processDueQueuedFollowUps } from "@/lib/follow-ups";

/**
 * Manual / session-scoped: send due queued outreach for the signed-in user via Gmail.
 * Cron uses /api/cron/process-follow-ups for all users.
 */
export async function POST() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  const result = await processDueQueuedFollowUps(authResult.user.id);
  return NextResponse.json({
    processed: result.processed.length,
    sent: result.sent,
    failed: result.failed,
    followUps: result.processed,
    gmail: "live",
  });
}

export async function GET() {
  return POST();
}
