import { NextResponse } from "next/server";

import { wipeUserAccountData } from "@/lib/account-delete";
import { requireApiUser } from "@/lib/api-session";
import { getProfile } from "@/lib/profile";

/**
 * POST /api/account/wipe-data
 * Body: { confirm: "<username>" }
 * Deletes applications, resumes, jobs, templates, cover letters, follow-ups, etc.
 * Keeps the account and people the user added.
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const user = authResult.user;

  let body: { confirm?: string };
  try {
    body = (await request.json()) as { confirm?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const profile = await getProfile(user.id);
  const confirm = (body.confirm ?? "").trim();
  if (!profile?.username || confirm.toLowerCase() !== profile.username.toLowerCase()) {
    return NextResponse.json(
      { error: "Type your username to confirm deleting all account data." },
      { status: 400 },
    );
  }

  try {
    await wipeUserAccountData(user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete account data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
