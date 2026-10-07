import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { applicationToDto } from "@/lib/applications";
import { auth } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { ensureProfile } from "@/lib/profile";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  const snap = getDashboardSnapshot(session.user.id);
  return NextResponse.json({
    ...snap,
    recentApplications: snap.recentApplications.map(applicationToDto),
    upcomingFollowUps: snap.upcomingFollowUps.map((f) => ({
      id: f.id,
      title: f.title,
      dueDate: f.dueDate,
      status: f.status,
      personId: f.personId,
      applicationId: f.applicationId,
      notes: f.notes,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  });
}
