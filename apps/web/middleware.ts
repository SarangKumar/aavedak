import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { canAcceptUser } from "@/lib/user-cap";

const protect = auth.middleware({
  loginUrl: "/sign-in",
});

export default async function middleware(request: NextRequest) {
  const protectedResponse = await protect(request);

  // Neon Auth redirects unauthenticated users (3xx) — keep that.
  if (protectedResponse.status >= 300 && protectedResponse.status < 400) {
    return protectedResponse;
  }

  try {
    const { data: session } = await auth.getSession();
    const userId = session?.user?.id;
    if (userId && !(await canAcceptUser(userId))) {
      const url = request.nextUrl.clone();
      url.pathname = "/closed";
      url.search = "";
      return NextResponse.redirect(url);
    }
  } catch {
    // DB blip: page-level ensureProfile / auth/continue still enforce the cap.
  }

  return protectedResponse;
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
  ],
};
