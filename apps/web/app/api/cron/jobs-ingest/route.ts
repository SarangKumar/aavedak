import { NextResponse } from "next/server";

import { runJobsIngest } from "@/lib/jobs-ingest";
import { ensureAppSchema, getSql } from "@/lib/app-db";
import { getJobById } from "@/lib/jobs";
import { scoreJobForUser } from "@/lib/job-scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Allow in local/dev when unset; require in production.
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const query = new URL(request.url).searchParams.get("secret") || "";
  return bearer === secret || query === secret;
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runJobsIngest();

    // Best-effort rescore for all profiles against newly upserted shared jobs
    await ensureAppSchema();
    const users = (await getSql()`SELECT user_id FROM profiles`) as Array<{ user_id: string }>;
    const jobs = (await getSql()`
      SELECT id FROM jobs WHERE user_id IS NULL AND status = 'active'
      ORDER BY updated_at DESC LIMIT 50
    `) as Array<{ id: string }>;
    let scored = 0;
    for (const jobRow of jobs) {
      const job = await getJobById(jobRow.id);
      if (!job) continue;
      for (const u of users) {
        await scoreJobForUser(u.user_id, job);
        scored += 1;
      }
    }

    return NextResponse.json({ ok: true, ingest: result, scored });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ingest failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
