import type { AtsAnalysis, AtsMode } from "@/lib/ats-types";

/** How an engine treats a given input field. */
export type InputRequirement = "required" | "optional" | "unsupported";

export type AtsEngineId =
  | "aavedak"
  | "jobscan_style"
  | "resume_worded_style"
  | "teal_style"
  | "rezi_style"
  | "skillsyncer_style";

export type AtsScoreType =
  | "resume_quality"
  | "job_match"
  | "role_match"
  | "ats_readability"
  | "resume_optimization"
  | "weighted_job_match";

export type EngineCapability = {
  id: AtsEngineId;
  name: string;
  shortDescription: string;
  /** Independent Aavedak implementation vs public-doc reference profile. */
  kind: "native" | "reference";
  /** Modes this engine can run (product config — not a vendor claim). */
  supportedModes: AtsMode[];
  title: InputRequirement;
  jd: InputRequirement;
  /** Default mode when inputs allow multiple. */
  preferredMode: AtsMode;
  scoreTypes: AtsScoreType[];
  scoringProfileId: string;
  profileVersion: string;
  limitations: string[];
  /** Short plain-language summary of how the score is calculated (for UI info). */
  algoBlurb: string;
};

export type EngineRunRequest = {
  engineId: AtsEngineId;
  /** Override shared mode when set. */
  mode?: AtsMode;
  role?: string;
  jdText?: string;
};

export type SharedAtsContext = {
  role: string;
  jdText: string;
};

export type CombinationStatus = "ready" | "needs_input" | "unsupported";

export type AnalysisCombination = {
  resumeId: string;
  engineId: AtsEngineId;
  mode: AtsMode;
  role: string;
  jdText: string;
  status: CombinationStatus;
  reason?: string;
  scoreType: AtsScoreType;
};

export type AtsBatchCellStatus =
  "idle" | "queued" | "running" | "done" | "error" | "unsupported" | "excluded";

export type AtsBatchResultCell = {
  resumeId: string;
  engineId: AtsEngineId;
  status: AtsBatchCellStatus;
  mode?: AtsMode;
  scoreType?: AtsScoreType;
  scoreName?: string;
  overallScore?: number | null;
  scoreLabel?: string;
  analysis?: AtsAnalysis | null;
  error?: string;
  engineRuntime?: "fastapi" | "fallback" | "reference";
  profileVersion?: string;
};
