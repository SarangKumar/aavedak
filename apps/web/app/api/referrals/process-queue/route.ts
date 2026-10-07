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
  const authFailed = result.processed.some(
    (f) =>
      f.status === "failed" &&
      /gmail|authoriz|scope|reconnect/i.test(f.sendError || ""),
  );
  return NextResponse.json({
    processed: result.processed.length,
    sent: result.sent,
    failed: result.failed,
    followUps: result.processed,
    gmail: "live",
    ...(authFailed
      ? {
          code: "gmail_reconnect",
          error: "Gmail authorization failed. Reconnect Google with send permission.",
        }
      : {}),
  });
}

export async function GET() {
  return POST();
}
