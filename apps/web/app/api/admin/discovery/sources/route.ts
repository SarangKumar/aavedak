import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const dynamic = "force-dynamic";

function errorResponse(err: unknown) {
  const status = err instanceof DiscoveryApiError ? (err.status >= 500 ? 502 : err.status) : 500;
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Request failed." },
    { status },
  );
}

/** Career-source registry page: `?q=&limit=&offset=`. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const params = new URLSearchParams();
  params.set("q", url.searchParams.get("q") ?? "");
  params.set("limit", String(Math.min(Number(url.searchParams.get("limit")) || 50, 200)));
  params.set("offset", String(Math.max(Number(url.searchParams.get("offset")) || 0, 0)));
  try {
    return NextResponse.json(await discoveryAdmin(`/sources?${params.toString()}`));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Bulk import career URLs: body `{ text }`, one `Company, URL[, sector]` or URL per line. */
export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "Paste at least one career page URL." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await discoveryAdmin("/sources/import", { method: "POST", body: { text: body.text } }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
