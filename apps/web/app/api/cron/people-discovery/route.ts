import { NextResponse } from "next/server";

import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * People discovery schedule: six once-daily Vercel crons (00:17, 04:17 … 20:17 UTC, see
 * vercel.json; `?slot=` only keeps each path unique), so it fits the Hobby plan. Hobby may
 * fire each within its hour. Safe to overlap or repeat: the API keeps one run per IST 4-hour
 * slot (`run_key`), claims companies on the cursor when queuing, and items are leased.
 * Authorization: Bearer $CRON_SECRET. The daily API cron
 * `/svc/v1/discovery/cron/people-discovery` remains as an extra fallback.
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
