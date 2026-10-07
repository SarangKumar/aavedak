import "server-only";

import { randomUUID } from "node:crypto";

import { dbAll, dbGet, dbRun } from "@/lib/app-db";
import { sendGmailMessage } from "@/lib/gmail";
import { getProfile } from "@/lib/profile";

export type FollowUpStatus =
  "pending" | "queued" | "sent_stub" | "sent" | "failed" | "done" | "dismissed";

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
  toEmail: string | null;
  subject: string | null;
  bodyText: string | null;
  gmailMessageId: string | null;
  lastError: string | null;
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
  to_email?: string | null;
  subject?: string | null;
  body_text?: string | null;
  gmail_message_id?: string | null;
  last_error?: string | null;
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
    toEmail: row.to_email ?? null,
    subject: row.subject ?? null,
    bodyText: row.body_text ?? null,
    gmailMessageId: row.gmail_message_id ?? null,
    lastError: row.last_error ?? null,
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
    value === "sent" ||
    value === "failed" ||
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
  const includeClosed = opts?.includeClosed ?? false;
  const sql = includeClosed
    ? `SELECT * FROM follow_up_tasks WHERE user_id = ? ORDER BY
         CASE status WHEN 'queued' THEN 0 WHEN 'pending' THEN 1 WHEN 'failed' THEN 2 WHEN 'sent' THEN 3 WHEN 'sent_stub' THEN 4 WHEN 'done' THEN 5 ELSE 6 END,
         send_after IS NULL, send_after ASC, due_date IS NULL, due_date ASC, updated_at DESC`
    : `SELECT * FROM follow_up_tasks WHERE user_id = ? AND status IN ('pending', 'queued')
       ORDER BY send_after IS NULL, send_after ASC, due_date IS NULL, due_date ASC, updated_at DESC`;
  const rows = (await dbAll(sql, userId)) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export async function getFollowUp(userId: string, id: string): Promise<FollowUpRecord | null> {
  const row = (await dbGet(
    `SELECT * FROM follow_up_tasks WHERE id = ? AND user_id = ?`,
    id,
    userId,
  )) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
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
    toEmail?: string | null;
    subject?: string | null;
    bodyText?: string | null;
  },
): Promise<FollowUpRecord> {
  const title = requireTitle(input.title);
  const id = randomUUID();
  const now = new Date().toISOString();
  const status = parseStatus(input.status, "pending");
  await dbRun(
    `INSERT INTO follow_up_tasks
        (id, user_id, title, due_date, send_after, status, person_id, application_id, notes,
         to_email, subject, body_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    title,
    optional(input.dueDate),
    optional(input.sendAfter),
    status,
    optional(input.personId),
    optional(input.applicationId),
    optional(input.notes),
    optional(input.toEmail),
    optional(input.subject),
    optional(input.bodyText),
    now,
    now,
  );
  const saved = await getFollowUp(userId, id);
  if (!saved) throw new Error("Follow-up not found.");
  return saved;
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
  await dbRun(
    `UPDATE follow_up_tasks SET title = ?, due_date = ?, status = ?, person_id = ?,
         application_id = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    title,
    dueDate,
    status,
    personId,
    applicationId,
    notes,
    now,
    id,
    userId,
  );
  const saved = await getFollowUp(userId, id);
  if (!saved) throw new Error("Follow-up not found.");
  return saved;
}

function payloadFromRow(row: Parameters<typeof mapRow>[0]): {
  to: string | null;
  subject: string;
  body: string | null;
} {
  const mapped = mapRow(row);
  if (mapped.toEmail || mapped.bodyText) {
    return {
      to: mapped.toEmail,
      subject: mapped.subject || mapped.title,
      body: mapped.bodyText,
    };
  }
  const notes = mapped.notes ?? "";
  const subject = notes.match(/^Subject: (.+)$/m)?.[1]?.trim() || mapped.title;
  const toMatch = notes.match(/^To: (\S+)/m)?.[1]?.trim() ?? "";
  const to = toMatch && !toMatch.startsWith("(") ? toMatch : null;
  const splitAt = notes.indexOf("\n\n");
  const body = splitAt >= 0 ? notes.slice(splitAt).trim() : null;
  return { to, subject, body };
}

/**
 * Sends queued follow-ups whose send_after is due, using the user's Google token.
 * Missing gmail.send scope marks the row failed and asks for a reconnect.
 */
export async function processDueQueuedFollowUps(userId?: string): Promise<{
  processed: FollowUpRecord[];
  sent: number;
  failed: number;
}> {
  const now = new Date().toISOString();
  const rows = userId
    ? await dbAll<Parameters<typeof mapRow>[0]>(
        `SELECT * FROM follow_up_tasks
           WHERE user_id = ? AND status = 'queued'
             AND send_after IS NOT NULL AND send_after <= ?
           ORDER BY send_after ASC`,
        userId,
        now,
      )
    : await dbAll<Parameters<typeof mapRow>[0]>(
        `SELECT * FROM follow_up_tasks
           WHERE status = 'queued'
             AND send_after IS NOT NULL AND send_after <= ?
           ORDER BY send_after ASC`,
        now,
      );

  const processed: FollowUpRecord[] = [];
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const payload = payloadFromRow(row);
    const profile = await getProfile(row.user_id);
    const fromEmail = profile?.email?.trim() || "";
    let status: FollowUpStatus = "failed";
    let lastError: string | null = null;
    let gmailMessageId: string | null = null;
    try {
      if (!fromEmail) throw new Error("Your profile has no email to send from.");
      if (!payload.to) throw new Error("Recipient has no email address.");
      if (!payload.body) throw new Error("Follow-up has no message body.");
      const result = await sendGmailMessage({
        userId: row.user_id,
        fromEmail,
        fromName: profile?.name,
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
      });
      status = "sent";
      gmailMessageId = result.messageId;
      sent += 1;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Gmail send failed.";
      failed += 1;
    }
    await dbRun(
      `UPDATE follow_up_tasks
       SET status = ?, gmail_message_id = ?, last_error = ?, updated_at = ?
       WHERE id = ?`,
      status,
      gmailMessageId,
      lastError,
      now,
      row.id,
    );
    const updated = await getFollowUp(row.user_id, row.id);
    if (updated) processed.push(updated);
  }
  return { processed, sent, failed };
}
