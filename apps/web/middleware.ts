import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cookie existence check only (optimistic redirect).
 * Real validation + 8-user cap happen via auth.api.getSession / ensureProfile.
 * See https://www.better-auth.com/docs/integrations/next
 */
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/jobs/:path*",
    "/job-tracker/:path*",
    "/documents/:path*",
    "/referrals/:path*",
    "/follow-ups/:path*",
    "/people/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
    "/auth/continue",
    "/friends/invite/:path*",
  ],
};
