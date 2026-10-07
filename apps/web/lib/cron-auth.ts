import "server-only";

import { NextResponse } from "next/server";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function cronUnauthorized(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set. Add it in the Vercel project env before enabling crons." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
