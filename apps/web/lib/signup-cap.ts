import "server-only";

import { dbAll, dbRun } from "@/lib/app-db";
import { neonAuthBaseUrl } from "@/lib/db-config";

/** Only the earliest Google accounts may sign in. */
export const SIGNUP_CAP = 8;

export const SIGNUP_CLOSED_MESSAGE =
  "Sign-up is closed. Aavedak only accepts the first 8 Google accounts. This Google account is not one of them, so it was not added.";

type IdRow = { id: string };

function isMissingAuthTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /42P01|does not exist/i.test(message);
}

/** Earliest accounts win. Fewer than 8 existing rows means this account is still inside the cap. */
export async function isGoogleAccountAllowed(userId: string): Promise<boolean> {
  try {
    const rows = (await dbAll(
      `SELECT id
         FROM neon_auth."user"
        ORDER BY "createdAt" ASC, id ASC
        LIMIT ?`,
      SIGNUP_CAP,
    )) as IdRow[];
    const ids = rows.map((row) => String(row.id));
    if (ids.includes(userId)) return true;
    return ids.length < SIGNUP_CAP;
  } catch (err) {
    if (isMissingAuthTable(err)) return true;
    throw err;
  }
}

export async function signupCapReached(): Promise<boolean> {
  try {
    const rows = (await dbAll(
      `SELECT id FROM neon_auth."user" ORDER BY "createdAt" ASC LIMIT ?`,
      SIGNUP_CAP,
    )) as IdRow[];
    return rows.length >= SIGNUP_CAP;
  } catch (err) {
    if (isMissingAuthTable(err)) return false;
    throw err;
  }
}

async function deleteAuthRows(userId: string): Promise<void> {
  const statements = [
    `DELETE FROM neon_auth.session WHERE "userId" = ?`,
    `DELETE FROM neon_auth.account WHERE "userId" = ?`,
    `DELETE FROM neon_auth."user" WHERE id = ?`,
    `DELETE FROM profiles WHERE user_id = ?`,
  ];
  for (const sql of statements) {
    try {
      await dbRun(sql, userId);
    } catch (err) {
      if (isMissingAuthTable(err)) continue;
      const message = err instanceof Error ? err.message : String(err);
      if (/42P01|does not exist/i.test(message)) continue;
      throw err;
    }
  }
}

/** Remove an account that is outside the first 8. Accounts inside the cap are left as they are. */
export async function revokeOverCapAccount(userId: string): Promise<void> {
  if (await isGoogleAccountAllowed(userId)) return;
  await deleteAuthRows(userId);
}

function sessionCookiePair(setCookieLine: string): string | null {
  const pair = setCookieLine.split(";")[0]?.trim() ?? "";
  if (!/session_token=/i.test(pair)) return null;
  if (/max-age=0/i.test(setCookieLine)) return null;
  return pair;
}

/** Resolve the user id Neon just signed in, using the new session cookie. */
export async function userIdFromSessionSetCookie(setCookieLine: string): Promise<string | null> {
  const pair = sessionCookiePair(setCookieLine);
  const base = neonAuthBaseUrl()?.replace(/\/$/, "");
  if (pair && base) {
    try {
      const response = await fetch(`${base}/get-session`, {
        headers: { cookie: pair },
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const body = (await response.json()) as { user?: { id?: string } | null };
        if (body.user?.id) return String(body.user.id);
      }
    } catch {
      /* Fall through to the session table. */
    }
  }

  const rawValue = pair?.split("=").slice(1).join("=") ?? "";
  const token = decodeURIComponent(rawValue);
  const candidates = [token, token.split(".")[0]].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const rows = (await dbAll(
        `SELECT "userId" AS id FROM neon_auth.session WHERE token = ? LIMIT 1`,
        candidate,
      )) as IdRow[];
      if (rows[0]?.id) return String(rows[0].id);
    } catch (err) {
      if (isMissingAuthTable(err)) return null;
      throw err;
    }
  }
  return null;
}
