import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export const dynamic = "force-dynamic";

export type ParsedJobDto = {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  postedAt: string | null;
  source: string;
  provider: string;
};

/**
 * Read one job posting from its link (Add job → "Add from a job link"). Parsing runs in
 * FastAPI with the discovery providers; nothing is saved here. The user reviews the fields
 * and creates the job with POST /api/jobs.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "Paste a job link." }, { status: 400 });
  if (url.length > 2000)
    return NextResponse.json({ error: "That link is too long." }, { status: 400 });

  try {
    const data = await discoveryAdmin<{ job: ParsedJobDto }>("/parse-job-url", {
      method: "POST",
      body: { url },
      timeoutMs: 25_000,
    });
    return NextResponse.json({ job: data.job });
  } catch (err) {
    const status = err instanceof DiscoveryApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read this job." },
      // 422 = the link can't be read (user-facing message); service problems map to 502/503/504.
      { status: status === 422 ? 422 : status >= 500 ? status : 502 },
    );
  }
}
