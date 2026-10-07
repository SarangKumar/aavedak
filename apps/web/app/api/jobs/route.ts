import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createJob, ensureDemoJobs, listJobs, type JobSource } from "@/lib/jobs";
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

function toDto(row: ReturnType<typeof listJobs>[number]) {
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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = ensureDemoJobs(user.id).map(toDto);
  return NextResponse.json({ jobs });
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
    const job = createJob(user.id, {
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
