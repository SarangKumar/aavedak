import { NextResponse } from "next/server";

import { applicationToDto, deleteApplication, updateApplication } from "@/lib/applications";
import { isApplicationStatus } from "@/lib/application-status";
import { requireApiUser } from "@/lib/api-session";

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const patch: Parameters<typeof updateApplication>[2] = {};
    if ("companyName" in body) patch.companyName = String(body.companyName ?? "");
    if ("companyId" in body) patch.companyId = (body.companyId as string | null) ?? null;
    if ("role" in body) patch.role = String(body.role ?? "");
    if ("location" in body) patch.location = String(body.location ?? "");
    if ("salaryCtc" in body) patch.salaryCtc = (body.salaryCtc as string | null) ?? null;
    if ("jobLink" in body) patch.jobLink = (body.jobLink as string | null) ?? null;
    if ("coverLetterId" in body)
      patch.coverLetterId = (body.coverLetterId as string | null) ?? null;
    if ("jobId" in body) patch.jobId = (body.jobId as string | null) ?? null;
    if ("notes" in body) patch.notes = (body.notes as string | null) ?? null;
    if ("appliedAt" in body) patch.appliedAt = (body.appliedAt as string | null) ?? null;
    if ("status" in body) {
      if (typeof body.status !== "string" || !isApplicationStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = body.status;
    }

    const application = await updateApplication(user.id, id, patch);
    return NextResponse.json({ application: applicationToDto(application) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    const status = message === "Application not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const { id } = await ctx.params;

  try {
    await deleteApplication(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed.";
    const status = message === "Application not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
