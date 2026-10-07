import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { downloadResumePdf } from "@/lib/gcs";
import { getGmailAuthStatus, parseQueuedMailNotes, sendGmailMessage } from "@/lib/gmail";
import { getResume } from "@/lib/resumes";

export type FollowUpStatus =
  "pending" | "queued" | "sent" | "sent_stub" | "failed" | "done" | "dismissed";

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
  mailTo: string | null;
  mailSubject: string | null;
  mailBody: string | null;
  gmailMessageId: string | null;
  sendError: string | null;
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
  mail_to: string | null;
  mail_subject: string | null;
  mail_body: string | null;
  gmail_message_id: string | null;
  send_error: string | null;
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
    mailTo: row.mail_to ?? null,
    mailSubject: row.mail_subject ?? null,
    mailBody: row.mail_body ?? null,
    gmailMessageId: row.gmail_message_id ?? null,
    sendError: row.send_error ?? null,
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
    value === "sent" ||
    value === "sent_stub" ||
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
  await ensureAppSchema();
  const includeClosed = opts?.includeClosed ?? false;
  const rows = includeClosed
    ? ((await getSql()`
        SELECT * FROM follow_up_tasks WHERE user_id = ${userId} ORDER BY
          CASE status
            WHEN 'queued' THEN 0
            WHEN 'pending' THEN 1
            WHEN 'failed' THEN 2
            WHEN 'sent' THEN 3
            WHEN 'sent_stub' THEN 4
            WHEN 'done' THEN 5
            ELSE 6
          END,
          send_after IS NULL, send_after ASC, due_date IS NULL, due_date ASC, updated_at DESC
      `) as Row[])
    : ((await getSql()`
        SELECT * FROM follow_up_tasks
        WHERE user_id = ${userId} AND status IN ('pending', 'queued', 'failed')
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
    mailTo?: string | null;
    mailSubject?: string | null;
    mailBody?: string | null;
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
  const mailTo = optional(input.mailTo);
  const mailSubject = optional(input.mailSubject);
  const mailBody = optional(input.mailBody);
  await getSql()`
    INSERT INTO follow_up_tasks
      (id, user_id, title, due_date, send_after, status, person_id, application_id, notes,
       mail_to, mail_subject, mail_body, created_at, updated_at)
    VALUES (
      ${id}, ${userId}, ${title}, ${dueDate}, ${sendAfter}, ${status}, ${personId},
      ${applicationId}, ${notes}, ${mailTo}, ${mailSubject}, ${mailBody}, ${now}, ${now}
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

export type ProcessQueueResult = {
  processed: FollowUpRecord[];
  sent: number;
  failed: number;
  skipped: number;
};

/**
 * Send due queued follow-ups via the user's Gmail API.
 * Cron-safe (no session). Items without Gmail auth / recipient stay queued or become failed.
 */
export async function processDueQueuedFollowUps(userId?: string): Promise<ProcessQueueResult> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  const rows = (
    userId
      ? await getSql()`
          SELECT * FROM follow_up_tasks
          WHERE user_id = ${userId} AND status = 'queued'
            AND send_after IS NOT NULL AND send_after <= ${now}
          ORDER BY send_after ASC
          LIMIT 50
        `
      : await getSql()`
          SELECT * FROM follow_up_tasks
          WHERE status = 'queued'
            AND send_after IS NOT NULL AND send_after <= ${now}
          ORDER BY send_after ASC
          LIMIT 100
        `
  ) as Row[];

  const processed: FollowUpRecord[] = [];
  let sent = 0;
  let failed = 0;

  // Cache Gmail readiness per user for this run
  const gmailReady = new Map<string, Awaited<ReturnType<typeof getGmailAuthStatus>>>();

  for (const row of rows) {
    const uid = row.user_id;
    let statusInfo = gmailReady.get(uid);
    if (!statusInfo) {
      statusInfo = await getGmailAuthStatus(uid);
      gmailReady.set(uid, statusInfo);
    }

    const parsed = parseQueuedMailNotes(row.notes);
    const mailTo = (row.mail_to || parsed.to || "").trim();
    const mailSubject = (row.mail_subject || parsed.subject || row.title || "").trim();
    const mailBody = (row.mail_body || parsed.body || "").trim();
    const mailFrom = (parsed.from || "").trim();

    if (!statusInfo.ready) {
      const err = statusInfo.reason || "Gmail not authorized.";
      await getSql()`
        UPDATE follow_up_tasks SET
          status = 'failed',
          send_error = ${err},
          updated_at = ${now}
        WHERE id = ${row.id}
      `;
      const updated = await getFollowUp(uid, row.id);
      if (updated) processed.push(updated);
      failed += 1;
      continue;
    }

    if (!mailTo || !mailTo.includes("@")) {
      const err = "Missing recipient email — cannot send.";
      await getSql()`
        UPDATE follow_up_tasks SET
          status = 'failed',
          send_error = ${err},
          updated_at = ${now}
        WHERE id = ${row.id}
      `;
      const updated = await getFollowUp(uid, row.id);
      if (updated) processed.push(updated);
      failed += 1;
      continue;
    }

    if (!mailBody) {
      const err = "Empty email body — cannot send.";
      await getSql()`
        UPDATE follow_up_tasks SET
          status = 'failed',
          send_error = ${err},
          updated_at = ${now}
        WHERE id = ${row.id}
      `;
      const updated = await getFollowUp(uid, row.id);
      if (updated) processed.push(updated);
      failed += 1;
      continue;
    }

    try {
      let attachment: { filename: string; mimeType: string; bytes: Buffer } | undefined;
      if (parsed.resumeId) {
        const resume = await getResume(uid, parsed.resumeId);
        if (resume?.storagePath) {
          const bytes = await downloadResumePdf(resume.storagePath);
          if (bytes) {
            attachment = {
              filename: resume.originalFilename || `${resume.displayName}.pdf`,
              mimeType: "application/pdf",
              bytes,
            };
          }
        }
      }
      const result = await sendGmailMessage({
        userId: uid,
        to: mailTo,
        from: mailFrom || "me",
        subject: mailSubject || row.title,
        body: mailBody,
        attachment,
      });
      const noteSuffix = `\n\n[sent via Gmail ${now} · id ${result.id}]`;
      const notes = (row.notes ?? "") + noteSuffix;
      await getSql()`
        UPDATE follow_up_tasks SET
          status = 'sent',
          notes = ${notes},
          mail_to = ${mailTo},
          mail_subject = ${mailSubject},
          mail_body = ${mailBody},
          gmail_message_id = ${result.id},
          send_error = NULL,
          updated_at = ${now}
        WHERE id = ${row.id}
      `;
      const updated = await getFollowUp(uid, row.id);
      if (updated) processed.push(updated);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gmail send failed.";
      // Auth problems → failed so UI can prompt re-consent; transient keep queued? Use failed.
      await getSql()`
        UPDATE follow_up_tasks SET
          status = 'failed',
          send_error = ${message.slice(0, 500)},
          updated_at = ${now}
        WHERE id = ${row.id}
      `;
      const updated = await getFollowUp(uid, row.id);
      if (updated) processed.push(updated);
      failed += 1;
    }
  }

  return { processed, sent, failed, skipped: 0 };
}
