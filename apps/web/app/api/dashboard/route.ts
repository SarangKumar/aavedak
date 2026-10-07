import { NextResponse } from "next/server";

import { applicationToDto } from "@/lib/applications";
import { requireApiUser } from "@/lib/api-session";
import { getDashboardSnapshot } from "@/lib/dashboard";

export async function GET() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const session = { user: authResult.user };

  const snap = await getDashboardSnapshot(session.user.id);
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
