/** Extra Google scope for follow-up mail. Default openid/email/profile stay. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export const GOOGLE_SIGN_IN_SCOPES = [GMAIL_SEND_SCOPE] as const;
