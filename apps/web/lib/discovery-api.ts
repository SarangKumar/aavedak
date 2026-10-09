import "server-only";

import { absoluteApiUrl } from "@/lib/api-url";

/**
 * Server-to-server client for the FastAPI discovery admin endpoints
 * (`/svc/v1/discovery/admin/*`). Job and people discovery run entirely in FastAPI; the web
 * app only checks the admin allowlist and forwards with the shared CRON_SECRET.
 */
export class DiscoveryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function discoveryAdmin<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const secret = process.env.CRON_SECRET?.trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(absoluteApiUrl(`/svc/v1/discovery/admin${path}`), {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      // The API keeps working after we stop waiting (runs are persistent) — say so.
      throw new DiscoveryApiError(
        "The discovery service is taking longer than usual. The action may still finish — refresh in a minute before retrying.",
        504,
      );
    }
    throw new DiscoveryApiError(
      "Could not reach the discovery service (FastAPI). Check that the API is deployed and running.",
      503,
    );
  }
  const data = (await res.json().catch(() => null)) as { detail?: unknown } | null;
  if (!res.ok) {
    const detail =
      typeof data?.detail === "string" ? data.detail : `Discovery service error (${res.status}).`;
    throw new DiscoveryApiError(detail, res.status);
  }
  return data as T;
}
