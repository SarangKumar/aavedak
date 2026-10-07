import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { createJob, ensureDemoJobs, listJobs, type JobSource } from "@/lib/jobs";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(row: Awaited<ReturnType<typeof listJobs>>[number]) {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    source: row.source,
    url: row.url,
    description: row.description,
    salary: row.salary,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const jobs = (await ensureDemoJobs(user.id)).map(toDto);
  return NextResponse.json({ jobs });
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
    const job = await createJob(user.id, {
      title: String(body.title ?? ""),
      company: String(body.company ?? ""),
      location: String(body.location ?? ""),
      source: body.source as JobSource | undefined,
      url: (body.url as string | null | undefined) ?? null,
      description: typeof body.description === "string" ? body.description : "",
      salary: (body.salary as string | null | undefined) ?? null,
    });
    return NextResponse.json({ job: toDto(job) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
