import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { toJobDto } from "@/lib/job-dto";
import { listJobScores, scoreJobForUser } from "@/lib/job-scoring";
import { createJob, listAppliedJobs, listDiscoverJobs, type JobSource } from "@/lib/jobs";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

/** Jobs page data: Discover (recommendations + manual jobs) and Applied tabs. */
export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const [discover, applied, scores] = await Promise.all([
    listDiscoverJobs(user.id),
    listAppliedJobs(user.id),
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
