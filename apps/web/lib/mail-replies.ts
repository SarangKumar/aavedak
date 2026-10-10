import "server-only";

import { getSql } from "@/lib/app-db";
import {
  fetchThreadReplies,
  getGmailAuthStatus,
  getGoogleAccessTokenForUser,
  type GmailReply,
} from "@/lib/gmail";
import { bareAddress } from "@/lib/mail-reply-parse";

/** Threads checked per user per run. Keeps one run well inside the function time limit. */
const THREADS_PER_RUN = 40;
/** Only mails sent within this window are checked; older threads are rarely answered. */
const LOOKBACK_DAYS = 60;

export type ReplySyncResult =
  | { status: "skipped"; reason: string }
  | { status: "ok"; threadsChecked: number; newReplies: number; error?: string };

function newId(): string {
  return `rpl_${crypto.randomUUID()}`;
}

/**
 * A reply earns the person +1 only when they wrote it themselves: it comes from the address the
 * mail was sent to and is not an auto-reply, out-of-office notice or bounce.
 */
function earnsReplyCredit(personEmail: string | null, reply: GmailReply): boolean {
  if (!personEmail || reply.automated) return false;
  return reply.fromAddress === bareAddress(personEmail);
}

/**
 * Read replies to the user's sent referral / follow-up mails and store them. Threads are checked
 * oldest-checked first, so every thread is revisited in turn. Users without the read scope are
 * skipped (sending is unaffected). Idempotent: a reply is stored once per Gmail message id.
 */
export async function syncRepliesForUser(userId: string): Promise<ReplySyncResult> {
  const status = await getGmailAuthStatus(userId);
  if (!status.connected || !status.hasSendScope) {
    return { status: "skipped", reason: "Google account not connected for Gmail." };
  }
  if (!status.readReady) {
    return { status: "skipped", reason: "Reply detection is not authorized." };
  }

  const sql = getSql();
  const [user] = (await sql`SELECT email FROM "user" WHERE id = ${userId} LIMIT 1`) as Array<{
    email: string | null;
  }>;
  const userEmail = user?.email ?? "";

  const threads = (await sql`
    SELECT f.id, f.gmail_thread_id, f.person_id, p.email AS person_email
    FROM follow_up_tasks f
    LEFT JOIN people p ON p.id = f.person_id
    WHERE f.user_id = ${userId}
      AND f.status IN ('sent', 'sent_stub')
      AND f.gmail_thread_id IS NOT NULL
      AND f.created_at >= ${new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()}
    ORDER BY f.reply_checked_at ASC NULLS FIRST, f.created_at DESC
    LIMIT ${THREADS_PER_RUN}
  `) as Array<{
    id: string;
    gmail_thread_id: string;
    person_id: string | null;
    person_email: string | null;
  }>;

  if (threads.length === 0) {
    return { status: "ok", threadsChecked: 0, newReplies: 0 };
  }

  let token: string;
  try {
    ({ accessToken: token } = await getGoogleAccessTokenForUser(userId));
  } catch (err) {
    return {
      status: "ok",
      threadsChecked: 0,
      newReplies: 0,
      error: err instanceof Error ? err.message : "Could not get a Google access token.",
    };
  }

  let newReplies = 0;
  let checked = 0;
  let firstError: string | undefined;
  for (const thread of threads) {
    const now = new Date().toISOString();
    try {
      const replies = await fetchThreadReplies(token, thread.gmail_thread_id, userEmail);
      for (const reply of replies) {
        const inserted = (await sql`
          INSERT INTO mail_replies
            (id, user_id, follow_up_id, gmail_message_id, gmail_thread_id, from_address,
             subject, body_text, received_at, created_at)
          VALUES
            (${newId()}, ${userId}, ${thread.id}, ${reply.messageId}, ${reply.threadId},
             ${reply.fromAddress}, ${reply.subject}, ${reply.bodyText}, ${reply.receivedAt}, ${now})
          ON CONFLICT (user_id, gmail_message_id) DO NOTHING
          RETURNING id
        `) as Array<{ id: string }>;
        if (inserted.length > 0) {
          newReplies += 1;
          await sql`
            UPDATE follow_up_tasks
            SET replied_at = ${reply.receivedAt}, updated_at = ${now}
            WHERE id = ${thread.id} AND user_id = ${userId}
              AND (replied_at IS NULL OR replied_at < ${reply.receivedAt})
          `;
        }
        // Checked for every reply, not only new ones, so replies stored before credits
        // existed are credited when their thread is revisited. Idempotent per (person, user).
        if (earnsReplyCredit(thread.person_email, reply)) {
          await sql`
            INSERT INTO person_reply_credits
              (person_id, user_id, follow_up_id, gmail_message_id, created_at)
            VALUES (${thread.person_id}, ${userId}, ${thread.id}, ${reply.messageId}, ${now})
            ON CONFLICT (person_id, user_id) DO NOTHING
          `;
        }
      }
    } catch (err) {
      // Keep going: one bad thread should not hide replies in the others.
      firstError ??= err instanceof Error ? err.message : "Thread read failed.";
    }
    await sql`
      UPDATE follow_up_tasks SET reply_checked_at = ${now} WHERE id = ${thread.id} AND user_id = ${userId}
    `;
    checked += 1;
  }

  return { status: "ok", threadsChecked: checked, newReplies, error: firstError };
}

/** Daily cron: every user who granted reply detection. Errors are counted, not thrown. */
export async function syncRepliesForAllUsers(): Promise<{
  users: number;
  newReplies: number;
  failed: number;
}> {
  const rows = (await getSql()`
    SELECT DISTINCT user_id FROM follow_up_tasks
    WHERE status IN ('sent', 'sent_stub') AND gmail_thread_id IS NOT NULL
  `) as Array<{ user_id: string }>;
  let newReplies = 0;
  let failed = 0;
  let users = 0;
  for (const row of rows) {
    try {
      const result = await syncRepliesForUser(row.user_id);
      if (result.status === "ok") {
        users += 1;
        newReplies += result.newReplies;
        if (result.error) failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { users, newReplies, failed };
}

export type MailReplyDto = {
  id: string;
  followUpId: string;
  fromAddress: string;
  subject: string | null;
  bodyText: string;
  receivedAt: string;
};

/** The user's stored replies, grouped by the sent mail they answer, newest first. */
export async function listRepliesForUser(userId: string): Promise<Record<string, MailReplyDto[]>> {
  const rows = (await getSql()`
    SELECT id, follow_up_id, from_address, subject, body_text, received_at
    FROM mail_replies
    WHERE user_id = ${userId}
    ORDER BY received_at DESC
    LIMIT 500
  `) as Array<{
    id: string;
    follow_up_id: string;
    from_address: string;
    subject: string | null;
    body_text: string;
    received_at: string;
  }>;
  const grouped: Record<string, MailReplyDto[]> = {};
  for (const row of rows) {
    (grouped[row.follow_up_id] ??= []).push({
      id: row.id,
      followUpId: row.follow_up_id,
      fromAddress: row.from_address,
      subject: row.subject,
      bodyText: row.body_text,
      receivedAt: row.received_at,
    });
  }
  return grouped;
}
