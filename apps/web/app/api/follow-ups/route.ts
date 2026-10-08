import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { createFollowUp, listFollowUps, type FollowUpStatus } from "@/lib/follow-ups";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(row: Awaited<ReturnType<typeof listFollowUps>>[number]) {
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

export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const includeClosed = new URL(request.url).searchParams.get("includeClosed") === "1";
  return NextResponse.json({
    followUps: (await listFollowUps(user.id, { includeClosed })).map(toDto),
  });
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const followUp = await createFollowUp(user.id, {
      title: String(body.title ?? ""),
      dueDate: (body.dueDate as string | null | undefined) ?? null,
      personId: (body.personId as string | null | undefined) ?? null,
      applicationId: (body.applicationId as string | null | undefined) ?? null,
      notes: (body.notes as string | null | undefined) ?? null,
      status: body.status as FollowUpStatus | undefined,
    });
    return NextResponse.json({ followUp: toDto(followUp) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
