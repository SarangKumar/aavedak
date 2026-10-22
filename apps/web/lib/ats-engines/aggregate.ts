import type { AtsEngineId } from "./types";

/**
 * Final (aggregate) ATS score weights — the single place to tune them.
 *
 * Group weights: the native engine carries the most (it is the best-of benchmark and the only one
 * we fully control), reference engines next (vendor-documented criteria), then the ATS platform
 * profiles (a real ATS's own documented fields, but measuring parse readiness rather than fit),
 * and open-source ports least (narrow upstream rubrics; some are similarity-only).
 *
 * Engine weights split a group's share: engines whose criteria are better documented or audited
 * count more. Missing engines (not selected, needs a JD, failed, unavailable) are dropped and the
 * remaining weights renormalised, both across groups and within a group.
 */
export const ATS_GROUP_WEIGHTS = {
  native: 0.45,
  reference: 0.3,
  platform: 0.15,
  open_source: 0.1,
} as const;

export type AtsEngineGroup = keyof typeof ATS_GROUP_WEIGHTS;

export const ATS_ENGINE_WEIGHTS: Record<AtsEngineId, { group: AtsEngineGroup; weight: number }> = {
  aavedak: { group: "native", weight: 1 },
  // Published match-rate priorities / 100-point categories.
  jobscan_style: { group: "reference", weight: 1.2 },
  skillsyncer_style: { group: "reference", weight: 1.1 },
  // Documented check lists; formulas inferred.
  resume_worded_style: { group: "reference", weight: 1.0 },
  rezi_style: { group: "reference", weight: 1.0 },
  teal_style: { group: "reference", weight: 0.9 },
  // Only the checker's categories are public.
  enhancv_style: { group: "reference", weight: 0.8 },
  // Line-by-line audited ports with full rubrics.
  open_ats: { group: "open_source", weight: 1.0 },
  ats_resume_checker: { group: "open_source", weight: 1.0 },
  // Similarity-heavy / validation-style rubrics.
  resume_skills_extractor: { group: "open_source", weight: 0.8 },
  hybrid_resume_analyzer: { group: "open_source", weight: 0.7 },
  // Field models published field-by-field (Greenhouse, Workable) count more than ones described
  // only as profile blocks (iCIMS) or limited to what the parser fills (Lever).
  greenhouse_ats: { group: "platform", weight: 1.2 },
  workable_ats: { group: "platform", weight: 1.1 },
  lever_ats: { group: "platform", weight: 1.0 },
  icims_ats: { group: "platform", weight: 0.9 },
};

export type FinalScoreEntry = { engineId: AtsEngineId; score: number };

export type FinalScore = {
  score: number;
  /** Effective weight (0–1, sums to 1) each contributing engine got after renormalising. */
  parts: { engineId: AtsEngineId; group: AtsEngineGroup; weight: number; score: number }[];
};

export function weightedFinalScore(entries: FinalScoreEntry[]): FinalScore | null {
  const valid = entries.filter((e) => Number.isFinite(e.score) && ATS_ENGINE_WEIGHTS[e.engineId]);
  if (valid.length === 0) return null;

  const byGroup = new Map<AtsEngineGroup, FinalScoreEntry[]>();
  for (const e of valid) {
    const g = ATS_ENGINE_WEIGHTS[e.engineId].group;
    byGroup.set(g, [...(byGroup.get(g) ?? []), e]);
  }
  const groupTotal = [...byGroup.keys()].reduce((sum, g) => sum + ATS_GROUP_WEIGHTS[g], 0);

  const parts: FinalScore["parts"] = [];
  for (const [group, list] of byGroup) {
    const share = ATS_GROUP_WEIGHTS[group] / groupTotal;
    const inner = list.reduce((sum, e) => sum + ATS_ENGINE_WEIGHTS[e.engineId].weight, 0);
    for (const e of list) {
      parts.push({
        engineId: e.engineId,
        group,
        score: e.score,
        weight: (share * ATS_ENGINE_WEIGHTS[e.engineId].weight) / inner,
      });
    }
  }
  const score = Math.round(parts.reduce((sum, p) => sum + p.score * p.weight, 0));
  return { score, parts };
}
