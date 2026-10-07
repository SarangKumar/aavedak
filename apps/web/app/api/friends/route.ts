import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import {
  getOrCreateInviteLink,
  listFriends,
  removeFriendship,
  rotateInviteLink,
} from "@/lib/friends";
import { getSiteUrl } from "@/lib/site";

export async function GET() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  const friends = await listFriends(authResult.user.id);
  const invite = await getOrCreateInviteLink(authResult.user.id);
  const inviteUrl = `${getSiteUrl()}/friends/invite/${invite.inviteToken}`;

  return NextResponse.json({
    friends,
    invite: {
      token: invite.inviteToken,
      url: inviteUrl,
      createdAt: invite.createdAt,
    },
  });
}

export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    body = {};
  }

  const action = body.action ?? "invite";
  const invite =
    action === "rotate"
      ? await rotateInviteLink(authResult.user.id)
      : await getOrCreateInviteLink(authResult.user.id);

  return NextResponse.json({
    invite: {
      token: invite.inviteToken,
      url: `${getSiteUrl()}/friends/invite/${invite.inviteToken}`,
      createdAt: invite.createdAt,
    },
  });
}

export async function DELETE(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  let body: { friendshipId?: string };
  try {
    body = (await request.json()) as { friendshipId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.friendshipId?.trim()) {
    return NextResponse.json({ error: "friendshipId is required." }, { status: 400 });
  }

  try {
    await removeFriendship(authResult.user.id, body.friendshipId.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove friend.";
    const status = message === "Friendship not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
