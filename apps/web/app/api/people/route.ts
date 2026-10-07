import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { createPerson, listPeople } from "@/lib/people";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(row: Awaited<ReturnType<typeof listPeople>>[number]) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    roleTitle: row.roleTitle,
    notes: row.notes,
    applicationId: row.applicationId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  return NextResponse.json({ people: (await listPeople()).map(toDto) });
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
    const person = await createPerson(user.id, {
      name: String(body.name ?? ""),
      email: (body.email as string | null | undefined) ?? null,
      company: (body.company as string | null | undefined) ?? null,
      roleTitle: (body.roleTitle as string | null | undefined) ?? null,
      notes: (body.notes as string | null | undefined) ?? null,
      applicationId: (body.applicationId as string | null | undefined) ?? null,
    });
    return NextResponse.json({ person: toDto(person) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
