import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getApplication, updateApplication } from "@/lib/applications";
import { isApplicationStatus } from "@/lib/application-status";
import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";

type Ctx = { params: Promise<{ id: string }> };

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

function toDto(app: NonNullable<ReturnType<typeof getApplication>>) {
  return {
    id: app.id,
    companyName: app.companyName,
    role: app.role,
    location: app.location,
    salaryCtc: app.salaryCtc,
    jobLink: app.jobLink,
    jobId: app.jobId,
    status: app.status,
    notes: app.notes,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
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
    const patch: Parameters<typeof updateApplication>[2] = {};
    if ("companyName" in body) patch.companyName = String(body.companyName ?? "");
    if ("role" in body) patch.role = String(body.role ?? "");
    if ("location" in body) patch.location = String(body.location ?? "");
    if ("salaryCtc" in body) patch.salaryCtc = (body.salaryCtc as string | null) ?? null;
    if ("jobLink" in body) patch.jobLink = (body.jobLink as string | null) ?? null;
    if ("jobId" in body) patch.jobId = (body.jobId as string | null) ?? null;
    if ("notes" in body) patch.notes = (body.notes as string | null) ?? null;
    if ("status" in body) {
      if (typeof body.status !== "string" || !isApplicationStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      patch.status = body.status;
    }

    const application = updateApplication(user.id, id, patch);
    return NextResponse.json({ application: toDto(application) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    const status = message === "Application not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
