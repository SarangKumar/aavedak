import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getFollowUp, updateFollowUp, type FollowUpStatus } from "@/lib/follow-ups";

type Ctx = { params: Promise<{ id: string }> };

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(row: NonNullable<Awaited<ReturnType<typeof getFollowUp>>>) {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.dueDate,
    sendAfter: row.sendAfter,
    status: row.status,
    personId: row.personId,
    applicationId: row.applicationId,
    notes: row.notes,
    mailKind: row.mailKind,
    mailTo: row.mailTo,
    mailSubject: row.mailSubject,
    mailBody: row.mailBody,
    sendError: row.sendError,
    gmailMessageId: row.gmailMessageId,
    gmailThreadId: row.gmailThreadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
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
      if (
        status !== "pending" &&
        status !== "done" &&
        status !== "dismissed" &&
        status !== "queued" &&
        status !== "sent_stub"
      ) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = status;
    }
    const followUp = await updateFollowUp(user.id, id, patch);
    return NextResponse.json({ followUp: toDto(followUp) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Follow-up not found." ? 404 : 400 },
    );
  }
}
