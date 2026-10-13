import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanJobDescription, stripJdBoilerplate } from "./jd-clean";

// Same fixture as FastAPI's test_jd_boilerplate_is_stripped_with_shared_patterns.
const dir = join(__dirname, "../../../data/jd/fixtures");
const sample = readFileSync(join(dir, "sample.txt"), "utf8");
const expected = readFileSync(join(dir, "sample.expected.txt"), "utf8").trim();
assert.equal(stripJdBoilerplate(sample), expected);
assert.equal(
  stripJdBoilerplate("Privacy Notice\nWe process personal data."),
  "Privacy Notice\nWe process personal data.",
);
const plain = "Responsibilities\n• Build APIs.\n\nRequirements\n• Python.";
assert.deepEqual(cleanJobDescription(plain), { description: plain, descriptionRaw: null });
assert.equal(cleanJobDescription(sample).descriptionRaw, sample);
console.log("jd-clean tests: ok");
