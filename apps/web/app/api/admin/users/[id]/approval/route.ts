import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth";
import { setApprovalStatus } from "@/lib/user-approval";
import { isApprovalStatus } from "@/lib/user-approval-shared";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const session = await getServerSession();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  let body: { status?: string } = {};
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!isApprovalStatus(body.status) || body.status === "pending") {
    return NextResponse.json({ error: "status must be approved or rejected." }, { status: 400 });
  }

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot change your own approval." }, { status: 400 });
  }

  const ok = await setApprovalStatus(id, body.status);
  if (!ok) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status: body.status });
}
