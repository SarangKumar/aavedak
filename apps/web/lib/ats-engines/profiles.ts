import "server-only";

import { analyzeEngineViaService, analyzeResumeViaService } from "@/lib/ats-service";
import { analyzeResumeFallback } from "@/lib/ats-analyze-fallback";
import type { AtsAnalysis, AtsMode } from "@/lib/ats-types";

import {
  runJobscanStyle,
  runResumeWordedStyle,
  runReziStyle,
  runSkillSyncerStyle,
  runTealStyle,
} from "./reference-profiles";
import type { AtsEngineId } from "./types";

export {
  runJobscanStyle,
  runResumeWordedStyle,
  runReziStyle,
  runSkillSyncerStyle,
  runTealStyle,
} from "./reference-profiles";

function runReferenceFallback(input: {
  engineId: AtsEngineId;
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
  mode: AtsMode;
}): AtsAnalysis {
  const shared = {
    resumeId: input.resumeId,
    resumeText: input.resumeText,
    role: input.role,
    jdText: input.jdText,
    mode: input.mode,
  };
  switch (input.engineId) {
    case "jobscan_style":
      return runJobscanStyle(shared);
    case "resume_worded_style":
      return runResumeWordedStyle(shared);
    case "teal_style":
      return runTealStyle(shared);
    case "rezi_style":
      return runReziStyle(shared);
    case "skillsyncer_style":
      return runSkillSyncerStyle(shared);
    default:
      throw new Error(`Unsupported reference engine: ${input.engineId}`);
  }
}

/** Aavedak native — Python primary with local TS fallback. */
export async function runAavedakNative(input: {
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
}): Promise<AtsAnalysis> {
  const remote = await analyzeEngineViaService({
    engineId: "aavedak",
    resumeId: input.resumeId,
    resumeText: input.resumeText,
    jdText: input.jdText,
    role: input.role,
  });
  if (remote) {
    return { ...remote, engineVersion: remote.engineVersion ?? "aavedak-native@2.0" };
  }
  const scored = await analyzeResumeViaService({
    resumeId: input.resumeId,
    resumeText: input.resumeText,
    jdText: input.jdText,
    role: input.role,
  });
  return {
    ...scored,
    engineVersion: scored.engineVersion ?? "aavedak-native@2.0",
  };
}

/** Any engine — FastAPI primary; TS reference or native fallback when API is unavailable. */
export async function runEngineProfile(input: {
  engineId: AtsEngineId;
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
  mode: AtsMode;
}): Promise<AtsAnalysis> {
  if (!input.resumeText.trim()) {
    return analyzeResumeFallback({
      resumeId: input.resumeId,
      resumeText: "",
      role: input.role,
      jdText: input.jdText,
    });
  }

  const remote = await analyzeEngineViaService({
    engineId: input.engineId,
    resumeId: input.resumeId,
    resumeText: input.resumeText,
    jdText: input.jdText,
    role: input.role,
    mode: input.mode,
  });
  if (remote) return remote;

  if (input.engineId === "aavedak") {
    return analyzeResumeFallback({
      resumeId: input.resumeId,
      resumeText: input.resumeText,
      role: input.role,
      jdText: input.jdText,
    });
  }

  return runReferenceFallback(input);
}
