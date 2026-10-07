import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { databaseErrorMessage, isDatabaseFailure } from "@/lib/db-config";
import { ingestJobsForUser } from "@/lib/jobs-ingest";
import { ensureProfile } from "@/lib/profile";

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
    const result = await ingestJobsForUser(session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (isDatabaseFailure(err)) {
      return NextResponse.json({ error: databaseErrorMessage(err) }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Ingest failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
