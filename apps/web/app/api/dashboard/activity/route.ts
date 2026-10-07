import { NextResponse } from "next/server";

import {
  getApplicationsPerDay,
  parseActivityRange,
  type ActivityRangeMonths,
} from "@/lib/application-activity";
import { requireApiUser } from "@/lib/api-session";
import { areFriends, listFriends } from "@/lib/friends";

export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  const url = new URL(request.url);
  const months = parseActivityRange(url.searchParams.get("months"));
  const friendId = url.searchParams.get("friendId")?.trim() || null;

  const mine = await getApplicationsPerDay(authResult.user.id, months);
  const friends = await listFriends(authResult.user.id);

  let friendSeries: {
    userId: string;
    username: string;
    name: string | null;
    days: Awaited<ReturnType<typeof getApplicationsPerDay>>;
  } | null = null;

  if (friendId) {
    const allowed = await areFriends(authResult.user.id, friendId);
    if (!allowed) {
      return NextResponse.json({ error: "Not friends with that user." }, { status: 403 });
    }
    const meta = friends.find((f) => f.userId === friendId);
    friendSeries = {
      userId: friendId,
      username: meta?.username ?? "friend",
      name: meta?.name ?? null,
      days: await getApplicationsPerDay(friendId, months as ActivityRangeMonths),
    };
  } else if (friends[0]) {
    const f = friends[0];
    friendSeries = {
      userId: f.userId,
      username: f.username,
      name: f.name,
      days: await getApplicationsPerDay(f.userId, months),
    };
  }

  return NextResponse.json({
    months,
    mine,
    friends,
    friend: friendSeries,
  });
}
