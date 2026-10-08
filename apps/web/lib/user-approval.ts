import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { isAdminEmail } from "@/lib/admin";
import type { ApprovalStatus, PendingUserRow } from "@/lib/user-approval-shared";

export type { ApprovalStatus, PendingUserRow };
export {
  isApprovalStatus,
  PENDING_APPROVAL_MESSAGE,
  REJECTED_APPROVAL_MESSAGE,
} from "@/lib/user-approval-shared";

export function initialApprovalStatus(email: string | null | undefined): ApprovalStatus {
  return isAdminEmail(email) ? "approved" : "pending";
}

export async function countPendingApprovals(): Promise<number> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT COUNT(*)::int AS n FROM profiles WHERE approval_status = 'pending'
  `) as Array<{ n: number }>;
  return Number(rows[0]?.n) || 0;
}

export async function listPendingApprovals(): Promise<PendingUserRow[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT user_id, username, email, name, image_url, created_at
    FROM profiles
    WHERE approval_status = 'pending'
    ORDER BY created_at ASC
  `) as Array<{
    user_id: string;
    username: string;
    email: string | null;
    name: string | null;
    image_url: string | null;
    created_at: string;
  }>;
  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    email: r.email,
    name: r.name,
    imageUrl: r.image_url,
    createdAt: r.created_at,
  }));
}

export async function setApprovalStatus(userId: string, status: ApprovalStatus): Promise<boolean> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  const rows = (await getSql()`
    UPDATE profiles
    SET approval_status = ${status}, updated_at = ${now}
    WHERE user_id = ${userId}
    RETURNING user_id
  `) as Array<{ user_id: string }>;
  return Boolean(rows[0]);
}
