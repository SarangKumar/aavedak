import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const dynamic = "force-dynamic";

/** Every company careers page with its last crawl, plus counts by status and strategy. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json(
      await discoveryAdmin(`/careers-pages?limit=2000&q=${encodeURIComponent(q)}`),
    );
  } catch (err) {
    const status = err instanceof DiscoveryApiError ? (err.status >= 500 ? 502 : err.status) : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed." },
      { status },
    );
  }
}
