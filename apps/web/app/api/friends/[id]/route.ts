import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { acceptFriendship, declineFriendship } from "@/lib/friends";
import { ensureProfile } from "@/lib/profile";

type Ctx = { params: Promise<{ id: string }> };

async function requireUser() {
  const session = await auth.api.getSession();
  if (!session?.user?.email) return null;
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
  return session.user;
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
  const action = body.action;
  try {
    if (action === "accept") {
      const friendship = await acceptFriendship(user.id, id);
      return NextResponse.json({
        friendship,
        notice:
          "Friendship is bidirectional. You can see their application history, and they can see yours.",
      });
    }
    if (action === "decline" || action === "cancel") {
      await declineFriendship(user.id, id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 400 },
    );
  }
}
