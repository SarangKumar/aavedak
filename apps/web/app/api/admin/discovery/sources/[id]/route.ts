import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Update one career source. Body (either or both):
 * - `enabled: boolean` — enable / disable scanning
 * - `officialCareersUrl: string | null` — the company's own careers page ("" or null clears)
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let body: { enabled?: unknown; officialCareersUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const patch: { enabled?: boolean; officialCareersUrl?: string | null } = {};
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    }
    patch.enabled = body.enabled;
  }
  if ("officialCareersUrl" in body) {
    const url = body.officialCareersUrl;
    if (url !== null && typeof url !== "string") {
      return NextResponse.json(
        { error: "officialCareersUrl must be a string or null." },
        { status: 400 },
      );
    }
    // The API validates the URL (http/https only).
    patch.officialCareersUrl = typeof url === "string" && url.trim() ? url.trim() : null;
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await discoveryAdmin(`/sources/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch,
      }),
    );
  } catch (err) {
    const status = err instanceof DiscoveryApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status },
    );
  }
}
