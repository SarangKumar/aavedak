import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth";
import { listPendingApprovals } from "@/lib/user-approval";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const pending = await listPendingApprovals();
  return NextResponse.json({ pending, count: pending.length });
}
