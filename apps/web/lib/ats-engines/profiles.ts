import "server-only";

import {
  analyzeEngineViaService,
  AtsServiceUnavailableError,
  SERVICE_UNAVAILABLE_MESSAGE,
  streamEngineViaService,
  type ServiceStageEvent,
} from "@/lib/ats-service";
import type { AtsAnalysis, AtsMode } from "@/lib/ats-types";

import type { AtsEngineId, AtsFailureKind } from "./types";

/**
 * Every engine runs in Python (FastAPI `app/ats/`). There is no local TypeScript scoring:
 * when the service is unreachable the run fails explicitly as "Service unavailable" instead
 * of substituting a different score.
 */

const EMPTY_TEXT_MESSAGE =
  "Could not read text from this resume. Re-upload a text-based PDF on Documents.";

/** One engine run (JSON). Throws on empty text or when FastAPI is unavailable. */
export async function runEngineProfile(input: {
  engineId: AtsEngineId;
  resumeId: string;
  resumeText: string;
  role: string;
  jdText: string;
  mode: AtsMode;
}): Promise<AtsAnalysis> {
  if (!input.resumeText.trim()) throw new Error(EMPTY_TEXT_MESSAGE);

  const remote = await analyzeEngineViaService({
    engineId: input.engineId,
    resumeId: input.resumeId,
    resumeText: input.resumeText,
    jdText: input.jdText,
    role: input.role,
    mode: input.mode,
  });
  if (!remote) throw new AtsServiceUnavailableError();
  return remote;
}

export type StreamedRunOutcome =
  | {
      kind: "result";
      analysis: AtsAnalysis;
      stage: "completed" | "completed_with_warnings";
      runtime: "fastapi";
    }
  | { kind: "failed"; failureKind: AtsFailureKind; message: string };

/** Like runEngineProfile, but reports backend stages through `onStage` as they happen. */
export async function runEngineProfileStreamed(
  input: {
    engineId: AtsEngineId;
    resumeId: string;
    resumeText: string;
    role: string;
    jdText: string;
    mode: AtsMode;
    runId: string;
    signal?: AbortSignal;
  },
  onStage: (event: Omit<ServiceStageEvent, "seq">) => void,
): Promise<StreamedRunOutcome> {
  if (!input.resumeText.trim()) {
    return { kind: "failed", failureKind: "parsing_failure", message: EMPTY_TEXT_MESSAGE };
  }
  const remote = await streamEngineViaService(input, onStage);
  if (remote?.kind === "failed") return remote;
  if (remote) return { ...remote, runtime: "fastapi" };
  return {
    kind: "failed",
    failureKind: "service_unavailable",
    message: SERVICE_UNAVAILABLE_MESSAGE,
  };
}
