import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { reRequestApproval } from "@/lib/user-approval";

/** Rejected users can send a fresh access request (status → pending). */
export async function POST() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const profile = await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  if (profile.approvalStatus === "approved") {
    return NextResponse.json({ ok: true, status: "approved" });
  }
  if (profile.approvalStatus === "pending") {
    return NextResponse.json({ ok: true, status: "pending" });
  }

  const ok = await reRequestApproval(session.user.id);
  if (!ok) {
    return NextResponse.json({ error: "Could not re-request access." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, status: "pending" });
}
