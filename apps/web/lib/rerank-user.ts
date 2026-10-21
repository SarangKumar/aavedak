import "server-only";

import { DiscoveryApiError, discoveryAdmin } from "@/lib/discovery-api";

export type RerankCounts = { rescored: number; dropped: number; added: number; restored?: number };
export type RerankResult = RerankCounts | { error: string };

/**
 * Re-rank one user's recommendations now (FastAPI `ranking.rerank_user`): re-score the open
 * list, hide what no longer fits, restore earlier hidden jobs that fit again, and top up from
 * the shared pool within today's cap. A user who is not yet approved and onboarded gets zeros.
 *
 * Never throws: callers have already saved their change, so a ranking failure is returned as
 * `{ error }` for them to report.
 */
export async function rerankUser(userId: string): Promise<RerankResult> {
  try {
    return await discoveryAdmin<RerankCounts>("/rerank-user", {
      method: "POST",
      body: { userId },
      timeoutMs: 60_000,
    });
  } catch (err) {
    return {
      error:
        err instanceof DiscoveryApiError
          ? err.message
          : "Could not re-rank your jobs. Try again from Jobs → Refresh.",
    };
  }
}
