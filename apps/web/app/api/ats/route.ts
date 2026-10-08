import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { analyzeResumesBatchViaService, analyzeResumeViaService } from "@/lib/ats-service";
import { detectAtsMode } from "@/lib/ats-types";
import { getProfile } from "@/lib/profile";
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
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const scoreAll = body.scoreAll === true;
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";

  const profile = await getProfile(authResult.user.id);
  const mode = detectAtsMode(role, jdText);

  if (scoreAll) {
    const resumes = await listResumes(authResult.user.id);
    if (resumes.length === 0) {
      return NextResponse.json({ error: "Upload a resume on Documents first." }, { status: 400 });
    }

    const { results, engine } = await analyzeResumesBatchViaService({
      jdText,
      role,
      resumes: resumes.map((resume) => ({
        id: resume.id,
        text: resume.textExcerpt || "",
      })),
    });

    return NextResponse.json({
      engine,
      mode,
      role: role || null,
      profileSkills: profile?.career?.skills ?? [],
      results: results.map((row) => {
        const resume = resumes.find((r) => r.id === row.resumeId);
        return {
          ...row,
          displayName: resume?.displayName ?? row.resumeId,
          status: resume?.status ?? "unknown",
        };
      }),
    });
  }

  const resume = resumeId
    ? await getResume(authResult.user.id, resumeId)
    : await getActiveResume(authResult.user.id);
  if (!resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  const scored = await analyzeResumeViaService({
    resumeId: resume.id,
    resumeText: resume.textExcerpt || "",
    jdText,
    role,
  });

  return NextResponse.json({
    resume: {
      id: resume.id,
      displayName: resume.displayName,
      atsScore: resume.atsScore ?? scored.scores.atsCompatibility ?? null,
    },
    ...scored,
    mode: scored.mode ?? mode,
  });
}
