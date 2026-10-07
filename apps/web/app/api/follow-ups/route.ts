import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createFollowUp, listFollowUps, type FollowUpStatus } from "@/lib/follow-ups";
import { ensureProfile } from "@/lib/profile";

async function requireUser() {
  const { data: session } = await auth.getSession();
  if (!session?.user?.email) return null;
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  return session.user;
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const includeClosed = new URL(request.url).searchParams.get("includeClosed") === "1";
  return NextResponse.json({
    followUps: (await listFollowUps(user.id, { includeClosed })).map(toDto),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
