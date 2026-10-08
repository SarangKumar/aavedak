import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { analyzeResumeViaService } from "@/lib/ats-service";
import { detectAtsMode, fingerprintText } from "@/lib/ats-types";
import type { AtsAnalysis } from "@/lib/ats-types";
import { ensureResumeText, getActiveResume, getResume, listResumes } from "@/lib/resumes";

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
      hasText: Boolean(r.textExcerpt && r.textExcerpt.trim().length >= 40),
    })),
  });
}

function emptyTextAnalysis(
  resumeId: string,
  mode: ReturnType<typeof detectAtsMode>,
  message: string,
): AtsAnalysis {
  return {
    resumeId,
    mode,
    scoreName:
      mode === "resume_only"
        ? "Resume Quality Score"
        : mode === "role_match"
          ? "Role Match Score"
          : "ATS Match Score",
    overallScore: 0,
    scoreLabel: "Could not analyze",
    scores: {},
    matchedSkills: [],
    partialSkills: [],
    missingSkills: [],
    matchedResponsibilities: [],
    partialResponsibilities: [],
    missingResponsibilities: [],
    strengths: [],
    improvements: [],
    atsIssues: [message],
    confidence: "low",
    error: message,
    engine: "fallback",
    textChars: 0,
    textFingerprint: "empty",
  };
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
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
  const forceExtract = body.forceExtract === true;
  const mode = detectAtsMode(role, jdText);

  // List ids only — used by the client to drive sequential analysis.
  if (body.listOnly === true) {
    const resumes = await listResumes(authResult.user.id);
    return NextResponse.json({
      mode,
      resumes: resumes.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        status: r.status,
      })),
    });
  }

  const resume = resumeId
    ? await getResume(authResult.user.id, resumeId)
    : await getActiveResume(authResult.user.id);
  if (!resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  let ensured: Awaited<ReturnType<typeof ensureResumeText>>;
  try {
    ensured = await ensureResumeText(authResult.user.id, resume.id, {
      force: forceExtract,
    });
  } catch (err) {
    return NextResponse.json({
      resume: {
        id: resume.id,
        displayName: resume.displayName,
        status: resume.status,
      },
      ...emptyTextAnalysis(
        resume.id,
        mode,
        err instanceof Error ? err.message : "Could not read resume PDF.",
      ),
      mode,
    });
  }

  if (!ensured.text.trim() || ensured.text.trim().length < 40) {
    return NextResponse.json({
      resume: {
        id: resume.id,
        displayName: resume.displayName,
        status: resume.status,
      },
      ...emptyTextAnalysis(
        resume.id,
        mode,
        ensured.extractError ||
          "Could not extract readable text from this PDF. Re-upload a text-based resume on Documents.",
      ),
      mode,
    });
  }

  const scored = await analyzeResumeViaService({
    resumeId: resume.id,
    resumeText: ensured.text,
    jdText,
    role,
  });

  return NextResponse.json({
    resume: {
      id: resume.id,
      displayName: resume.displayName,
      status: resume.status,
      atsScore: resume.atsScore ?? scored.scores.atsCompatibility ?? null,
    },
    ...scored,
    resumeId: resume.id,
    mode: scored.mode ?? mode,
    textChars: scored.textChars ?? ensured.text.trim().length,
    textFingerprint: scored.textFingerprint ?? fingerprintText(ensured.text),
  });
}
