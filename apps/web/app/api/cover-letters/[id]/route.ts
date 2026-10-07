import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import {
  archiveCoverLetter,
  getCoverLetter,
  updateCoverLetter,
  type CoverLetterStatus,
} from "@/lib/cover-letters";

type Ctx = { params: Promise<{ id: string }> };

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(row: NonNullable<Awaited<ReturnType<typeof getCoverLetter>>>) {
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
    const patch: Parameters<typeof updateCoverLetter>[2] = {};
    if ("title" in body) patch.title = String(body.title ?? "");
    if ("body" in body) patch.body = String(body.body ?? "");
    if ("applicationId" in body) {
      patch.applicationId = (body.applicationId as string | null) ?? null;
    }
    if ("jobId" in body) {
      patch.jobId = (body.jobId as string | null) ?? null;
    }
    if ("companyName" in body) {
      patch.companyName = (body.companyName as string | null) ?? null;
    }
    if ("roleTitle" in body) {
      patch.roleTitle = (body.roleTitle as string | null) ?? null;
    }
    if ("status" in body) {
      const status = body.status as CoverLetterStatus;
      if (status !== "active" && status !== "archived") {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = status;
    }
    const coverLetter = await updateCoverLetter(user.id, id, patch);
    return NextResponse.json({ coverLetter: toDto(coverLetter) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Cover letter not found." ? 404 : 400 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const { id } = await ctx.params;
  try {
    const coverLetter = await archiveCoverLetter(user.id, id);
    return NextResponse.json({ coverLetter: toDto(coverLetter) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Cover letter not found." ? 404 : 400 },
    );
  }
}
