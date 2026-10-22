import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const dynamic = "force-dynamic";

/** Source-health report: coverage and success per ATS, careers-page strategies, job counts
 * and the validation problems in stored jobs (FastAPI `/admin/health`). */
export async function GET() {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await discoveryAdmin("/health"));
  } catch (err) {
    const status = err instanceof DiscoveryApiError ? (err.status >= 500 ? 502 : err.status) : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed." },
      { status },
    );
  }
}
