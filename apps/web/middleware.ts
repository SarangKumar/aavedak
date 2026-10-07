import { auth } from "@/lib/auth";

export default auth.middleware({
  loginUrl: "/sign-in",
});

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
