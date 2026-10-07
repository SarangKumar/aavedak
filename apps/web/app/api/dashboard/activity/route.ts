import { NextResponse } from "next/server";

import { getApplicationsPerDay, parseActivityRange } from "@/lib/application-activity";
import { requireApiUser } from "@/lib/api-session";
import { listFriends } from "@/lib/friends";

const MAX_FRIENDS_ON_CHART = 10;

export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  const url = new URL(request.url);
  const months = parseActivityRange(url.searchParams.get("months"));

  const mine = await getApplicationsPerDay(authResult.user.id, months);
  const friends = (await listFriends(authResult.user.id)).slice(0, MAX_FRIENDS_ON_CHART);

  const friendSeries = await Promise.all(
    friends.map(async (f) => ({
      userId: f.userId,
      username: f.username,
      name: f.name,
      isMe: false as const,
      days: await getApplicationsPerDay(f.userId, months),
    })),
  );

  return NextResponse.json({
    months,
    series: [
      {
        userId: authResult.user.id,
        username: "you",
        name: authResult.user.name ?? "You",
        isMe: true,
        days: mine,
      },
      ...friendSeries,
    ],
    // Legacy shape kept for older clients
    mine,
    friends,
    friend: friendSeries[0]
      ? {
          userId: friendSeries[0].userId,
          username: friendSeries[0].username,
          name: friendSeries[0].name,
          days: friendSeries[0].days,
        }
      : null,
  });
}
