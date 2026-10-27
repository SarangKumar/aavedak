import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { deleteResumeCreatorStyle } from "@/lib/resume-creator-styles";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await deleteResumeCreatorStyle(auth.user.id, id);
  return NextResponse.json({ ok: true });
}
