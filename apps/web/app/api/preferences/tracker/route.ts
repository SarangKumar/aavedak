import { NextResponse } from "next/server";

import { isApplicationStatus, type ApplicationStatus } from "@/lib/application-status";
import { requireApiUser } from "@/lib/api-session";
import { getPreferences, updatePreferences } from "@/lib/preferences";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const prefs = await getPreferences(user.id);
  return NextResponse.json({ preferences: prefs });
}

export async function PATCH(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;

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

  const preferences = await updatePreferences(user.id, patch);
  return NextResponse.json({ preferences });
}
