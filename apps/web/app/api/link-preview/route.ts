import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { fetchLinkPreview } from "@/lib/link-preview";

/**
 * POST /api/link-preview
 * Body: { url: string }
 * Returns og:image + favicon for a deployed project URL.
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "URL is required." }, { status: 400 });
  }

  try {
    const preview = await fetchLinkPreview(url);
    return NextResponse.json({ preview });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not fetch preview.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
