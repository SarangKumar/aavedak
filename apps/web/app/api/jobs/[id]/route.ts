import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { archiveJob, getJob, updateJob, type JobSource, type JobStatus } from "@/lib/jobs";
import { ensureProfile } from "@/lib/profile";

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

function toDto(row: NonNullable<Awaited<ReturnType<typeof getJob>>>) {
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
    const patch: Parameters<typeof updateJob>[2] = {};
    if ("title" in body) patch.title = String(body.title ?? "");
    if ("company" in body) patch.company = String(body.company ?? "");
    if ("location" in body) patch.location = String(body.location ?? "");
    if ("source" in body) patch.source = body.source as JobSource;
    if ("url" in body) patch.url = (body.url as string | null) ?? null;
    if ("description" in body) patch.description = String(body.description ?? "");
    if ("salary" in body) patch.salary = (body.salary as string | null) ?? null;
    if ("status" in body) {
      const status = body.status as JobStatus;
      if (status !== "active" && status !== "archived") {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = status;
    }
    const job = await updateJob(user.id, id, patch);
    return NextResponse.json({ job: toDto(job) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Job not found." ? 404 : 400 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const job = await archiveJob(user.id, id);
    return NextResponse.json({ job: toDto(job) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Job not found." ? 404 : 400 },
    );
  }
}
