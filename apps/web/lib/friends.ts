import "server-only";

import { randomUUID } from "node:crypto";

import { dbAll, dbGet, dbRun } from "@/lib/app-db";
import { getProfileByUsername } from "@/lib/profile";

export const MAX_FRIENDS_ON_GRAPH = 10;

export type FriendshipStatus = "pending" | "accepted" | "declined";

export type FriendshipRecord = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
};

export type FriendNode = {
  userId: string;
  username: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  since: string;
};

function mapRow(row: {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}): FriendshipRecord {
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function profileBrief(userId: string): Promise<FriendNode | null> {
  const profile = await dbGet<{
    user_id: string;
    username: string;
    name: string | null;
    email: string | null;
    image_url: string | null;
  }>(
    `SELECT user_id, username, name, email, image_url FROM profiles WHERE user_id = ? LIMIT 1`,
    userId,
  );
  if (!profile) return null;
  return {
    userId: profile.user_id,
    username: profile.username,
    name: profile.name?.trim() || profile.username,
    email: profile.email,
    imageUrl: profile.image_url,
    since: "",
  };
}

export async function listAcceptedFriends(userId: string): Promise<FriendNode[]> {
  const rows = (await dbAll(
    `SELECT * FROM friendships
      WHERE status = 'accepted'
        AND (requester_id = ? OR addressee_id = ?)
      ORDER BY updated_at DESC`,
    userId,
    userId,
  )) as Array<Parameters<typeof mapRow>[0]>;

  const friends: FriendNode[] = [];
  for (const row of rows) {
    const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    const brief = await profileBrief(otherId);
    if (!brief) continue;
    friends.push({ ...brief, since: row.updated_at || row.created_at });
  }
  return friends;
}

export async function listIncomingInvites(
  userId: string,
): Promise<Array<{ friendship: FriendshipRecord; from: FriendNode }>> {
  const rows = (await dbAll(
    `SELECT * FROM friendships WHERE addressee_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    userId,
  )) as Array<Parameters<typeof mapRow>[0]>;
  const out: Array<{ friendship: FriendshipRecord; from: FriendNode }> = [];
  for (const row of rows) {
    const from = await profileBrief(row.requester_id);
    if (!from) continue;
    out.push({ friendship: mapRow(row), from: { ...from, since: row.created_at } });
  }
  return out;
}

export async function listOutgoingInvites(
  userId: string,
): Promise<Array<{ friendship: FriendshipRecord; to: FriendNode }>> {
  const rows = (await dbAll(
    `SELECT * FROM friendships WHERE requester_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    userId,
  )) as Array<Parameters<typeof mapRow>[0]>;
  const out: Array<{ friendship: FriendshipRecord; to: FriendNode }> = [];
  for (const row of rows) {
    const to = await profileBrief(row.addressee_id);
    if (!to) continue;
    out.push({ friendship: mapRow(row), to: { ...to, since: row.created_at } });
  }
  return out;
}

async function existingPair(a: string, b: string): Promise<FriendshipRecord | null> {
  const row = (await dbGet(
    `SELECT * FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?)
         OR (requester_id = ? AND addressee_id = ?)
      LIMIT 1`,
    a,
    b,
    b,
    a,
  )) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export async function inviteFriendByUsername(
  requesterId: string,
  username: string,
): Promise<FriendshipRecord> {
  const target = await getProfileByUsername(username.trim());
  if (!target) throw new Error("No Aavedak profile matches that username.");
  if (target.userId === requesterId) throw new Error("You cannot friend yourself.");

  const existing = await existingPair(requesterId, target.userId);
  if (existing?.status === "accepted") throw new Error("You are already friends.");
  if (existing?.status === "pending") {
    if (existing.requesterId === requesterId) throw new Error("Invite already sent.");
    return acceptFriendship(requesterId, existing.id);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
    id,
    requesterId,
    target.userId,
    now,
    now,
  );
  const saved = await dbGet(`SELECT * FROM friendships WHERE id = ?`, id);
  if (!saved) throw new Error("Invite was not saved.");
  return mapRow(saved as Parameters<typeof mapRow>[0]);
}

export async function acceptFriendship(
  userId: string,
  friendshipId: string,
): Promise<FriendshipRecord> {
  const row = (await dbGet(`SELECT * FROM friendships WHERE id = ?`, friendshipId)) as
    Parameters<typeof mapRow>[0] | undefined;
  if (!row) throw new Error("Invite not found.");
  if (row.addressee_id !== userId) throw new Error("Only the invited person can accept.");
  if (row.status !== "pending") throw new Error("This invite is no longer pending.");

  const now = new Date().toISOString();
  await dbRun(
    `UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?`,
    now,
    friendshipId,
  );
  const saved = (await dbGet(`SELECT * FROM friendships WHERE id = ?`, friendshipId)) as
    Parameters<typeof mapRow>[0] | undefined;
  if (!saved) throw new Error("Friendship not found.");
  return mapRow(saved);
}

export async function declineFriendship(userId: string, friendshipId: string): Promise<void> {
  const row = (await dbGet(`SELECT * FROM friendships WHERE id = ?`, friendshipId)) as
    Parameters<typeof mapRow>[0] | undefined;
  if (!row) throw new Error("Invite not found.");
  if (row.addressee_id !== userId && row.requester_id !== userId) {
    throw new Error("Invite not found.");
  }
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE friendships SET status = 'declined', updated_at = ? WHERE id = ?`,
    now,
    friendshipId,
  );
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const pair = await existingPair(a, b);
  return pair?.status === "accepted";
}

export async function listFriendApplications(
  viewerId: string,
  friendUserId: string,
): Promise<Array<Record<string, unknown>>> {
  if (!(await areFriends(viewerId, friendUserId))) {
    throw new Error("Friend application history is only visible between accepted friends.");
  }
  return dbAll(
    `SELECT id, company_name, role, location, status, applied_at, created_at, updated_at
       FROM applications
      WHERE user_id = ? AND status != 'archived'
      ORDER BY updated_at DESC
      LIMIT 100`,
    friendUserId,
  );
}

export type ApplicationSeriesPoint = {
  date: string;
  cumulative: number;
};

export type FriendApplicationSeries = {
  userId: string;
  name: string;
  username?: string;
  isMe: boolean;
  color: string;
  points: ApplicationSeriesPoint[];
};

/** Distinct hues: you first (primary teal), then friends. */
const SERIES_COLORS = [
  "oklch(0.62 0.14 155)", // you — green primary
  "oklch(0.68 0.14 230)", // friend — blue
  "oklch(0.70 0.14 40)", // amber
  "oklch(0.66 0.15 320)", // magenta
  "oklch(0.65 0.12 100)", // olive
  "oklch(0.68 0.13 280)", // violet
  "oklch(0.70 0.12 20)", // coral
  "oklch(0.64 0.11 180)", // cyan
  "oklch(0.67 0.13 60)", // gold
  "oklch(0.63 0.12 300)", // purple
  "oklch(0.69 0.11 140)", // mint
] as const;

async function applicationDayKeys(userId: string): Promise<string[]> {
  const rows = (await dbAll(
    `SELECT substr(COALESCE(applied_at, created_at), 1, 10) AS day
       FROM applications
      WHERE user_id = ? AND status != 'archived'
        AND COALESCE(applied_at, created_at) IS NOT NULL
      ORDER BY day ASC`,
    userId,
  )) as Array<{ day: string | null }>;
  return rows
    .map((row) => row.day)
    .filter((day): day is string => Boolean(day && /^\d{4}-\d{2}-\d{2}/.test(day)));
}

function buildCumulativeSeries(dayKeys: string[]): ApplicationSeriesPoint[] {
  const counts = new Map<string, number>();
  for (const day of dayKeys) {
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const sorted = [...counts.keys()].sort();
  let running = 0;
  return sorted.map((date) => {
    running += counts.get(date) ?? 0;
    return { date, cumulative: running };
  });
}

/**
 * One series per person (you + up to MAX_FRIENDS_ON_GRAPH friends) for a shared
 * multi-line application-history chart.
 */
export async function buildFriendGraphSeries(
  viewerId: string,
  viewerName: string,
): Promise<FriendApplicationSeries[]> {
  const friends = (await listAcceptedFriends(viewerId)).slice(0, MAX_FRIENDS_ON_GRAPH);
  const meDays = await applicationDayKeys(viewerId);
  const series: FriendApplicationSeries[] = [
    {
      userId: viewerId,
      name: viewerName || "You",
      isMe: true,
      color: SERIES_COLORS[0],
      points: buildCumulativeSeries(meDays),
    },
  ];

  for (let i = 0; i < friends.length; i++) {
    const friend = friends[i]!;
    const days = await applicationDayKeys(friend.userId);
    series.push({
      userId: friend.userId,
      name: friend.name,
      username: friend.username,
      isMe: false,
      color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length]!,
      points: buildCumulativeSeries(days),
    });
  }

  return series;
}
