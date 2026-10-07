import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "@neondatabase/serverless";
import { headers } from "next/headers";

import { GMAIL_SEND_SCOPE } from "@/lib/gmail-scopes";

/**
 * Self-hosted Better Auth + Google OAuth.
 * Session/user tables live on Neon Postgres (DATABASE_URL).
 * Google OAuth client lives in this app (GOOGLE_CLIENT_*), not Neon Auth.
 *
 * Offline access + gmail.send so queued follow-ups can send from the user's Gmail.
 */
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";

/** True when Google OAuth env is present — used to degrade UI without crashing. */
export const isGoogleAuthConfigured = Boolean(googleClientId && googleClientSecret);

function createAuthPool() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required for Better Auth (Neon pooled connection string).");
  }
  return new Pool({ connectionString: url, max: 1 });
}

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: createAuthPool(),
  socialProviders: {
    ...(isGoogleAuthConfigured
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            // Request Gmail send + force refresh token on consent
            scope: [GMAIL_SEND_SCOPE],
            accessType: "offline",
            prompt: "select_account consent",
          },
        }
      : {}),
  },
  // last plugin — sets cookies from server actions / RSC flows
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

/** Server-side session (RSC / route handlers that use next/headers). */
export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}
