import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import {
  archiveResume,
  deleteInactiveResume,
  updateResume,
  type ResumeStatus,
} from "@/lib/resumes";

type Ctx = { params: Promise<{ id: string }> };

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const { id } = await ctx.params;
  let body: { displayName?: string; status?: ResumeStatus };
  try {
    body = (await request.json()) as { displayName?: string; status?: ResumeStatus };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const resume = await updateResume(user.id, id, {
      displayName: body.displayName,
      status: body.status,
    });
    return NextResponse.json({
      resume: {
        id: resume.id,
        displayName: resume.displayName,
        status: resume.status,
        originalFilename: resume.originalFilename,
        byteSize: resume.byteSize,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    const status = message === "Resume not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const { id } = await ctx.params;
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";
  try {
    if (permanent) {
      await deleteInactiveResume(user.id, id);
      return NextResponse.json({ ok: true, deleted: id });
    }
    const resume = await archiveResume(user.id, id);
    return NextResponse.json({
      resume: {
        id: resume.id,
        displayName: resume.displayName,
        status: resume.status,
        originalFilename: resume.originalFilename,
        byteSize: resume.byteSize,
        atsScore: resume.atsScore,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed.";
    const status = message === "Resume not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
