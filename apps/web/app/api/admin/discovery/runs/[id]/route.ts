import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(err: unknown) {
  const status = err instanceof DiscoveryApiError ? err.status : 500;
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Request failed." },
    { status },
  );
}

/** Run progress + recent item errors. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await discoveryAdmin(`/runs/${encodeURIComponent(id)}`));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Re-queue this run's failed items. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(
      await discoveryAdmin(`/runs/${encodeURIComponent(id)}/retry`, { method: "POST" }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
