import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { createJobAnalysis, listJobAnalyses } from "@/lib/job-analyses";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(row: Awaited<ReturnType<typeof listJobAnalyses>>[number]) {
  return {
    id: row.id,
    rawText: row.rawText,
    summary: row.summary,
    jobId: row.jobId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  return NextResponse.json({ analyses: (await listJobAnalyses(user.id)).map(toDto) });
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
    const analysis = await createJobAnalysis(user.id, {
      rawText: String(body.rawText ?? ""),
      summary: (body.summary as string | null | undefined) ?? null,
      jobId: (body.jobId as string | null | undefined) ?? null,
    });
    return NextResponse.json({ analysis: toDto(analysis) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
