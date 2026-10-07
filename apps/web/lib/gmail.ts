import "server-only";

import { dbGet } from "@/lib/app-db";
import { getNeonAuth } from "@/lib/auth";
import { isPostgresConfigured } from "@/lib/db-config";
import { GMAIL_SEND_SCOPE } from "@/lib/google-scopes";

export class GmailReconnectError extends Error {
  readonly code = "gmail_reconnect";

  constructor(message: string) {
    super(message);
    this.name = "GmailReconnectError";
  }
}

export type GmailStatus = {
  linked: boolean;
  hasSendScope: boolean;
  hasRefreshToken: boolean;
  scopes: string[];
};

type GoogleAccount = {
  id: string;
  scope: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
};

function parseScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function scopeAllowsGmailSend(scopes: string[]): boolean {
  return scopes.some(
    (scope) =>
      scope === GMAIL_SEND_SCOPE || scope === "gmail.send" || scope.endsWith("/gmail.send"),
  );
}

async function neonGoogleAccount(userId: string): Promise<GoogleAccount | null> {
  if (!isPostgresConfigured()) return null;
  try {
    const row = await dbGet<{
      id: string;
      scope: string | null;
      access_token: string | null;
      refresh_token: string | null;
      expires_at: string | Date | null;
    }>(
      `SELECT id,
              scope,
              "accessToken" AS access_token,
              "refreshToken" AS refresh_token,
              "accessTokenExpiresAt" AS expires_at
         FROM neon_auth.account
        WHERE "userId" = ? AND "providerId" = 'google'
        LIMIT 1`,
      userId,
    );
    if (!row) return null;
    const expires =
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : row.expires_at
          ? String(row.expires_at)
          : null;
    return {
      id: String(row.id),
      scope: row.scope,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: expires,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/neon_auth|does not exist|42P01/i.test(message)) return null;
    throw err;
  }
}

async function googleAccount(userId: string): Promise<GoogleAccount | null> {
  return neonGoogleAccount(userId);
}

export async function getGmailStatusForUser(userId: string): Promise<GmailStatus> {
  const account = await googleAccount(userId);
  if (!account) {
    return { linked: false, hasSendScope: false, hasRefreshToken: false, scopes: [] };
  }
  const scopes = parseScopes(account.scope);
  return {
    linked: true,
    hasSendScope: scopeAllowsGmailSend(scopes),
    hasRefreshToken: Boolean(account.refreshToken),
    scopes,
  };
}

function tokenFresh(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return false;
  return at - Date.now() > 60_000;
}

function readAccessToken(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as {
    accessToken?: string;
    data?: { accessToken?: string } | null;
  };
  return record.data?.accessToken || record.accessToken || "";
}

async function accessTokenFor(account: GoogleAccount): Promise<string> {
  try {
    const tokens = await getNeonAuth().getAccessToken({ providerId: "google" });
    const token = readAccessToken(tokens);
    if (token) return token;
  } catch {
    /* Cron and other callers may not have the user's session cookie. */
  }
  if (account.accessToken && (tokenFresh(account.expiresAt) || !account.expiresAt)) {
    return account.accessToken;
  }
  throw new GmailReconnectError(
    "Neon Auth could not return a Google access token. Reconnect Google and allow gmail.send. Enable offline access on the Google provider in the Neon Console so refresh tokens are stored.",
  );
}

function encodeHeader(value: string): string {
  if (/^[\t\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function encodeAddress(name: string | null | undefined, email: string): string {
  const cleaned = email.trim();
  const display = name?.trim();
  if (!display) return cleaned;
  return `${encodeHeader(display)} <${cleaned}>`;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendGmailMessage(input: {
  userId: string;
  fromEmail: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
  attachment?: { filename: string; mimeType: string; bytes: Buffer } | null;
}): Promise<{ messageId: string }> {
  const to = input.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("Recipient email is missing or invalid.");
  }
  const account = await googleAccount(input.userId);
  if (!account) {
    throw new GmailReconnectError("No Google account is linked. Sign in with Google again.");
  }
  const scopes = parseScopes(account.scope);
  if (!scopeAllowsGmailSend(scopes)) {
    throw new GmailReconnectError(
      "Gmail send is not authorized. Reconnect Google and allow the gmail.send scope.",
    );
  }
  const accessToken = await accessTokenFor(account);
  const subject = encodeHeader(input.subject.trim() || "(no subject)");
  const bodyText = input.body.replace(/\r?\n/g, "\r\n");
  let mime = "";
  if (input.attachment) {
    const boundary = `aavedak_${Date.now().toString(36)}`;
    const filename = input.attachment.filename.replace(/"/g, "");
    const b64 = input.attachment.bytes.toString("base64").replace(/(.{76})/g, "$1\r\n");
    mime = [
      `From: ${encodeAddress(input.fromName, input.fromEmail)}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      bodyText,
      "",
      `--${boundary}`,
      `Content-Type: ${input.attachment.mimeType || "application/pdf"}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      b64,
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    mime = [
      `From: ${encodeAddress(input.fromName, input.fromEmail)}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      bodyText,
    ].join("\r\n");
  }
  const raw = toBase64Url(mime);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (response.status === 401 || response.status === 403) {
    throw new GmailReconnectError(
      "Gmail rejected the send (missing gmail.send scope or expired consent). Reconnect Google.",
    );
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail send failed (${response.status}). ${detail.slice(0, 240)}`);
  }
  const payload = (await response.json()) as { id?: string };
  return { messageId: payload.id || "sent" };
}
