import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { archivePerson, getPerson, updatePerson, type PersonStatus } from "@/lib/people";
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

function toDto(row: NonNullable<ReturnType<typeof getPerson>>) {
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
    const patch: Parameters<typeof updatePerson>[2] = {};
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
    const person = updatePerson(user.id, id, patch);
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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const person = archivePerson(user.id, id);
    return NextResponse.json({ person: toDto(person) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Person not found." ? 404 : 400 },
    );
  }
}
