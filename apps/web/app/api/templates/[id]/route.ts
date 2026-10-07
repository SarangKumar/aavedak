import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import {
  archiveTemplate,
  getTemplate,
  updateTemplate,
  type TemplateKind,
  type TemplateStatus,
} from "@/lib/templates";

type Ctx = { params: Promise<{ id: string }> };

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) return null;
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  return session.user;
}

function toDto(row: NonNullable<Awaited<ReturnType<typeof getTemplate>>>) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    body: row.body,
    kind: row.kind,
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
    const patch: Parameters<typeof updateTemplate>[2] = {};
    if ("title" in body) patch.title = String(body.title ?? "");
    if ("subject" in body) patch.subject = String(body.subject ?? "");
    if ("body" in body) patch.body = String(body.body ?? "");
    if ("kind" in body) patch.kind = body.kind as TemplateKind;
    if ("status" in body) {
      const status = body.status as TemplateStatus;
      if (status !== "active" && status !== "archived") {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = status;
    }
    const template = await updateTemplate(user.id, id, patch);
    return NextResponse.json({ template: toDto(template) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Template not found." ? 404 : 400 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const template = await archiveTemplate(user.id, id);
    return NextResponse.json({ template: toDto(template) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Template not found." ? 404 : 400 },
    );
  }
}
