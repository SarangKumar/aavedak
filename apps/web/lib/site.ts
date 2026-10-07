/** Canonical site URL helpers for SEO. */
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "https://aavedak.vercel.app";
  return raw.replace(/\/$/, "");
}

export const SITE_NAME = "Aavedak";
export const SITE_NAME_HI = "आवेदक";
export const SITE_TAGLINE = "Discover · Apply · Grow";
export const SITE_DESCRIPTION =
  "Aavedak (आवेदक) — job discovery, application & career platform. Discover roles, prepare documents, track applications. Aavedak recommends and prepares. You decide and send.";
