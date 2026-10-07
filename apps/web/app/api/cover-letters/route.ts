import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { createCoverLetter, listCoverLetters } from "@/lib/cover-letters";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(row: Awaited<ReturnType<typeof listCoverLetters>>[number]) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    applicationId: row.applicationId,
    jobId: row.jobId,
    companyName: row.companyName,
    roleTitle: row.roleTitle,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  return NextResponse.json({ coverLetters: (await listCoverLetters(user.id)).map(toDto) });
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
    const coverLetter = await createCoverLetter(user.id, {
      title: String(body.title ?? ""),
      body: typeof body.body === "string" ? body.body : "",
      applicationId: (body.applicationId as string | null | undefined) ?? null,
      jobId: (body.jobId as string | null | undefined) ?? null,
      companyName: (body.companyName as string | null | undefined) ?? null,
      roleTitle: (body.roleTitle as string | null | undefined) ?? null,
    });
    return NextResponse.json({ coverLetter: toDto(coverLetter) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
