import { NextResponse } from "next/server";

import {
  deleteAdminJob,
  jobDeleteImpact,
  updateAdminJob,
  type AdminJobPatch,
} from "@/lib/admin-jobs";
import { requireApiAdmin } from "@/lib/api-session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Admin: what deleting this job would touch (for the confirm dialog). */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  return NextResponse.json({ impact: await jobDeleteImpact(id) });
}

/** Admin: edit any job (only the fields sent change). */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let body: AdminJobPatch;
  try {
    body = (await request.json()) as AdminJobPatch;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const job = await updateAdminJob(id, body);
    return NextResponse.json({ job: { id: job.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Job not found." ? 404 : 400 },
    );
  }
}

/** Admin: delete a job for everyone; applications and history are kept (unlinked). */
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    const impact = await deleteAdminJob(id);
    return NextResponse.json({ ok: true, impact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Job not found." ? 404 : 500 },
    );
  }
}
