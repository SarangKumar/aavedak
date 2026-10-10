import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Refresh jobs" on the Jobs page — open to every signed-in user (the app is a small private
 * group, so letting anyone trigger a scan is intentional). Body `{ step: "start" | "tick" }`:
 * `start` queues a scan of all career sources (or resumes one already running), `tick` does
 * one budgeted batch of it. The client repeats `tick` until nothing is left, then reloads.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  let body: { step?: unknown };
  try {
    body = (await request.json()) as { step?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    if (body.step === "start") {
      return NextResponse.json(
        await discoveryAdmin("/runs/jobs-scan", {
          method: "POST",
          body: { createdBy: auth.user.email },
          timeoutMs: 58_000,
        }),
      );
    }
    if (body.step === "tick") {
      return NextResponse.json(
        await discoveryAdmin("/tick", {
          method: "POST",
          body: { budgetSeconds: 40 },
          timeoutMs: 58_000,
        }),
      );
    }
    return NextResponse.json({ error: "step must be start or tick." }, { status: 400 });
  } catch (err) {
    const status = err instanceof DiscoveryApiError ? (err.status >= 500 ? 502 : err.status) : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed." },
      { status },
    );
  }
}
