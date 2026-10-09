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

/**
 * Absolute FastAPI URL for server-side fetches (relative `/svc` cannot be fetched from Node).
 * Falls back to the app origin, then local uvicorn on :8000.
 */
export function absoluteApiUrl(path: string): string {
  const joined = apiUrl(path);
  if (joined.startsWith("http://") || joined.startsWith("https://")) return joined;

  const app =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (app) {
    const base = getApiBaseUrl().startsWith("http")
      ? getApiBaseUrl()
      : `${app}${getApiBaseUrl().startsWith("/") ? "" : "/"}${getApiBaseUrl()}`;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    if (suffix.startsWith("/svc")) return `${app}${suffix}`;
    return `${base.replace(/\/$/, "")}${suffix}`;
  }

  return `http://127.0.0.1:8000${path.startsWith("/") ? path : `/${path}`}`;
}
