import assert from "node:assert/strict";

import { ATS_ENGINE_WEIGHTS, ATS_GROUP_WEIGHTS, weightedFinalScore } from "./aggregate";
import { ATS_ENGINES } from "./registry";

for (const e of ATS_ENGINES) assert.ok(ATS_ENGINE_WEIGHTS[e.id], `weight for ${e.id}`);
for (const e of ATS_ENGINES) {
  const group =
    e.kind === "native" ? "native" : e.kind === "reference" ? "reference" : "open_source";
  assert.equal(ATS_ENGINE_WEIGHTS[e.id].group, group, `${e.id} group matches registry kind`);
}
assert.equal(weightedFinalScore([]), null);

// Native alone → its own score.
assert.equal(weightedFinalScore([{ engineId: "aavedak", score: 80 }])!.score, 80);

// Not a plain average: native 100, one ref 0, one oss 0 → 50 (plain mean would be 33).
const mixed = weightedFinalScore([
  { engineId: "aavedak", score: 100 },
  { engineId: "jobscan_style", score: 0 },
  { engineId: "open_ats", score: 0 },
])!;
assert.equal(mixed.score, Math.round(100 * ATS_GROUP_WEIGHTS.native));
assert.ok(Math.abs(mixed.parts.reduce((s, p) => s + p.weight, 0) - 1) < 1e-9);

// Missing group renormalises: native + oss only → native 0.5/0.65.
const noRef = weightedFinalScore([
  { engineId: "aavedak", score: 100 },
  { engineId: "open_ats", score: 0 },
])!;
assert.equal(noRef.score, Math.round((100 * 0.5) / 0.65));

// Within a group, higher-weight engines count more.
const refs = weightedFinalScore([
  { engineId: "jobscan_style", score: 100 },
  { engineId: "enhancv_style", score: 0 },
])!;
assert.equal(refs.score, Math.round((100 * 1.2) / 2.0));
console.log("aggregate tests: ok");
