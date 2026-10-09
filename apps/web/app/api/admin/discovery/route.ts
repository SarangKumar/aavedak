import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A tick runs up to the FastAPI budget (~45s by default).
export const maxDuration = 60;

function errorResponse(err: unknown) {
  if (err instanceof DiscoveryApiError) {
    return NextResponse.json(
      { error: err.message },
      { status: err.status >= 500 ? 502 : err.status },
    );
  }
  return NextResponse.json({ error: "Discovery request failed." }, { status: 500 });
}

/** Overview: settings, registry summary, recent runs, open items. */
export async function GET() {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await discoveryAdmin("/overview"));
  } catch (err) {
    return errorResponse(err);
  }
}

type Action =
  | { action: "scan" }
  | { action: "tick" }
  | { action: "expire" }
  | { action: "rank" }
  | { action: "import_seed" }
  | { action: "people_import"; csv: string };

/**
 * Admin actions. Long work (scans, thousands of people) is queued as a persistent run;
 * the admin page then calls `tick` repeatedly while open, and drain crons finish the rest.
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  let body: Action;
  try {
    body = (await request.json()) as Action;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "scan":
        return NextResponse.json(
          await discoveryAdmin("/runs/jobs-scan", {
            method: "POST",
            body: { createdBy: auth.user.email },
            timeoutMs: 58_000,
          }),
        );
      case "tick":
        return NextResponse.json(
          await discoveryAdmin("/tick", {
            method: "POST",
            body: { budgetSeconds: 40 },
            timeoutMs: 58_000,
          }),
        );
      case "expire":
        return NextResponse.json(
          await discoveryAdmin("/expire", { method: "POST", timeoutMs: 58_000 }),
        );
      case "rank":
        return NextResponse.json(
          await discoveryAdmin("/rank", { method: "POST", timeoutMs: 58_000 }),
        );
      case "import_seed":
        return NextResponse.json(
          await discoveryAdmin("/sources/import", {
            method: "POST",
            body: { seed: true },
            timeoutMs: 58_000,
          }),
        );
      case "people_import":
        if (typeof body.csv !== "string" || !body.csv.trim()) {
          return NextResponse.json({ error: "CSV content is required." }, { status: 400 });
        }
        return NextResponse.json(
          await discoveryAdmin("/runs/people-import", {
            method: "POST",
            body: { csv: body.csv, createdBy: auth.user.email, source: "admin_csv" },
            timeoutMs: 58_000,
          }),
        );
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err);
  }
}
