import "server-only";

import { auth } from "@/lib/auth";
import { getSql } from "@/lib/app-db";
import { GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE } from "@/lib/gmail-scopes";
import {
  extractPlainText,
  headerValue,
  bareAddress,
  isAutomatedReply,
  trimQuotedReply,
} from "@/lib/mail-reply-parse";

export { GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE } from "@/lib/gmail-scopes";

export type GmailAuthStatus = {
  connected: boolean;
  hasRefreshToken: boolean;
  hasSendScope: boolean;
  accountId: string | null;
  scope: string | null;
  /** True when user can queue+send mail. */
  ready: boolean;
  /** True when reply detection (gmail.readonly) has been granted. Optional: sending never needs it. */
  readReady: boolean;
  reason: string | null;
};

type AccountRow = {
  id: string;
  userId: string;
  providerId: string;
  scope: string | null;
  refreshToken: string | null;
  accessToken: string | null;
};

function parseScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Read scope for reply detection. gmail.modify and the full-mail scope also cover reading. */
export function scopesIncludeGmailRead(scope: string | null | undefined): boolean {
  const scopes = parseScopes(scope);
  return (
    scopes.includes(GMAIL_READ_SCOPE) ||
    scopes.includes("https://mail.google.com/") ||
    scopes.includes("https://www.googleapis.com/auth/gmail.modify")
  );
}

export function scopesIncludeGmailSend(scope: string | null | undefined): boolean {
  const scopes = parseScopes(scope);
  return (
    scopes.includes(GMAIL_SEND_SCOPE) ||
    scopes.includes("https://mail.google.com/") ||
    scopes.includes("https://www.googleapis.com/auth/gmail.modify")
  );
}

async function getGoogleAccountRow(userId: string): Promise<AccountRow | null> {
  const rows = (await getSql()`
    SELECT id, "userId", "providerId", scope, "refreshToken", "accessToken"
    FROM account
    WHERE "userId" = ${userId} AND "providerId" = 'google'
    LIMIT 1
  `) as AccountRow[];
  return rows[0] ?? null;
}

/** Public status for UI (no tokens). `readReady` is computed from the same scope string. */
export async function getGmailAuthStatus(userId: string): Promise<GmailAuthStatus> {
  const status = await getSendAuthStatus(userId);
  return { ...status, readReady: scopesIncludeGmailRead(status.scope) };
}

async function getSendAuthStatus(userId: string): Promise<Omit<GmailAuthStatus, "readReady">> {
  const account = await getGoogleAccountRow(userId);
  if (!account) {
    return {
      connected: false,
      hasRefreshToken: false,
      hasSendScope: false,
      accountId: null,
      scope: null,
      ready: false,
      reason: "Google account not linked. Sign in with Google again.",
    };
  }
  const hasRefreshToken = Boolean(account.refreshToken);
  const hasSendScope = scopesIncludeGmailSend(account.scope);
  if (!hasSendScope) {
    return {
      connected: true,
      hasRefreshToken,
      hasSendScope: false,
      accountId: account.id,
      scope: account.scope,
      ready: false,
      reason: "Gmail send permission missing. Re-authorize to grant gmail.send.",
    };
  }
  if (!hasRefreshToken) {
    return {
      connected: true,
      hasRefreshToken: false,
      hasSendScope: true,
      accountId: account.id,
      scope: account.scope,
      ready: false,
      reason: "Missing Google refresh token. Re-authorize with offline access (consent).",
    };
  }
  return {
    connected: true,
    hasRefreshToken: true,
    hasSendScope: true,
    accountId: account.id,
    scope: account.scope,
    ready: true,
    reason: null,
  };
}

/**
 * Valid Google access token for the user (refreshes via Better Auth when needed).
 * Works from cron with userId + accountId (no session cookies).
 */
export async function getGoogleAccessTokenForUser(userId: string): Promise<{
  accessToken: string;
  accountId: string;
}> {
  const account = await getGoogleAccountRow(userId);
  if (!account) {
    throw new Error("Google account not linked.");
  }
  if (!scopesIncludeGmailSend(account.scope)) {
    throw new Error("Gmail send scope not granted. Re-authorize Google.");
  }
  const tokens = await auth.api.getAccessToken({
    body: {
      accountId: account.id,
      userId,
    },
  });
  const accessToken = tokens?.accessToken;
  if (!accessToken) {
    throw new Error("Could not obtain a Google access token. Re-authorize Gmail.");
  }
  return { accessToken, accountId: account.id };
}

function encodeRfc2047(text: string): string {
  // Encode non-ASCII header values
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function buildRawMime(opts: {
  to: string;
  from: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachment?: { filename: string; mimeType: string; bytes: Buffer };
}): string {
  const bodyText = opts.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  const replyHeaders: string[] = [];
  if (opts.inReplyTo?.trim()) {
    replyHeaders.push(`In-Reply-To: ${opts.inReplyTo.trim()}`);
  }
  if (opts.references?.trim()) {
    replyHeaders.push(`References: ${opts.references.trim()}`);
  }

  if (!opts.attachment) {
    const lines = [
      `To: ${opts.to}`,
      `From: ${opts.from}`,
      `Subject: ${encodeRfc2047(opts.subject)}`,
      ...replyHeaders,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      bodyText,
    ];
    return Buffer.from(lines.join("\r\n"), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  const boundary = `aavedak_${Date.now().toString(36)}`;
  const filename = opts.attachment.filename.replace(/"/g, "");
  const lines = [
    `To: ${opts.to}`,
    `From: ${opts.from}`,
    `Subject: ${encodeRfc2047(opts.subject)}`,
    ...replyHeaders,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    bodyText,
    `--${boundary}`,
    `Content-Type: ${opts.attachment.mimeType || "application/pdf"}; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${filename}"`,
    "",
    opts.attachment.bytes
      .toString("base64")
      .replace(/(.{76})/g, "$1\r\n")
      .replace(/\r\n$/, ""),
    `--${boundary}--`,
    "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SendGmailResult = {
  id: string;
  threadId?: string;
};

/** Fetch RFC822 Message-ID for a Gmail API message id (for In-Reply-To). */
export async function getGmailRfcMessageId(
  userId: string,
  gmailMessageId: string,
): Promise<string | null> {
  const { accessToken } = await getGoogleAccessTokenForUser(userId);
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}`,
  );
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "Message-ID");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    payload?: { headers?: Array<{ name?: string; value?: string }> };
  };
  const header = data.payload?.headers?.find((h) => h.name?.toLowerCase() === "message-id");
  return header?.value?.trim() || null;
}

/** Send a plain-text email via Gmail API users.messages.send (user's mailbox). */
export async function sendGmailMessage(opts: {
  userId: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  /** Gmail conversation thread — required for replies to appear under the original. */
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  attachment?: { filename: string; mimeType: string; bytes: Buffer };
}): Promise<SendGmailResult> {
  const to = opts.to.trim();
  const subject = opts.subject.trim();
  const body = opts.body.trim();
  if (!to || !to.includes("@")) {
    throw new Error("Recipient email is missing or invalid.");
  }
  if (!subject) {
    throw new Error("Subject is required.");
  }
  if (!body) {
    throw new Error("Body is required.");
  }

  const { accessToken } = await getGoogleAccessTokenForUser(opts.userId);
  const raw = buildRawMime({
    to,
    from: opts.from.trim() || "me",
    subject,
    body,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
    attachment: opts.attachment,
  });

  const payload: { raw: string; threadId?: string } = { raw };
  if (opts.threadId?.trim()) {
    payload.threadId = opts.threadId.trim();
  }

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = `Gmail API ${res.status}`;
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      if (errJson?.error?.message) detail = errJson.error.message;
    } catch {
      // ignore
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Gmail authorization failed (${detail}). Re-authorize Google with gmail.send.`,
      );
    }
    throw new Error(`Gmail send failed: ${detail}`);
  }

  const data = (await res.json()) as { id?: string; threadId?: string };
  if (!data.id) {
    throw new Error("Gmail send succeeded but no message id returned.");
  }
  return { id: data.id, threadId: data.threadId };
}

export type GmailReply = {
  messageId: string;
  threadId: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
  /** Sent by a system (auto-reply, out-of-office, bounce), not written by the person. */
  automated: boolean;
};

/**
 * Replies in one Gmail thread: every message that was not sent by the user, with its quoted
 * history removed. Needs gmail.readonly. Returns [] for a thread with no replies yet.
 */
export async function fetchThreadReplies(
  accessToken: string,
  threadId: string,
  userEmail: string,
): Promise<GmailReply[]> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Gmail read permission missing. Authorize reply detection."
        : `Gmail thread read failed (${res.status}).`,
    );
  }
  const data = (await res.json()) as {
    messages?: Array<{
      id: string;
      threadId: string;
      labelIds?: string[];
      snippet?: string;
      internalDate?: string;
      payload?: Parameters<typeof extractPlainText>[0] & {
        headers?: Array<{ name: string; value: string }>;
      };
    }>;
  };
  const me = userEmail.trim().toLowerCase();
  const replies: GmailReply[] = [];
  for (const message of data.messages ?? []) {
    const from = bareAddress(headerValue(message.payload, "From"));
    const sentByMe = (message.labelIds ?? []).includes("SENT") || (me && from === me);
    if (sentByMe) continue;
    const subject = headerValue(message.payload, "Subject");
    replies.push({
      messageId: message.id,
      threadId: message.threadId,
      fromAddress: from,
      subject,
      automated: isAutomatedReply(message.payload, from, subject),
      receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
      bodyText: trimQuotedReply(extractPlainText(message.payload, message.snippet ?? "")),
    });
  }
  return replies;
}

export function replySubject(originalSubject: string): string {
  const s = originalSubject.trim();
  if (!s) return "Re:";
  if (/^re:\s*/i.test(s)) return s;
  return `Re: ${s}`;
}

/** Parse Subject/To/From/Resume-Id/body from follow-up notes written by referrals queue. */
export function parseQueuedMailNotes(notes: string | null): {
  to: string | null;
  from: string | null;
  subject: string | null;
  resumeId: string | null;
  body: string;
} {
  if (!notes) {
    return { to: null, from: null, subject: null, resumeId: null, body: "" };
  }
  const lines = notes.replace(/\r\n/g, "\n").split("\n");
  let to: string | null = null;
  let from: string | null = null;
  let subject: string | null = null;
  let resumeId: string | null = null;
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^Subject:\s*/i.test(line)) {
      subject = line.replace(/^Subject:\s*/i, "").trim();
      bodyStart = i + 1;
      continue;
    }
    if (/^Resume-Id:\s*/i.test(line)) {
      resumeId = line.replace(/^Resume-Id:\s*/i, "").trim() || null;
      bodyStart = i + 1;
      continue;
    }
    if (/^To:\s*/i.test(line)) {
      to = line.replace(/^To:\s*/i, "").trim();
      if (to === "(no email)") to = null;
      bodyStart = i + 1;
      continue;
    }
    if (/^From:\s*/i.test(line)) {
      from = line.replace(/^From:\s*/i, "").trim();
      bodyStart = i + 1;
      continue;
    }
    if (line.trim() === "") {
      bodyStart = i + 1;
      break;
    }
  }
  // Prefer content after the blank line separating headers from body
  const blankIdx = lines.findIndex((l, idx) => idx >= 3 && l.trim() === "");
  if (blankIdx >= 0) bodyStart = blankIdx + 1;
  const body = lines.slice(bodyStart).join("\n").trim();
  return { to, from, subject, resumeId, body };
}
