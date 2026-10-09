import "server-only";

import { analyzeResumeFallback } from "@/lib/ats-analyze-fallback";
import { analyzeResumeViaService } from "@/lib/ats-service";
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

/** Aavedak native — Python primary with local fallback. */
export async function runAavedakNative(input: {
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
}): Promise<AtsAnalysis> {
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
  const shared = {
    resumeId: input.resumeId,
    resumeText: input.resumeText,
    role: input.role,
    jdText: input.jdText,
    mode: input.mode,
  };
  switch (input.engineId) {
    case "aavedak":
      return runAavedakNative(shared);
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
      throw new Error(`Unsupported engine: ${input.engineId}`);
  }
}
