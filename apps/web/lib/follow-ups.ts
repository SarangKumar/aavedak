import "server-only";

import { randomUUID } from "node:crypto";

import { getAppDb } from "@/lib/app-db";

export type FollowUpStatus = "pending" | "queued" | "sent_stub" | "done" | "dismissed";

export type FollowUpRecord = {
  id: string;
  userId: string;
  title: string;
  dueDate: string | null;
  sendAfter: string | null;
  status: FollowUpStatus;
  personId: string | null;
  applicationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  send_after: string | null;
  status: FollowUpStatus;
  person_id: string | null;
  application_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): FollowUpRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    dueDate: row.due_date,
    sendAfter: row.send_after ?? null,
    status: row.status,
    personId: row.person_id,
    applicationId: row.application_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireTitle(title: unknown): string {
  if (typeof title !== "string" || !title.trim()) throw new Error("Title is required.");
  const t = title.trim();
  if (t.length > 200) throw new Error("Title is too long.");
  return t;
}

function optional(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function parseStatus(value: unknown, fallback: FollowUpStatus = "pending"): FollowUpStatus {
  if (
    value === "pending" ||
    value === "queued" ||
    value === "sent_stub" ||
    value === "done" ||
    value === "dismissed"
  ) {
    return value;
  }
  return fallback;
}

export function listFollowUps(
  userId: string,
  opts?: { includeClosed?: boolean },
): FollowUpRecord[] {
  const includeClosed = opts?.includeClosed ?? false;
  const sql = includeClosed
    ? `SELECT * FROM follow_up_tasks WHERE user_id = ? ORDER BY
         CASE status WHEN 'queued' THEN 0 WHEN 'pending' THEN 1 WHEN 'sent_stub' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
         send_after IS NULL, send_after ASC, due_date IS NULL, due_date ASC, updated_at DESC`
    : `SELECT * FROM follow_up_tasks WHERE user_id = ? AND status IN ('pending', 'queued')
       ORDER BY send_after IS NULL, send_after ASC, due_date IS NULL, due_date ASC, updated_at DESC`;
  const rows = getAppDb().prepare(sql).all(userId) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export function getFollowUp(userId: string, id: string): FollowUpRecord | null {
  const row = getAppDb()
    .prepare(`SELECT * FROM follow_up_tasks WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

export function createFollowUp(
  userId: string,
  input: {
    title: string;
    dueDate?: string | null;
    sendAfter?: string | null;
    personId?: string | null;
    applicationId?: string | null;
    notes?: string | null;
    status?: FollowUpStatus;
  },
): FollowUpRecord {
  const title = requireTitle(input.title);
  const id = randomUUID();
  const now = new Date().toISOString();
  const status = parseStatus(input.status, "pending");
  getAppDb()
    .prepare(
      `INSERT INTO follow_up_tasks
        (id, user_id, title, due_date, send_after, status, person_id, application_id, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      title,
      optional(input.dueDate),
      optional(input.sendAfter),
      status,
      optional(input.personId),
      optional(input.applicationId),
      optional(input.notes),
      now,
      now,
    );
  return getFollowUp(userId, id)!;
}

export function updateFollowUp(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    dueDate: string | null;
    status: FollowUpStatus;
    personId: string | null;
    applicationId: string | null;
    notes: string | null;
  }>,
): FollowUpRecord {
  const existing = getFollowUp(userId, id);
  if (!existing) throw new Error("Follow-up not found.");

  const title = patch.title !== undefined ? requireTitle(patch.title) : existing.title;
  const dueDate = patch.dueDate !== undefined ? optional(patch.dueDate) : existing.dueDate;
  const status =
    patch.status !== undefined ? parseStatus(patch.status, existing.status) : existing.status;
  const personId = patch.personId !== undefined ? optional(patch.personId) : existing.personId;
  const applicationId =
    patch.applicationId !== undefined ? optional(patch.applicationId) : existing.applicationId;
  const notes = patch.notes !== undefined ? optional(patch.notes) : existing.notes;

  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `UPDATE follow_up_tasks SET title = ?, due_date = ?, status = ?, person_id = ?,
         application_id = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(title, dueDate, status, personId, applicationId, notes, now, id, userId);
  return getFollowUp(userId, id)!;
}

/**
 * Deferred outreach processor stub.
 * Marks queued items whose send_after <= now as sent_stub.
 * Does NOT call Gmail — wire a real mailer here later (or cron hitting /api/referrals/process-queue).
 */
export function processDueQueuedFollowUps(userId?: string): {
  processed: FollowUpRecord[];
  skippedGmail: true;
} {
  const now = new Date().toISOString();
  const db = getAppDb();
  const rows = (
    userId
      ? db
          .prepare(
            `SELECT * FROM follow_up_tasks
             WHERE user_id = ? AND status = 'queued'
               AND send_after IS NOT NULL AND send_after <= ?
             ORDER BY send_after ASC`,
          )
          .all(userId, now)
      : db
          .prepare(
            `SELECT * FROM follow_up_tasks
             WHERE status = 'queued'
               AND send_after IS NOT NULL AND send_after <= ?
             ORDER BY send_after ASC`,
          )
          .all(now)
  ) as Array<Parameters<typeof mapRow>[0]>;

  const processed: FollowUpRecord[] = [];
  for (const row of rows) {
    const noteSuffix = "\n\n[scheduled send due — Gmail API not wired; marked sent_stub]";
    const notes = (row.notes ?? "") + noteSuffix;
    db.prepare(
      `UPDATE follow_up_tasks SET status = 'sent_stub', notes = ?, updated_at = ? WHERE id = ?`,
    ).run(notes, now, row.id);
    const updated = getFollowUp(row.user_id, row.id);
    if (updated) processed.push(updated);
  }
  return { processed, skippedGmail: true };
}
