import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { createTemplate, listTemplates, type TemplateKind } from "@/lib/templates";

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

function toDto(row: Awaited<ReturnType<typeof listTemplates>>[number]) {
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

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ templates: (await listTemplates(user.id)).map(toDto) });
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
    const template = await createTemplate(user.id, {
      title: String(body.title ?? ""),
      subject: typeof body.subject === "string" ? body.subject : "",
      body: typeof body.body === "string" ? body.body : "",
      kind: body.kind as TemplateKind | undefined,
    });
    return NextResponse.json({ template: toDto(template) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
