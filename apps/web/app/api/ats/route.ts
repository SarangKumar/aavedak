import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { scoreResumeAgainstJd, scoreResumeAtsReadiness } from "@/lib/match-score";
import { ensureProfile } from "@/lib/profile";
import { getActiveResume, getResume, listResumes } from "@/lib/resumes";

export async function GET() {
  const session = await auth.api.getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  const resumes = await listResumes(session.user.id);
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
  const session = await auth.api.getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
  const jdText = typeof body.jdText === "string" ? body.jdText : "";
  const resume = resumeId
    ? await getResume(session.user.id, resumeId)
    : await getActiveResume(session.user.id);
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
