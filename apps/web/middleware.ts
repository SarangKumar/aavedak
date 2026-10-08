import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cookie existence check only (optimistic redirect).
 * Approval + onboarding gates run in requireOnboarded / auth/continue.
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
  // Vercel Services does not support Edge — middleware must run on Node.js.
  runtime: "nodejs",
  matcher: [
    "/dashboard/:path*",
    "/jobs/:path*",
    "/job-tracker/:path*",
    "/documents/:path*",
    "/referrals/:path*",
    "/follow-ups/:path*",
    "/outreach/:path*",
    "/people/:path*",
    "/onboarding/:path*",
    "/pending-approval/:path*",
    "/admin/:path*",
    "/auth/continue",
    "/friends/invite/:path*",
    "/ats/:path*",
  ],
};
