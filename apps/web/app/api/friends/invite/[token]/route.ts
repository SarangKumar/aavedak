import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { acceptInvite, getFriendshipByToken } from "@/lib/friends";
import { getProfile } from "@/lib/profile";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const friendship = await getFriendshipByToken(token);
  if (!friendship || friendship.status === "revoked") {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  const inviter = await getProfile(friendship.inviterId);
  return NextResponse.json({
    status: friendship.status,
    inviter: inviter
      ? {
          userId: inviter.userId,
          username: inviter.username,
          name: inviter.name,
          imageUrl: inviter.imageUrl,
        }
      : null,
  });
}

export async function POST(_request: Request, ctx: Ctx) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  const { token } = await ctx.params;
  try {
    const result = await acceptInvite(token, authResult.user.id);
    const inviter = await getProfile(result.friendUserId);
    return NextResponse.json({
      ok: true,
      friendship: {
        id: result.friendship.id,
        status: result.friendship.status,
      },
      friend: inviter
        ? {
            userId: inviter.userId,
            username: inviter.username,
            name: inviter.name,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not accept invite.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
