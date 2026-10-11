import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

/** Daily run counts per kind (India time) for the admin activity chart. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const months = new URL(request.url).searchParams.get("months") ?? "3";
  try {
    return NextResponse.json(
      await discoveryAdmin(`/runs/history?months=${encodeURIComponent(months)}`),
    );
  } catch (err) {
    const status = err instanceof DiscoveryApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed." },
      { status },
    );
  }
}
