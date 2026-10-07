import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getJob, setJobIgnored } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const job = await getJob(auth.user.id, id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  await setJobIgnored(auth.user.id, id, true);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await setJobIgnored(auth.user.id, id, false);
  return NextResponse.json({ ok: true });
}
