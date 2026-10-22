import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const dynamic = "force-dynamic";

/** The company-discovery ledger: candidates, where each came from, and what it resolved to. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json(
      await discoveryAdmin(`/discovered-companies?limit=500&q=${encodeURIComponent(q)}`),
    );
  } catch (err) {
    const status = err instanceof DiscoveryApiError ? (err.status >= 500 ? 502 : err.status) : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed." },
      { status },
    );
  }
}
