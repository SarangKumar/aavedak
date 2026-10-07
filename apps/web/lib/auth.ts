import "server-only";

import { cookies } from "next/headers";

import {
  createNeonAuth,
  type createNeonAuth as CreateNeonAuth,
} from "@neondatabase/auth/next/server";

import {
  DatabaseConfigError,
  isNeonAuthConfigured,
  neonAuthOptions,
  neonJwksUrl,
} from "@/lib/db-config";
import { GMAIL_SEND_SCOPE } from "@/lib/google-scopes";
import { isGoogleAccountAllowed, revokeOverCapAccount } from "@/lib/signup-cap";

/**
 * Neon Auth (Managed Better Auth). Google is the only social provider and is
 * configured in the Neon Console, not with GOOGLE_CLIENT_* in this app.
 * gmail.send is requested at sign-in and again via linkSocial when the first
 * grant omitted it.
 */

export const isNeonSignInConfigured = isNeonAuthConfigured();

export { GMAIL_SEND_SCOPE };

export type AppSessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export type AppSession = {
  user: AppSessionUser;
};

type NeonAuth = ReturnType<typeof CreateNeonAuth>;

let neonAuth: NeonAuth | null = null;
let jwksCheck: Promise<void> | null = null;

export function getNeonAuth(): NeonAuth {
  if (!isNeonAuthConfigured()) {
    throw new DatabaseConfigError(
      "Set NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL, and NEON_AUTH_COOKIE_SECRET (32+ characters) from the Neon Console.",
    );
  }
  if (!neonAuth) neonAuth = createNeonAuth(neonAuthOptions());
  return neonAuth;
}

/** Confirm the configured JWKS URL returns a key set. Cached for the process. */
export function ensureNeonJwks(): Promise<void> {
  if (!jwksCheck) {
    jwksCheck = (async () => {
      const url = neonJwksUrl();
      if (!url) {
        throw new DatabaseConfigError(
          "NEON_AUTH_JWKS_URL is missing. Copy it from the Neon Console (branch → Auth).",
        );
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new DatabaseConfigError(
          `NEON_AUTH_JWKS_URL returned ${response.status}. Check the URL from the Neon Console.`,
        );
      }
      const body = (await response.json()) as { keys?: unknown };
      if (!body || !Array.isArray(body.keys)) {
        throw new DatabaseConfigError("NEON_AUTH_JWKS_URL did not return a JWKS document.");
      }
    })().catch((err) => {
      jwksCheck = null;
      throw err;
    });
  }
  return jwksCheck;
}

function sessionFromUnknown(value: unknown): AppSession | null {
  if (!value || typeof value !== "object") return null;
  const user = (
    value as { user?: { id?: string; email?: string; name?: string | null; image?: string | null } }
  ).user;
  if (!user?.id || !user.email) return null;
  return {
    user: {
      id: String(user.id),
      email: user.email,
      name: user.name ?? "",
      image: user.image ?? null,
    },
  };
}

/** Session for the current request via Neon Auth. */
export async function getRequestSession(): Promise<AppSession | null> {
  await ensureNeonJwks();
  const { data, error } = await getNeonAuth().getSession();
  if (error) {
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    throw new DatabaseConfigError(
      `Neon Auth session lookup failed. Check NEON_AUTH_BASE_URL. ${message}`.trim(),
    );
  }
  const session = sessionFromUnknown(data);
  if (!session) return null;
  if (await isGoogleAccountAllowed(session.user.id)) return session;
  await revokeOverCapAccount(session.user.id);
  try {
    const jar = await cookies();
    jar.set("aavedak_signup_closed", "1", { path: "/", maxAge: 180, sameSite: "lax" });
    for (const cookie of jar.getAll()) {
      if (cookie.name.includes("neon-auth")) {
        jar.set(cookie.name, "", { path: "/", maxAge: 0 });
      }
    }
  } catch {
    /* Cookie writes are unavailable outside a request. The session is still rejected. */
  }
  return null;
}

/** Compat shim so routes can keep calling auth.api.getSession(). */
export const auth = {
  api: {
    getSession: async (input?: { headers?: Headers }): Promise<AppSession | null> => {
      void input;
      return getRequestSession();
    },
  },
};
