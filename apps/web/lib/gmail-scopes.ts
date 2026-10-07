/** Gmail send-only scope (least privilege for outreach). Shared client + server. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const GMAIL_REAUTH_SCOPES = [GMAIL_SEND_SCOPE] as const;
