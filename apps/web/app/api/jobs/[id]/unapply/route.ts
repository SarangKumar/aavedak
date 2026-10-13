import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { unapplyJob } from "@/lib/applications";
import { getJob } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

/** Mark a job as unapplied: only the signed-in user's own applications for it are removed. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const job = await getJob(auth.user.id, id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const result = await unapplyJob(auth.user.id, id);
  if (result.applications === 0) {
    return NextResponse.json({ error: "This job isn't marked as applied." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...result });
}
