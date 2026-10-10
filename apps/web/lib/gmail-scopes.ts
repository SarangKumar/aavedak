/** Gmail send-only scope (least privilege for outreach). Shared client + server. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/**
 * Read-only scope, requested separately and only for reply detection. Aavedak reads threads of
 * mails it sent (never the wider inbox). Sending keeps working without it.
 */
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const GMAIL_REAUTH_SCOPES = [GMAIL_SEND_SCOPE] as const;

/** Scopes for the reply-detection consent screen (the read scope only, incremental). */
export const GMAIL_READ_REAUTH_SCOPES = [GMAIL_READ_SCOPE] as const;

/**
 * Extra Google auth params for the incremental Gmail consent only (not sign-in):
 * offline → refresh token for the daily send cron; consent → Google re-issues it.
 */
export const GMAIL_REAUTH_PARAMS = { access_type: "offline", prompt: "consent" } as const;
