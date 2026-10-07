import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Neon Auth (Managed Better Auth). Google OAuth is configured in the Neon Console,
 * not via GOOGLE_CLIENT_* env on the Next app.
 */
const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim() ?? "";
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim() ?? "";

if (!baseUrl) {
  console.warn("[aavedak] NEON_AUTH_BASE_URL is not set — auth routes will fail until configured.");
}
if (!cookieSecret || cookieSecret.length < 32) {
  console.warn(
    "[aavedak] NEON_AUTH_COOKIE_SECRET missing or shorter than 32 chars — set via openssl rand -base64 32",
  );
}

export const auth = createNeonAuth({
  baseUrl: baseUrl || "http://localhost/missing-neon-auth",
  cookies: {
    secret: cookieSecret || "dev-only-insecure-cookie-secret-replace-me!!",
    sameSite: "lax",
  },
});

/** True when Neon Auth base URL is present (Google provider lives in Neon Console). */
export const isNeonAuthConfigured = Boolean(baseUrl);

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};
