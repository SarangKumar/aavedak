import type { AtsAnalysis, AtsMode } from "@/lib/ats-types";

/** How an engine treats a given input field. */
export type InputRequirement = "required" | "optional" | "unsupported";

export type AtsEngineId =
  | "aavedak"
  | "jobscan_style"
  | "resume_worded_style"
  | "teal_style"
  | "rezi_style"
  | "skillsyncer_style"
  | "open_ats"
  | "ats_resume_checker"
  | "resume_skills_extractor"
  | "hybrid_resume_analyzer";

export type AtsScoreType =
  | "resume_quality"
  | "job_match"
  | "role_match"
  | "ats_readability"
  | "resume_optimization"
  | "weighted_job_match"
  | "ats_scan"
  | "ats_readiness"
  | "skill_similarity_match"
  | "hybrid_match"
  | "resume_validation";

export type EngineCapability = {
  id: AtsEngineId;
  name: string;
  shortDescription: string;
  /** Independent Aavedak implementation vs public-doc reference profile. */
  kind: "native" | "reference" | "open_source";
  /** Open-source project the engine is adapted from (kind "open_source"). */
  referenceRepo?: string;
  /** Modes this engine can run (product config — not a vendor claim). */
  supportedModes: AtsMode[];
  title: InputRequirement;
  jd: InputRequirement;
  /** Default mode when inputs allow multiple. */
  preferredMode: AtsMode;
  scoreTypes: AtsScoreType[];
  /** Explicit score type per mode; falls back to scoreTypes preference rules when absent. */
  scoreTypeByMode?: Partial<Record<AtsMode, AtsScoreType>>;
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
  "idle" | "queued" | "running" | "done" | "error" | "unsupported" | "excluded" | "cancelled";

/** Backend-reported processing stages (mirrors apps/api/app/ats/pipeline.py). */
export type AtsStage =
  | "queued"
  | "validating_input"
  | "parsing_resume"
  | "parsing_job_description"
  | "extracting_skills"
  | "analyzing_content"
  | "matching_keywords"
  | "calculating_score"
  | "generating_report"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "cancelled";

/** Why a combination produced no score — never shown as a generic "N/A". */
export type AtsFailureKind =
  | "unsupported_mode"
  | "missing_input"
  | "parsing_failure"
  | "analysis_failure"
  | "service_unavailable";

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
  failureKind?: AtsFailureKind;
  engineRuntime?: "fastapi";
  profileVersion?: string;
  /** Current/last backend stage for this combination. */
  stage?: AtsStage;
  stageMessage?: string;
  stageAt?: string;
  /** Client run id + backend sequence: used to drop stale or out-of-order updates. */
  runId?: string;
  seq?: number;
};

/** NDJSON event streamed by POST /api/ats/run with `stream: true`. */
export type AtsRunEvent =
  | {
      type: "stage";
      resumeId: string;
      engineId: AtsEngineId;
      runId: string;
      seq: number;
      stage: AtsStage;
      message?: string;
      at: string;
    }
  | { type: "result"; runId: string; seq: number; result: AtsBatchResultCell };
