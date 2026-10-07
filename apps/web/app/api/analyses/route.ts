import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createJobAnalysis, listJobAnalyses } from "@/lib/job-analyses";
import { ensureProfile } from "@/lib/profile";

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

function toDto(row: Awaited<ReturnType<typeof listJobAnalyses>>[number]) {
  return {
    id: row.id,
    rawText: row.rawText,
    summary: row.summary,
    jobId: row.jobId,
    companyName: row.companyName,
    role: row.role,
    atsScore: row.atsScore,
    resumeMatchScore: row.resumeMatchScore,
    coverLetterId: row.coverLetterId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ analyses: (await listJobAnalyses(user.id)).map(toDto) });
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
    const analysis = await createJobAnalysis(user.id, {
      rawText: String(body.rawText ?? ""),
      summary: (body.summary as string | null | undefined) ?? null,
      jobId: (body.jobId as string | null | undefined) ?? null,
      companyName: (body.companyName as string | null | undefined) ?? null,
      role: (body.role as string | null | undefined) ?? null,
    });
    return NextResponse.json({ analysis: toDto(analysis) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
