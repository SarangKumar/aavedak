import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cookie existence check only (optimistic redirect).
 * Real validation happens via auth.api.getSession in server code / API.
 * See https://www.better-auth.com/docs/integrations/next
 */
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
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
  ],
};
