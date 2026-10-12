import assert from "node:assert/strict";

import { isCardScoreStale } from "./ats-card-score";

const key = "Software Engineer|2";
assert.equal(isCardScoreStale(null, key, "3.0"), true, "never scored");
assert.equal(isCardScoreStale(`${key}|v3.0`, key, "3.0"), false, "same inputs + engine");
assert.equal(isCardScoreStale(`${key}|v2.3`, key, "3.0"), true, "engine version changed");
assert.equal(isCardScoreStale(`Software Engineer|4|v3.0`, key, "3.0"), true, "years changed");
assert.equal(isCardScoreStale(key, key, "3.0"), true, "legacy key without version");
assert.equal(isCardScoreStale(`${key}|v2.3`, key, null), false, "service down: inputs only");
console.log("ats-card-score tests: ok");
