import { NextResponse } from "next/server";

import { cronUnauthorized } from "@/lib/cron-auth";
import { databaseErrorMessage, isDatabaseFailure } from "@/lib/db-config";
import { processDueQueuedFollowUps } from "@/lib/follow-ups";
import { GmailReconnectError } from "@/lib/gmail";

export async function GET(request: Request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  try {
    const result = await processDueQueuedFollowUps();
    const reconnect = result.processed.some((row) =>
      (row.lastError ?? "").toLowerCase().includes("reconnect"),
    );
    return NextResponse.json({
      processed: result.processed.length,
      sent: result.sent,
      failed: result.failed,
      gmail: reconnect ? "reconnect_required" : "sent",
    });
  } catch (err) {
    if (err instanceof GmailReconnectError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    const status = isDatabaseFailure(err) ? 503 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : databaseErrorMessage(err) },
      { status },
    );
  }
}

export function POST(request: Request) {
  return GET(request);
}
