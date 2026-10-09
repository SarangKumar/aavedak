import { isAtsStage } from "./stages";
import type { AtsBatchResultCell, AtsRunEvent } from "./types";

/**
 * Read the NDJSON body of POST /api/ats/run (`stream: true`).
 * Calls `onStage` for each stage event of `runId` and resolves with the final result cell,
 * or null if the stream ended without one. Malformed lines and other runs' events are ignored.
 */
export async function readRunStream(
  body: ReadableStream<Uint8Array>,
  runId: string,
  onStage: (event: Extract<AtsRunEvent, { type: "stage" }>) => void,
): Promise<AtsBatchResultCell | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let ev: AtsRunEvent;
      try {
        ev = JSON.parse(line) as AtsRunEvent;
      } catch {
        continue;
      }
      if (ev.runId !== runId) continue;
      if (ev.type === "stage" && isAtsStage(ev.stage)) onStage(ev);
      else if (ev.type === "result" && ev.result) return ev.result;
    }
    if (done) return null;
  }
}
