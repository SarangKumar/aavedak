/**
 * Base URL for the FastAPI service (Vercel Services mount under /svc).
 * Prefer NEXT_PUBLIC_API_URL; fall back to same-origin /svc.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (app) return `${app}/svc`;

  return "/svc";
}

/** Join API base with a path (path may start with `/`). */
export function apiUrl(path = ""): string {
  const base = getApiBaseUrl();
  if (!path) return base;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  // Avoid doubling /svc when callers pass /svc/...
  if (suffix.startsWith("/svc/") || suffix === "/svc") {
    const origin = base.replace(/\/svc$/, "");
    return `${origin}${suffix}`;
  }
  return `${base}${suffix}`;
}
