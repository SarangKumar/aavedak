import { NextResponse } from "next/server";

import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * People discovery schedule: two once-daily Vercel crons (00:17 and 12:17 UTC, see
 * vercel.json; `?slot=` only keeps each path unique) — morning/evening for Hobby Fluid CPU.
 * Hobby may fire each within its hour. Safe to overlap or repeat: the API keeps one run per
 * IST 4-hour slot (`run_key`), claims companies on the cursor when queuing, and items are
 * leased. Authorization: Bearer $CRON_SECRET. Admin "Discover people now" and
 * `POST /svc/.../admin/people/scheduled` cover on-demand runs (no separate API cron).
 */
function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return bearer === secret;
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await discoveryAdmin<Record<string, unknown>>("/people/scheduled", {
      method: "POST",
      timeoutMs: 58_000,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof DiscoveryApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "People discovery failed." },
      { status: status >= 500 ? 502 : status },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
