import "server-only";

import { auth } from "@/lib/auth";
import { getSql } from "@/lib/app-db";
import { GMAIL_SEND_SCOPE } from "@/lib/gmail-scopes";

export { GMAIL_SEND_SCOPE } from "@/lib/gmail-scopes";

export type GmailAuthStatus = {
  connected: boolean;
  hasRefreshToken: boolean;
  hasSendScope: boolean;
  accountId: string | null;
  scope: string | null;
  /** True when user can queue+send mail. */
  ready: boolean;
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

/** Public status for UI (no tokens). */
export async function getGmailAuthStatus(userId: string): Promise<GmailAuthStatus> {
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
  attachment?: { filename: string; mimeType: string; bytes: Buffer };
}): string {
  const bodyText = opts.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  if (!opts.attachment) {
    const lines = [
      `To: ${opts.to}`,
      `From: ${opts.from}`,
      `Subject: ${encodeRfc2047(opts.subject)}`,
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
    opts.attachment.bytes.toString("base64").replace(/(.{76})/g, "$1\r\n"),
    `--${boundary}--`,
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

/** Send a plain-text email via Gmail API users.messages.send (user's mailbox). */
export async function sendGmailMessage(opts: {
  userId: string;
  to: string;
  from: string;
  subject: string;
  body: string;
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
    attachment: opts.attachment,
  });

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
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
