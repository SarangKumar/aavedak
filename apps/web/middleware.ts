import { createNeonAuth } from "@neondatabase/auth/next/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Neon Auth validates and refreshes the session.
 * Missing Neon env sends protected routes to /setup-required.
 */
const neonBaseUrl = process.env.NEON_AUTH_BASE_URL?.trim() ?? "";
const neonJwksUrl = process.env.NEON_AUTH_JWKS_URL?.trim() ?? "";
const neonCookieSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim() ?? "";
const neonReady = Boolean(neonBaseUrl && neonJwksUrl && neonCookieSecret.length >= 32);

const neonMiddleware = neonReady
  ? createNeonAuth({
      baseUrl: neonBaseUrl,
      cookies: { secret: neonCookieSecret },
    }).middleware({ loginUrl: "/sign-in" })
  : null;

export function middleware(request: NextRequest) {
  if (!neonMiddleware) {
    return NextResponse.redirect(new URL("/setup-required", request.url));
  }
  return neonMiddleware(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/jobs/:path*",
    "/job-tracker/:path*",
    "/documents/:path*",
    "/referrals/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
  ],
};
