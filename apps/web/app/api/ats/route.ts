import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { scoreResumeAgainstJd, scoreResumeAtsReadiness } from "@/lib/match-score";
import { getActiveResume, getResume, listResumes } from "@/lib/resumes";

export async function GET() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const resumes = await listResumes(authResult.user.id);
  return NextResponse.json({
    resumes: resumes.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      status: r.status,
      atsScore: r.atsScore,
      byteSize: r.byteSize,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jdText = typeof body.jdText === "string" ? body.jdText : "";
  const scoreAll = body.scoreAll === true;
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";

  if (scoreAll) {
    if (!jdText.trim()) {
      return NextResponse.json({ error: "Job description is required." }, { status: 400 });
    }
    const resumes = await listResumes(authResult.user.id);
    const results = resumes.map((resume) => {
      const excerpt = resume.textExcerpt || "";
      const againstJd = scoreResumeAgainstJd(excerpt, jdText);
      return {
        resumeId: resume.id,
        displayName: resume.displayName,
        status: resume.status,
        readiness: scoreResumeAtsReadiness(excerpt),
        againstJd,
      };
    });
    return NextResponse.json({ results });
  }

  const resume = resumeId
    ? await getResume(authResult.user.id, resumeId)
    : await getActiveResume(authResult.user.id);
  if (!resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }
  const excerpt = resume.textExcerpt || "";
  const readiness = scoreResumeAtsReadiness(excerpt);
  const againstJd = jdText.trim() ? scoreResumeAgainstJd(excerpt, jdText) : null;

  return NextResponse.json({
    resume: {
      id: resume.id,
      displayName: resume.displayName,
      atsScore: resume.atsScore ?? readiness.atsScore,
    },
    readiness,
    againstJd,
  });
}
