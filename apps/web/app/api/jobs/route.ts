import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { createJob, ensureDemoJobs, listJobsForUser, type JobSource } from "@/lib/jobs";
import { listJobScores, scoreJobForUser } from "@/lib/job-scoring";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function toDto(
  row: Awaited<ReturnType<typeof listJobsForUser>>[number],
  score?: { compatibilityScore: number; atsScore: number } | null,
) {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    companyId: row.companyId,
    location: row.location,
    source: row.source,
    url: row.url,
    description: row.description,
    salary: row.salary,
    status: row.status,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    compatibilityScore: score?.compatibilityScore ?? null,
    atsScore: score?.atsScore ?? null,
  };
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  await ensureDemoJobs(user.id);
  const jobs = await listJobsForUser(user.id);
  let scores = await listJobScores(user.id);
  if (scores.length === 0 && jobs.length > 0) {
    for (const job of jobs.slice(0, 20)) {
      await scoreJobForUser(user.id, job);
    }
    scores = await listJobScores(user.id);
  }
  const byJob = new Map(scores.map((s) => [s.jobId, s]));
  return NextResponse.json({
    jobs: jobs.map((j) =>
      toDto(j, byJob.get(j.id)
        ? {
            compatibilityScore: byJob.get(j.id)!.compatibilityScore,
            atsScore: byJob.get(j.id)!.atsScore,
          }
        : null),
    ),
  });
}

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
    return NextResponse.json(
      {
        job: toDto(job, {
          compatibilityScore: score.compatibilityScore,
          atsScore: score.atsScore,
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
