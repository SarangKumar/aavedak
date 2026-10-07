import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "@neondatabase/serverless";
import { headers } from "next/headers";

/**
 * Self-hosted Better Auth + Google OAuth.
 * Session/user tables live on Neon Postgres (DATABASE_URL).
 * Google OAuth client lives in this app (GOOGLE_CLIENT_*), not Neon Auth.
 *
 * Sign-in requests only openid/email/profile (non-sensitive → no Google verification needed
 * once the consent screen is "In production"). gmail.send is requested incrementally via
 * linkSocial from GmailConnectBanner; include_granted_scopes keeps it on later sign-ins.
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
            // Basic scopes only at sign-in; offline + consent so linkSocial(gmail.send) gets a refresh token
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
