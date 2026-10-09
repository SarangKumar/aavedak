import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { runEngineProfile } from "@/lib/ats-engines/profiles";
import { buildCombinations, getEngine, scoreTypeLabel } from "@/lib/ats-engines/registry";
import type { AtsBatchResultCell, AtsEngineId, EngineRunRequest } from "@/lib/ats-engines/types";
import { normalizeAtsIssues } from "@/lib/ats-types";
import { ensureResumeText, getResume } from "@/lib/resumes";

const MAX_JD_CHARS = 40_000;

/**
 * Run a single resume × engine combination (for progressive UI updates).
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const userId = authResult.user.id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const resumeId = typeof body.resumeId === "string" ? body.resumeId : "";
  const engineId = typeof body.engineId === "string" ? body.engineId : "";
  if (!resumeId || !getEngine(engineId)) {
    return NextResponse.json(
      { error: "resumeId and a valid engineId are required." },
      { status: 400 },
    );
  }

  const engReq: EngineRunRequest = {
    engineId: engineId as AtsEngineId,
    mode:
      body.mode === "resume_only" || body.mode === "role_match" || body.mode === "job_match"
        ? body.mode
        : undefined,
    role: typeof body.role === "string" ? body.role : undefined,
    jdText: typeof body.jdText === "string" ? body.jdText : undefined,
  };
  const sharedRole = typeof body.sharedRole === "string" ? body.sharedRole.trim() : "";
  const sharedJd = typeof body.sharedJdText === "string" ? body.sharedJdText : "";
  if (sharedJd.length > MAX_JD_CHARS || (engReq.jdText?.length ?? 0) > MAX_JD_CHARS) {
    return NextResponse.json({ error: "Job description is too long." }, { status: 400 });
  }

  const resume = await getResume(userId, resumeId);
  if (!resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  const [combo] = buildCombinations({
    resumeIds: [resumeId],
    engines: [engReq],
    shared: { role: sharedRole, jdText: sharedJd },
  });
  const eng = getEngine(engineId)!;

  if (!combo || combo.status !== "ready") {
    const cell: AtsBatchResultCell = {
      resumeId,
      engineId: eng.id,
      status: combo?.status === "needs_input" ? "excluded" : "unsupported",
      mode: combo?.mode,
      scoreType: combo?.scoreType,
      scoreName: combo ? scoreTypeLabel(combo.scoreType) : undefined,
      error: combo?.reason || "Combination not runnable.",
      profileVersion: eng.profileVersion,
    };
    return NextResponse.json({ result: cell });
  }

  let text = "";
  try {
    const ensured = await ensureResumeText(userId, resumeId, {
      force: body.forceExtract === true,
    });
    text = ensured.text.trim();
    if (text.length < 40) {
      return NextResponse.json({
        result: {
          resumeId,
          engineId: eng.id,
          status: "error",
          mode: combo.mode,
          scoreType: combo.scoreType,
          scoreName: scoreTypeLabel(combo.scoreType),
          error:
            ensured.extractError ||
            "Could not extract readable text from this PDF. Re-upload a text-based resume on Documents.",
          profileVersion: eng.profileVersion,
        } satisfies AtsBatchResultCell,
      });
    }
  } catch (err) {
    return NextResponse.json({
      result: {
        resumeId,
        engineId: eng.id,
        status: "error",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        error: err instanceof Error ? err.message : "Could not read resume PDF.",
        profileVersion: eng.profileVersion,
      } satisfies AtsBatchResultCell,
    });
  }

  try {
    const analysis = await runEngineProfile({
      engineId: eng.id,
      resumeId,
      resumeText: text,
      role: combo.role,
      jdText: combo.jdText,
      mode: combo.mode,
    });
    const result: AtsBatchResultCell = {
      resumeId,
      engineId: eng.id,
      status: analysis.error ? "error" : "done",
      mode: analysis.mode ?? combo.mode,
      scoreType: combo.scoreType,
      scoreName: analysis.scoreName || scoreTypeLabel(combo.scoreType),
      overallScore: analysis.error ? null : analysis.overallScore,
      scoreLabel: analysis.scoreLabel,
      analysis: { ...analysis, atsIssues: normalizeAtsIssues(analysis.atsIssues) },
      error: analysis.error,
      engineRuntime:
        analysis.engine === "fastapi" ? "fastapi" : eng.id === "aavedak" ? "fallback" : "reference",
      profileVersion: eng.profileVersion,
    };
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({
      result: {
        resumeId,
        engineId: eng.id,
        status: "error",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        error: err instanceof Error ? err.message : "Analysis failed.",
        profileVersion: eng.profileVersion,
      } satisfies AtsBatchResultCell,
    });
  }
}
