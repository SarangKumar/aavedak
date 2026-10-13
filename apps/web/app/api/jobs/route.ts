import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { toJobDto } from "@/lib/job-dto";
import { listJobScores, scoreJobForUser } from "@/lib/job-scoring";
import { parsePostedWindow, postedCutoffIso } from "@/lib/job-posted-window";
import { createJob, listAppliedJobs, listDiscoverJobs, type JobSource } from "@/lib/jobs";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

/**
 * Jobs page data: Discover (recommendations + manual jobs) and Applied tabs, limited to
 * `?posted=24h|3d|1w|2w|1m` (default 24h; never older than a month).
 */
export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const postedSince = postedCutoffIso(
    parsePostedWindow(new URL(request.url).searchParams.get("posted")),
  );
  const [discover, applied, scores] = await Promise.all([
    listDiscoverJobs(user.id, { postedSince }),
    listAppliedJobs(user.id, { postedSince }),
    listJobScores(user.id),
  ]);
  const byJob = new Map(scores.map((s) => [s.jobId, s]));
  return NextResponse.json({
    discover: discover.map((j) => toJobDto(j, byJob.get(j.id))),
    applied: applied.map((j) => toJobDto(j, byJob.get(j.id))),
  });
}

/** Manual / pasted job, private to the user (never expires automatically). */
export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const job = await createJob(user.id, {
      title: String(body.title ?? ""),
      company: String(body.company ?? ""),
      location: String(body.location ?? ""),
      source: body.source as JobSource | undefined,
      url: (body.url as string | null | undefined) ?? null,
      description: typeof body.description === "string" ? body.description : "",
      salary: (body.salary as string | null | undefined) ?? null,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      workMode: typeof body.workMode === "string" ? body.workMode : null,
      employmentType: typeof body.employmentType === "string" ? body.employmentType : null,
      seniority: typeof body.seniority === "string" ? body.seniority : null,
      postedAt: typeof body.postedAt === "string" ? body.postedAt : null,
      skills: body.skills,
    });
    const score = await scoreJobForUser(user.id, job);
    return NextResponse.json({ job: toJobDto(job, score) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
