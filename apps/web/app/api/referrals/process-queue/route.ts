import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { databaseErrorMessage, isDatabaseFailure } from "@/lib/db-config";
import { processDueQueuedFollowUps } from "@/lib/follow-ups";
import { GmailReconnectError } from "@/lib/gmail";
import { ensureProfile } from "@/lib/profile";

/** Sends queued follow-ups whose send_after is due, using the signed-in user's Google token. */
export async function POST() {
  try {
    const session = await auth.api.getSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await ensureProfile({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });
    const result = await processDueQueuedFollowUps(session.user.id);
    const reconnect = result.processed.some((row) => row.lastError?.includes("Reconnect"));
    return NextResponse.json({
      processed: result.processed.length,
      sent: result.sent,
      failed: result.failed,
      followUps: result.processed,
      gmail: reconnect ? "reconnect_required" : result.sent > 0 ? "sent" : "idle",
    });
  } catch (err) {
    if (err instanceof GmailReconnectError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    if (isDatabaseFailure(err)) {
      return NextResponse.json({ error: databaseErrorMessage(err) }, { status: 503 });
    }
    throw err;
  }
}

export function GET() {
  return POST();
}
