import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createCoverLetter, listCoverLetters } from "@/lib/cover-letters";
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

function toDto(row: Awaited<ReturnType<typeof listCoverLetters>>[number]) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    applicationId: row.applicationId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ coverLetters: (await listCoverLetters(user.id)).map(toDto) });
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
    const coverLetter = await createCoverLetter(user.id, {
      title: String(body.title ?? ""),
      body: typeof body.body === "string" ? body.body : "",
      applicationId: (body.applicationId as string | null | undefined) ?? null,
    });
    return NextResponse.json({ coverLetter: toDto(coverLetter) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
