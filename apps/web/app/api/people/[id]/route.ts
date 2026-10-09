import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { archivePerson, getPerson, updatePerson, type PersonStatus } from "@/lib/people";

type Ctx = { params: Promise<{ id: string }> };

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(row: NonNullable<Awaited<ReturnType<typeof getPerson>>>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    roleTitle: row.roleTitle,
    notes: row.notes,
    applicationId: row.applicationId,
    status: row.status,
    origin: row.origin,
    linkedin: row.linkedin ? `https://www.${row.linkedin}` : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const patch: Parameters<typeof updatePerson>[1] = {};
    if ("name" in body) patch.name = String(body.name ?? "");
    if ("email" in body) patch.email = (body.email as string | null) ?? null;
    if ("company" in body) patch.company = (body.company as string | null) ?? null;
    if ("roleTitle" in body) patch.roleTitle = (body.roleTitle as string | null) ?? null;
    if ("notes" in body) patch.notes = (body.notes as string | null) ?? null;
    if ("applicationId" in body) {
      patch.applicationId = (body.applicationId as string | null) ?? null;
    }
    if ("status" in body) {
      const status = body.status as PersonStatus;
      if (status !== "active" && status !== "archived") {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = status;
    }
    const person = await updatePerson(id, patch);
    return NextResponse.json({ person: toDto(person) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Person not found." ? 404 : 400 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  try {
    const person = await archivePerson(id);
    return NextResponse.json({ person: toDto(person) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Person not found." ? 404 : 400 },
    );
  }
}
