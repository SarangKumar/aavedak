import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { archiveResume, updateResume, type ResumeStatus } from "@/lib/resumes";

type Ctx = { params: Promise<{ id: string }> };

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

export async function PATCH(request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

export async function DELETE(_request: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const resume = await archiveResume(user.id, id);
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
    const message = err instanceof Error ? err.message : "Archive failed.";
    const status = message === "Resume not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
