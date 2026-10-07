import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/changelog", "/sign-in", "/privacy", "/terms"],
        disallow: [
          "/dashboard",
          "/jobs",
          "/job-tracker",
          "/documents",
          "/referrals",
          "/follow-ups",
          "/people",
          "/onboarding",
          "/admin",
          "/api/",
          "/auth/",
          "/closed",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
