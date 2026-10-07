import "server-only";

import { getAppDb } from "@/lib/app-db";
import { usernameFromUser } from "@/lib/username";

export type Profile = {
  userId: string;
  username: string;
  email: string | null;
  name: string | null;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

function slugBaseFromEmail(email: string): string {
  return usernameFromUser({ email });
}

function allocateUsername(email: string, userId: string): string {
  const db = getAppDb();
  const base = slugBaseFromEmail(email) || "user";
  let candidate = base;
  let n = 2;
  for (;;) {
    const row = db
      .prepare(`SELECT user_id FROM profiles WHERE username = ? LIMIT 1`)
      .get(candidate) as { user_id: string } | undefined;
    if (!row || row.user_id === userId) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
    if (n > 10_000) {
      candidate = `${base}-${userId.slice(0, 6)}`;
      return candidate;
    }
  }
}

export function getProfile(userId: string): Profile | null {
  const row = getAppDb()
    .prepare(
      `SELECT user_id, username, email, name, onboarding_complete, created_at, updated_at
       FROM profiles WHERE user_id = ?`,
    )
    .get(userId) as
    | {
        user_id: string;
        username: string;
        email: string | null;
        name: string | null;
        onboarding_complete: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    name: row.name,
    onboardingComplete: Boolean(row.onboarding_complete),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Ensure a stable username exists for this auth user (email local-part + suffix). */
export function ensureProfile(user: { id: string; email: string; name?: string | null }): Profile {
  const existing = getProfile(user.id);
  const now = new Date().toISOString();
  const db = getAppDb();

  if (existing) {
    db.prepare(`UPDATE profiles SET email = ?, name = ?, updated_at = ? WHERE user_id = ?`).run(
      user.email,
      user.name ?? null,
      now,
      user.id,
    );
    return { ...existing, email: user.email, name: user.name ?? null, updatedAt: now };
  }

  const username = allocateUsername(user.email, user.id);
  db.prepare(
    `INSERT INTO profiles (user_id, username, email, name, onboarding_complete, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run(user.id, username, user.email, user.name ?? null, now, now);

  return {
    userId: user.id,
    username,
    email: user.email,
    name: user.name ?? null,
    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function setOnboardingComplete(userId: string, complete: boolean) {
  const now = new Date().toISOString();
  getAppDb()
    .prepare(`UPDATE profiles SET onboarding_complete = ?, updated_at = ? WHERE user_id = ?`)
    .run(complete ? 1 : 0, now, userId);
}

export function getProfileByUsername(username: string): Profile | null {
  const row = getAppDb()
    .prepare(
      `SELECT user_id, username, email, name, onboarding_complete, created_at, updated_at
       FROM profiles WHERE username = ? COLLATE NOCASE`,
    )
    .get(username) as
    | {
        user_id: string;
        username: string;
        email: string | null;
        name: string | null;
        onboarding_complete: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    name: row.name,
    onboardingComplete: Boolean(row.onboarding_complete),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
