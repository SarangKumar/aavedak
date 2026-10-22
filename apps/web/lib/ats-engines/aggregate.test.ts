import assert from "node:assert/strict";

import { ATS_ENGINE_WEIGHTS, ATS_GROUP_WEIGHTS, weightedFinalScore } from "./aggregate";
import { ATS_ENGINES } from "./registry";

for (const e of ATS_ENGINES) assert.ok(ATS_ENGINE_WEIGHTS[e.id], `weight for ${e.id}`);
// Every engine's aggregate group is its registry kind — the kinds and the groups are the same set.
for (const e of ATS_ENGINES) {
  assert.equal(ATS_ENGINE_WEIGHTS[e.id].group, e.kind, `${e.id} group matches registry kind`);
}
assert.equal(weightedFinalScore([]), null);

// Native alone → its own score.
assert.equal(weightedFinalScore([{ engineId: "aavedak", score: 80 }])!.score, 80);

// Not a plain average: native 100, one ref 0, one oss 0 → native's renormalised group share
// across the three groups that ran (a plain mean would be 33).
const mixed = weightedFinalScore([
  { engineId: "aavedak", score: 100 },
  { engineId: "jobscan_style", score: 0 },
  { engineId: "open_ats", score: 0 },
])!;
const threeGroups =
  ATS_GROUP_WEIGHTS.native + ATS_GROUP_WEIGHTS.reference + ATS_GROUP_WEIGHTS.open_source;
assert.equal(mixed.score, Math.round((100 * ATS_GROUP_WEIGHTS.native) / threeGroups));
assert.ok(mixed.score > 33, "weighted, not a mean");
assert.ok(Math.abs(mixed.parts.reduce((s, p) => s + p.weight, 0) - 1) < 1e-9);

// Missing groups renormalise: native + oss only → native's share of those two groups.
const noRef = weightedFinalScore([
  { engineId: "aavedak", score: 100 },
  { engineId: "open_ats", score: 0 },
])!;
assert.equal(
  noRef.score,
  Math.round(
    (100 * ATS_GROUP_WEIGHTS.native) / (ATS_GROUP_WEIGHTS.native + ATS_GROUP_WEIGHTS.open_source),
  ),
);

// An ATS platform profile is its own group, so it neither rides on nor dilutes the OSS share.
const withPlatform = weightedFinalScore([
  { engineId: "aavedak", score: 100 },
  { engineId: "greenhouse_ats", score: 0 },
])!;
assert.equal(
  withPlatform.score,
  Math.round(
    (100 * ATS_GROUP_WEIGHTS.native) / (ATS_GROUP_WEIGHTS.native + ATS_GROUP_WEIGHTS.platform),
  ),
);
const platforms = weightedFinalScore([
  { engineId: "greenhouse_ats", score: 100 },
  { engineId: "icims_ats", score: 0 },
])!;
assert.equal(platforms.score, Math.round((100 * 1.2) / (1.2 + 0.9)));

// Within a group, higher-weight engines count more.
const refs = weightedFinalScore([
  { engineId: "jobscan_style", score: 100 },
  { engineId: "enhancv_style", score: 0 },
])!;
assert.equal(refs.score, Math.round((100 * 1.2) / 2.0));
console.log("aggregate tests: ok");
