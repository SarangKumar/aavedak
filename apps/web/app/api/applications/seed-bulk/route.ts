import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { applicationToDto } from "@/lib/applications";
import { seedBulkApplications } from "@/lib/applications-bulk-seed";
import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";

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

  const result = seedBulkApplications(session.user.id);
  return NextResponse.json({
    insertedCount: result.inserted.length,
    skippedCount: result.skipped,
    appliedInserted: result.appliedInserted,
    rejectedInserted: result.rejectedInserted,
    totalSource: result.totalSource,
    inserted: result.inserted.map(applicationToDto),
  });
}
