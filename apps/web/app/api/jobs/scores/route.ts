import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { listJobScores, rescoreAllJobsForUser } from "@/lib/job-scoring";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const scores = await listJobScores(auth.user.id);
  return NextResponse.json({
    scores: scores.map((s) => ({
      jobId: s.jobId,
      resumeId: s.resumeId,
      compatibilityScore: s.compatibilityScore,
      atsScore: s.atsScore,
      details: s.details,
      updatedAt: s.updatedAt,
    })),
  });
}

export async function POST() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const counted = await rescoreAllJobsForUser(auth.user.id);
  const scores = await listJobScores(auth.user.id);
  return NextResponse.json({
    scored: counted,
    scores: scores.map((s) => ({
      jobId: s.jobId,
      resumeId: s.resumeId,
      compatibilityScore: s.compatibilityScore,
      atsScore: s.atsScore,
      details: s.details,
      updatedAt: s.updatedAt,
    })),
  });
}
