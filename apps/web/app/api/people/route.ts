import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createPerson, listPeople } from "@/lib/people";
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

function toDto(row: ReturnType<typeof listPeople>[number]) {
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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ people: listPeople(user.id).map(toDto) });
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
    const person = createPerson(user.id, {
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
