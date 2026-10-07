import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  inviteFriendByUsername,
  listAcceptedFriends,
  listIncomingInvites,
  listOutgoingInvites,
  MAX_FRIENDS_ON_GRAPH,
} from "@/lib/friends";
import { ensureProfile } from "@/lib/profile";

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

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [friends, incoming, outgoing] = await Promise.all([
    listAcceptedFriends(user.id),
    listIncomingInvites(user.id),
    listOutgoingInvites(user.id),
  ]);

  return NextResponse.json({
    me: {
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
    },
    friends: friends.slice(0, MAX_FRIENDS_ON_GRAPH),
    friendCount: friends.length,
    maxOnGraph: MAX_FRIENDS_ON_GRAPH,
    incoming,
    outgoing,
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }
  try {
    const friendship = await inviteFriendByUsername(user.id, username);
    return NextResponse.json({ friendship }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invite failed." },
      { status: 400 },
    );
  }
}
