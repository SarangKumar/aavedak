import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { isApplicationStatus, type ApplicationStatus } from "@/lib/application-status";
import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { getPreferences, updatePreferences } from "@/lib/preferences";

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

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prefs = getPreferences(user.id);
  return NextResponse.json({ preferences: prefs });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Parameters<typeof updatePreferences>[1] = {};
  if (body.trackerView === "kanban" || body.trackerView === "list") {
    patch.trackerView = body.trackerView;
  }
  if (body.trackerScope === "active" || body.trackerScope === "archived") {
    patch.trackerScope = body.trackerScope;
  }
  if (Array.isArray(body.hiddenColumns)) {
    patch.hiddenColumns = body.hiddenColumns.filter(
      (v): v is ApplicationStatus => typeof v === "string" && isApplicationStatus(v),
    );
  }

  const preferences = updatePreferences(user.id, patch);
  return NextResponse.json({ preferences });
}
