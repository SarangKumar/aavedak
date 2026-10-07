import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";

export type FriendshipStatus = "pending" | "accepted" | "declined" | "revoked";

export type FriendshipRecord = {
  id: string;
  inviterId: string;
  inviteeId: string | null;
  inviteToken: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
};

export type FriendSummary = {
  userId: string;
  username: string;
  name: string | null;
  imageUrl: string | null;
  friendshipId: string;
  since: string | null;
};

type FriendshipRow = {
  id: string;
  inviter_id: string;
  invitee_id: string | null;
  invite_token: string;
  status: string;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
};

function mapFriendship(row: FriendshipRow): FriendshipRecord {
  return {
    id: row.id,
    inviterId: row.inviter_id,
    inviteeId: row.invitee_id,
    inviteToken: row.invite_token,
    status: row.status as FriendshipStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
  };
}

function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function getFriendshipByToken(token: string): Promise<FriendshipRecord | null> {
  await ensureAppSchema();
  const trimmed = token.trim();
  if (!trimmed) return null;
  const rows = (await getSql()`
    SELECT * FROM friendships WHERE invite_token = ${trimmed} LIMIT 1
  `) as FriendshipRow[];
  return rows[0] ? mapFriendship(rows[0]) : null;
}

/** Create or reuse a pending invite link for the inviter. */
export async function getOrCreateInviteLink(inviterId: string): Promise<FriendshipRecord> {
  await ensureAppSchema();
  const existing = (await getSql()`
    SELECT * FROM friendships
    WHERE inviter_id = ${inviterId} AND status = 'pending' AND invitee_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `) as FriendshipRow[];
  if (existing[0]) return mapFriendship(existing[0]);

  const id = randomUUID();
  const now = new Date().toISOString();
  const token = newInviteToken();
  await getSql()`
    INSERT INTO friendships (id, inviter_id, invitee_id, invite_token, status, created_at, updated_at, accepted_at)
    VALUES (${id}, ${inviterId}, NULL, ${token}, 'pending', ${now}, ${now}, NULL)
  `;
  const created = await getFriendshipByToken(token);
  if (!created) throw new Error("Failed to create invite.");
  return created;
}

export async function rotateInviteLink(inviterId: string): Promise<FriendshipRecord> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  await getSql()`
    UPDATE friendships
    SET status = 'revoked', updated_at = ${now}
    WHERE inviter_id = ${inviterId} AND status = 'pending' AND invitee_id IS NULL
  `;
  return getOrCreateInviteLink(inviterId);
}

export async function listFriends(userId: string): Promise<FriendSummary[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT
      f.id AS friendship_id,
      f.accepted_at,
      f.updated_at,
      CASE WHEN f.inviter_id = ${userId} THEN f.invitee_id ELSE f.inviter_id END AS friend_user_id,
      p.username,
      p.name,
      p.image_url
    FROM friendships f
    JOIN profiles p
      ON p.user_id = CASE WHEN f.inviter_id = ${userId} THEN f.invitee_id ELSE f.inviter_id END
    WHERE f.status = 'accepted'
      AND (f.inviter_id = ${userId} OR f.invitee_id = ${userId})
      AND CASE WHEN f.inviter_id = ${userId} THEN f.invitee_id ELSE f.inviter_id END IS NOT NULL
    ORDER BY COALESCE(f.accepted_at, f.updated_at) DESC
  `) as Array<{
    friendship_id: string;
    accepted_at: string | null;
    updated_at: string;
    friend_user_id: string;
    username: string;
    name: string | null;
    image_url: string | null;
  }>;

  return rows.map((r) => ({
    userId: r.friend_user_id,
    username: r.username,
    name: r.name,
    imageUrl: r.image_url,
    friendshipId: r.friendship_id,
    since: r.accepted_at ?? r.updated_at,
  }));
}

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT id FROM friendships
    WHERE status = 'accepted'
      AND (
        (inviter_id = ${userA} AND invitee_id = ${userB})
        OR (inviter_id = ${userB} AND invitee_id = ${userA})
      )
    LIMIT 1
  `) as Array<{ id: string }>;
  return Boolean(rows[0]);
}

export async function acceptInvite(
  token: string,
  inviteeId: string,
): Promise<{ friendship: FriendshipRecord; friendUserId: string }> {
  await ensureAppSchema();
  const friendship = await getFriendshipByToken(token);
  if (!friendship) throw new Error("Invite not found.");
  if (friendship.status === "revoked") throw new Error("This invite link was revoked.");
  if (friendship.status === "declined") throw new Error("This invite was declined.");
  if (friendship.inviterId === inviteeId) {
    throw new Error("You cannot accept your own invite.");
  }

  // Already accepted with this token (same invitee)
  if (friendship.status === "accepted") {
    if (friendship.inviteeId === inviteeId) {
      return { friendship, friendUserId: friendship.inviterId };
    }
    throw new Error("This invite was already used.");
  }

  if (friendship.status !== "pending") {
    throw new Error("Invite is no longer valid.");
  }

  const already = await areFriends(friendship.inviterId, inviteeId);
  if (already) {
    const now = new Date().toISOString();
    await getSql()`
      UPDATE friendships
      SET status = 'accepted', invitee_id = ${inviteeId}, accepted_at = COALESCE(accepted_at, ${now}), updated_at = ${now}
      WHERE id = ${friendship.id}
    `;
    const updated = await getFriendshipByToken(token);
    if (!updated) throw new Error("Could not update friendship.");
    return { friendship: updated, friendUserId: friendship.inviterId };
  }

  const now = new Date().toISOString();
  await getSql()`
    UPDATE friendships
    SET invitee_id = ${inviteeId}, status = 'accepted', accepted_at = ${now}, updated_at = ${now}
    WHERE id = ${friendship.id} AND status = 'pending'
  `;

  // Mint a fresh pending invite for the inviter so they can invite others with a new link
  await getOrCreateInviteLink(friendship.inviterId);

  const updated = await getFriendshipByToken(token);
  if (!updated || updated.status !== "accepted") {
    throw new Error("Could not accept invite.");
  }
  return { friendship: updated, friendUserId: friendship.inviterId };
}

export async function removeFriendship(userId: string, friendshipId: string): Promise<void> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM friendships WHERE id = ${friendshipId} LIMIT 1
  `) as FriendshipRow[];
  const row = rows[0];
  if (!row) throw new Error("Friendship not found.");
  if (row.inviter_id !== userId && row.invitee_id !== userId) {
    throw new Error("Friendship not found.");
  }
  const now = new Date().toISOString();
  await getSql()`
    UPDATE friendships SET status = 'revoked', updated_at = ${now} WHERE id = ${friendshipId}
  `;
}
