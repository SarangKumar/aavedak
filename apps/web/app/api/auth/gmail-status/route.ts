import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { databaseErrorMessage, isDatabaseFailure } from "@/lib/db-config";
import { getGmailStatusForUser } from "@/lib/gmail";
import { ensureProfile } from "@/lib/profile";

export async function GET() {
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
    const status = await getGmailStatusForUser(session.user.id);
    return NextResponse.json(status);
  } catch (err) {
    if (isDatabaseFailure(err)) {
      return NextResponse.json({ error: databaseErrorMessage(err) }, { status: 503 });
    }
    throw err;
  }
}
