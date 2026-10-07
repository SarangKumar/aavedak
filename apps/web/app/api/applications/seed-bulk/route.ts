import { NextResponse } from "next/server";

import { applicationToDto } from "@/lib/applications";
import { seedBulkApplications } from "@/lib/applications-bulk-seed";
import { requireApiUser } from "@/lib/api-session";

export async function POST() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const session = { user: authResult.user };

  const result = await seedBulkApplications(session.user.id);
  return NextResponse.json({
    insertedCount: result.inserted.length,
    skippedCount: result.skipped,
    appliedInserted: result.appliedInserted,
    rejectedInserted: result.rejectedInserted,
    totalSource: result.totalSource,
    inserted: result.inserted.map(applicationToDto),
  });
}
