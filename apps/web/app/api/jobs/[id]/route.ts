import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { archiveJob, getJob, updateJob, type JobSource, type JobStatus } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
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
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
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
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
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
