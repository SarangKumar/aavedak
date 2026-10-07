import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";

/** Hard product cap: only the first N Google accounts may use Aavedak. */
export const MAX_APP_USERS = 8;

export const USER_CAP_MESSAGE = "Aavedak is closed to new accounts.";

export class UserCapError extends Error {
  readonly code = "USER_CAP" as const;

  constructor(message = USER_CAP_MESSAGE) {
    super(message);
    this.name = "UserCapError";
  }
}

export function isUserCapError(err: unknown): err is UserCapError {
  return err instanceof UserCapError || (err as { code?: string })?.code === "USER_CAP";
}

export async function countAppUsers(): Promise<number> {
  await ensureAppSchema();
  const rows = (await getSql()`SELECT COUNT(*)::int AS n FROM profiles`) as Array<{ n: number }>;
  return Number(rows[0]?.n) || 0;
}

/** True if this user already has a profile, or slots remain for a new profile. */
export async function canAcceptUser(userId: string): Promise<boolean> {
  await ensureAppSchema();
  const existing = (await getSql()`
    SELECT 1 AS ok FROM profiles WHERE user_id = ${userId} LIMIT 1
  `) as Array<{ ok: number }>;
  if (existing[0]) return true;
  return (await countAppUsers()) < MAX_APP_USERS;
}

/**
 * Throw if a brand-new user cannot join (already at MAX_APP_USERS profiles).
 * Existing profiles always pass.
 */
export async function assertUserAllowed(userId: string): Promise<void> {
  if (!(await canAcceptUser(userId))) {
    throw new UserCapError();
  }
}
