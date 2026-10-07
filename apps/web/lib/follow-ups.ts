import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";

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

type Row = {
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
};

function mapRow(row: Row): FollowUpRecord {
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

export async function listFollowUps(
  userId: string,
  opts?: { includeClosed?: boolean },
): Promise<FollowUpRecord[]> {
  await ensureAppSchema();
  const includeClosed = opts?.includeClosed ?? false;
  const rows = includeClosed
    ? ((await getSql()`
        SELECT * FROM follow_up_tasks WHERE user_id = ${userId} ORDER BY
          CASE status WHEN 'queued' THEN 0 WHEN 'pending' THEN 1 WHEN 'sent_stub' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
          send_after IS NULL, send_after ASC, due_date IS NULL, due_date ASC, updated_at DESC
      `) as Row[])
    : ((await getSql()`
        SELECT * FROM follow_up_tasks
        WHERE user_id = ${userId} AND status IN ('pending', 'queued')
        ORDER BY send_after IS NULL, send_after ASC, due_date IS NULL, due_date ASC, updated_at DESC
      `) as Row[]);
  return rows.map(mapRow);
}

export async function getFollowUp(userId: string, id: string): Promise<FollowUpRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM follow_up_tasks WHERE id = ${id} AND user_id = ${userId}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createFollowUp(
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
): Promise<FollowUpRecord> {
  await ensureAppSchema();
  const title = requireTitle(input.title);
  const id = randomUUID();
  const now = new Date().toISOString();
  const status = parseStatus(input.status, "pending");
  const dueDate = optional(input.dueDate);
  const sendAfter = optional(input.sendAfter);
  const personId = optional(input.personId);
  const applicationId = optional(input.applicationId);
  const notes = optional(input.notes);
  await getSql()`
    INSERT INTO follow_up_tasks
      (id, user_id, title, due_date, send_after, status, person_id, application_id, notes, created_at, updated_at)
    VALUES (
      ${id}, ${userId}, ${title}, ${dueDate}, ${sendAfter}, ${status}, ${personId},
      ${applicationId}, ${notes}, ${now}, ${now}
    )
  `;
  const created = await getFollowUp(userId, id);
  if (!created) throw new Error("Failed to create follow-up.");
  return created;
}

export async function updateFollowUp(
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
): Promise<FollowUpRecord> {
  await ensureAppSchema();
  const existing = await getFollowUp(userId, id);
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
  await getSql()`
    UPDATE follow_up_tasks SET
      title = ${title}, due_date = ${dueDate}, status = ${status}, person_id = ${personId},
      application_id = ${applicationId}, notes = ${notes}, updated_at = ${now}
    WHERE id = ${id} AND user_id = ${userId}
  `;
  const updated = await getFollowUp(userId, id);
  if (!updated) throw new Error("Follow-up not found after update.");
  return updated;
}

export async function processDueQueuedFollowUps(userId?: string): Promise<{
  processed: FollowUpRecord[];
  skippedGmail: true;
}> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  const rows = (
    userId
      ? await getSql()`
          SELECT * FROM follow_up_tasks
          WHERE user_id = ${userId} AND status = 'queued'
            AND send_after IS NOT NULL AND send_after <= ${now}
          ORDER BY send_after ASC
        `
      : await getSql()`
          SELECT * FROM follow_up_tasks
          WHERE status = 'queued'
            AND send_after IS NOT NULL AND send_after <= ${now}
          ORDER BY send_after ASC
        `
  ) as Row[];

  const processed: FollowUpRecord[] = [];
  for (const row of rows) {
    const noteSuffix = "\n\n[scheduled send due — Gmail API not wired; marked sent_stub]";
    const notes = (row.notes ?? "") + noteSuffix;
    await getSql()`
      UPDATE follow_up_tasks SET status = 'sent_stub', notes = ${notes}, updated_at = ${now}
      WHERE id = ${row.id}
    `;
    const updated = await getFollowUp(row.user_id, row.id);
    if (updated) processed.push(updated);
  }
  return { processed, skippedGmail: true };
}
