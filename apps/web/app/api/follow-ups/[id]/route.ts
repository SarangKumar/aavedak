import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getFollowUp, updateFollowUp, type FollowUpStatus } from "@/lib/follow-ups";
import { ensureProfile } from "@/lib/profile";

type Ctx = { params: Promise<{ id: string }> };

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

function toDto(row: NonNullable<ReturnType<typeof getFollowUp>>) {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.dueDate,
    status: row.status,
    personId: row.personId,
    applicationId: row.applicationId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const patch: Parameters<typeof updateFollowUp>[2] = {};
    if ("title" in body) patch.title = String(body.title ?? "");
    if ("dueDate" in body) patch.dueDate = (body.dueDate as string | null) ?? null;
    if ("personId" in body) patch.personId = (body.personId as string | null) ?? null;
    if ("applicationId" in body) {
      patch.applicationId = (body.applicationId as string | null) ?? null;
    }
    if ("notes" in body) patch.notes = (body.notes as string | null) ?? null;
    if ("status" in body) {
      const status = body.status as FollowUpStatus;
      if (status !== "pending" && status !== "done" && status !== "dismissed") {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = status;
    }
    const followUp = updateFollowUp(user.id, id, patch);
    return NextResponse.json({ followUp: toDto(followUp) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Follow-up not found." ? 404 : 400 },
    );
  }
}
