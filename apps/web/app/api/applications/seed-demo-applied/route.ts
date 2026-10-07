import { NextResponse } from "next/server";

import { applicationToDto, seedDemoAppliedApplications } from "@/lib/applications";
import { requireApiUser } from "@/lib/api-session";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

/** Idempotent upsert of Sarang's four applied roles (skip existing company+role). */
export async function POST() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;

  const result = await seedDemoAppliedApplications(user.id);
  return NextResponse.json({
    inserted: result.inserted.map(applicationToDto),
    skipped: result.skipped,
    insertedCount: result.inserted.length,
    skippedCount: result.skipped.length,
  });
}
