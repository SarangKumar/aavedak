import { NextResponse } from "next/server";

import { cronUnauthorized } from "@/lib/cron-auth";
import { databaseErrorMessage, isDatabaseFailure } from "@/lib/db-config";
import { ingestJobsForAllUsers } from "@/lib/jobs-ingest";

export async function GET(request: Request) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  try {
    const result = await ingestJobsForAllUsers();
    return NextResponse.json(result);
  } catch (err) {
    const status = isDatabaseFailure(err) ? 503 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : databaseErrorMessage(err) },
      { status },
    );
  }
}

export function POST(request: Request) {
  return GET(request);
}
