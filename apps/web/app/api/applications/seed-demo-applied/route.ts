import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { applicationToDto, seedDemoAppliedApplications } from "@/lib/applications";
import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) return null;
  ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  return session.user;
}

/** Idempotent upsert of Sarang's four applied roles (skip existing company+role). */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = seedDemoAppliedApplications(user.id);
  return NextResponse.json({
    inserted: result.inserted.map(applicationToDto),
    skipped: result.skipped,
    insertedCount: result.inserted.length,
    skippedCount: result.skipped.length,
  });
}
