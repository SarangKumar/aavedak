/** Gmail send-only scope (least privilege for outreach). Shared client + server. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const GMAIL_REAUTH_SCOPES = [GMAIL_SEND_SCOPE] as const;

/**
 * Extra Google auth params for the incremental Gmail consent only (not sign-in):
 * offline → refresh token for the daily send cron; consent → Google re-issues it.
 */
export const GMAIL_REAUTH_PARAMS = { access_type: "offline", prompt: "consent" } as const;
