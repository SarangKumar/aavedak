/**
 * Pure helpers for reply detection: decode Gmail message bodies and drop quoted history.
 * No network or database access, so they can be tested directly (see lib/mail-reply-parse.test.ts).
 */

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: Array<{ name: string; value: string }>;
};

/** Gmail sends body data as base64url (RFC 4648 §5), sometimes without padding. */
export function decodeBase64Url(data: string): string {
  const normal = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

/** First text/plain body found in the MIME tree; falls back to the snippet. */
export function extractPlainText(payload: GmailPart | undefined, snippet = ""): string {
  const found = findPart(payload, "text/plain");
  if (found?.body?.data) return decodeBase64Url(found.body.data);
  return snippet;
}

function findPart(part: GmailPart | undefined, mime: string): GmailPart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mime && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = findPart(child, mime);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Keep only what the person wrote: stop at the first quote marker ("On … wrote:", "-----Original
 * Message-----", a "From:" header line) and drop `>` quoted lines. Trailing whitespace is trimmed.
 */
export function trimQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*>/.test(line)) continue;
    if (/^\s*-{2,}\s*original message\s*-{2,}\s*$/i.test(line)) break;
    if (/^\s*from:\s.+/i.test(line) && lines[i + 1] && /^\s*(sent|date|to):/i.test(lines[i + 1])) {
      break;
    }
    // "On Mon, 3 Mar 2026 at 10:00, Name <a@b> wrote:" — may wrap onto the next line.
    const joined = `${line} ${lines[i + 1] ?? ""}`;
    if (
      /^\s*on\s.+wrote:\s*$/i.test(line) ||
      (/^\s*on\s/i.test(line) && /wrote:\s*$/i.test(joined))
    ) {
      break;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\s+$/g, "");
}

/** Header value by case-insensitive name, from a Gmail message payload. */
export function headerValue(payload: GmailPart | undefined, name: string): string {
  const want = name.toLowerCase();
  return payload?.headers?.find((h) => h.name.toLowerCase() === want)?.value ?? "";
}

/** Email address inside a "Name <addr>" header, or the value itself if it is a bare address. */
export function bareAddress(headerValueText: string): string {
  const m = /<([^>]+)>/.exec(headerValueText);
  return (m ? m[1] : headerValueText).trim().toLowerCase();
}

const AUTO_SUBJECT_RE =
  /^\s*(?:automatic reply|auto(?:matic)?[- ]?reply|auto[- ]?response|out of (?:the )?office|ooo\b|away from (?:the )?office|undeliverable|delivery status notification|mail delivery (?:failed|subsystem)|returned mail)/i;
const AUTO_SENDER_RE = /^(?:mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/i;

/**
 * True for mail a system sent rather than the person: auto-replies (RFC 3834
 * `Auto-Submitted`, `X-Autoreply`, `Precedence: auto_reply|bulk|junk`), bounces, no-reply
 * senders, and out-of-office subjects. Used so only a real human reply earns credit.
 */
export function isAutomatedReply(
  payload: GmailPart | undefined,
  fromAddress: string,
  subject: string,
): boolean {
  const autoSubmitted = headerValue(payload, "Auto-Submitted").trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headerValue(payload, "X-Autoreply") || headerValue(payload, "X-Autorespond")) return true;
  if (/^(?:auto_reply|bulk|junk|list)$/i.test(headerValue(payload, "Precedence").trim())) {
    return true;
  }
  if (AUTO_SENDER_RE.test(fromAddress.trim())) return true;
  return AUTO_SUBJECT_RE.test(subject);
}
