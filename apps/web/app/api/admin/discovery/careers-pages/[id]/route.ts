import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

type Ctx = { params: Promise<{ id: string }> };

/** Enable or disable crawling one careers page. Body: `{ enabled: boolean }`. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let body: { enabled?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await discoveryAdmin(`/careers-pages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { enabled: body.enabled },
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
