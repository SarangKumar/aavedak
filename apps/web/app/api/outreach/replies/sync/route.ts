import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { syncRepliesForUser } from "@/lib/mail-replies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Check replies" on Outreach: reads the signed-in user's sent threads now. */
export async function POST() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  try {
    const result = await syncRepliesForUser(auth.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not check replies." },
      { status: 500 },
    );
  }
}
