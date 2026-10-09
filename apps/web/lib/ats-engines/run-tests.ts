/**
 * Lightweight ATS engine registry / profile tests.
 * Run: npx --yes tsx lib/ats-engines/run-tests.ts   (from apps/web)
 */
import assert from "node:assert/strict";

import { calibrationReport } from "./calibration/compare";
import { buildCombinations, getEngine, summarizeCombinations, ATS_ENGINES } from "./registry";
import {
  runJobscanStyle,
  runResumeWordedStyle,
  runReziStyle,
  runSkillSyncerStyle,
  runTealStyle,
} from "./reference-profiles";
import { clamp, countPhrase, frequencyCategoryPoints, skillsyncerDegreePoints } from "./signals";
import { SKILLSYNCER_POINTS } from "./weights";

function testRegistryMatrix() {
  const aavedak = getEngine("aavedak")!;
  assert.equal(aavedak.kind, "native");
  assert.ok(aavedak.algoBlurb.length > 20);

  const jobscan = getEngine("jobscan_style")!;
  assert.equal(jobscan.jd, "required");
  assert.deepEqual(jobscan.supportedModes, ["job_match"]);

  const syncer = getEngine("skillsyncer_style")!;
  assert.equal(syncer.title, "required");
  assert.equal(syncer.jd, "required");
}

function testCombinationsOnlySelected() {
  const combos = buildCombinations({
    resumeIds: ["r1", "r2"],
    engines: [{ engineId: "aavedak" }, { engineId: "jobscan_style" }],
    shared: { role: "Backend", jdText: "" },
  });
  assert.equal(combos.length, 4);
  const summary = summarizeCombinations(combos);
  assert.equal(summary.readyCount, 2);
  assert.equal(summary.needsCount, 2);
  assert.ok(summary.needs.every((c) => c.engineId === "jobscan_style"));
}

function testJobscanRequiresJd() {
  const combos = buildCombinations({
    resumeIds: ["r1"],
    engines: [{ engineId: "jobscan_style" }],
    shared: { role: "x", jdText: "Requirements: Python FastAPI" },
  });
  assert.equal(combos[0]!.status, "ready");
}

function testNaRegressionWithFullInputs() {
  const combos = buildCombinations({
    resumeIds: ["r1"],
    engines: ATS_ENGINES.map((e) => ({ engineId: e.id })),
    shared: {
      role: "Backend Engineer",
      jdText: "Requirements: Python FastAPI Docker Kubernetes. Bachelor's preferred.",
    },
  });
  assert.equal(combos.length, 6);
  assert.equal(
    summarizeCombinations(combos).readyCount,
    6,
    "All six engines must be ready when title+JD are supplied",
  );
  assert.equal(summarizeCombinations(combos).needsCount, 0);
}

function testSkillSyncerFormula() {
  assert.equal(skillsyncerDegreePoints(0, 0), 10);
  assert.equal(skillsyncerDegreePoints(2, 2), 10);
  assert.equal(skillsyncerDegreePoints(1, 2), 5);
  assert.equal(skillsyncerDegreePoints(0, 1), 0);

  const empty = frequencyCategoryPoints([], "python docker", "python docker", 60);
  assert.equal(empty.points, 60);

  const half = frequencyCategoryPoints(
    ["python", "kubernetes"],
    "python fastapi",
    "python kubernetes",
    60,
  );
  assert.ok(half.points > 25 && half.points < 45);
  assert.deepEqual(half.missing, ["kubernetes"]);

  assert.equal(countPhrase("i use react.js daily", "react.js"), 1);
  assert.equal(countPhrase("reaction time", "react"), 0);
  assert.equal(clamp(120), 100);
  assert.equal(clamp(-5), 0);

  const P = SKILLSYNCER_POINTS;
  assert.equal(P.hard + P.soft + P.other + P.title + P.degree, 100);
}

const SAMPLE_RESUME = `
Jane
jane@example.com | +1 555 0100
EXPERIENCE
Backend Engineer — 2020 – Present
Built FastAPI services in Python with PostgreSQL cutting latency 30%.
SKILLS
Python, FastAPI, PostgreSQL, SQL, Docker
EDUCATION
B.S. Computer Science
`;

const SAMPLE_JD = `
Backend Engineer
Requirements: Python, FastAPI, PostgreSQL, Docker, Kubernetes
Responsibilities: Design and build scalable backend APIs
Education: Bachelor's degree
`;

function testProfilesDistinctAndBounded() {
  const base = {
    resumeId: "1",
    resumeText: SAMPLE_RESUME,
    role: "Backend Engineer",
    jdText: SAMPLE_JD,
  };
  const js = runJobscanStyle({ ...base, mode: "job_match" });
  const sync = runSkillSyncerStyle({ ...base, mode: "job_match" });
  const tealQ = runTealStyle({ ...base, role: "", jdText: "", mode: "resume_only" });
  const tealJ = runTealStyle({ ...base, mode: "job_match" });
  const rw = runResumeWordedStyle({ ...base, mode: "resume_only" });
  const rezi = runReziStyle({ ...base, mode: "resume_only" });

  assert.equal(js.mode, "job_match");
  assert.ok(js.overallScore >= 0 && js.overallScore <= 100);
  assert.ok(sync.overallScore >= 0 && sync.overallScore <= 100);
  assert.equal(tealQ.mode, "resume_only");
  assert.equal(tealQ.scoreName, "Resume Score");
  assert.equal(tealJ.mode, "job_match");
  assert.equal(tealJ.scoreName, "Job Match Score");
  assert.equal(rw.mode, "resume_only");
  assert.ok(rezi.overallScore >= 0 && rezi.overallScore <= 100);
  assert.notEqual(js.engineVersion, sync.engineVersion);
  assert.ok((sync.notes || []).some((n) => n.includes("60") || n.includes("hard")));
}

function testSelectAllEnginesCount() {
  assert.equal(ATS_ENGINES.length, 6);
  const combos = buildCombinations({
    resumeIds: ["a", "b", "c"],
    engines: ATS_ENGINES.map((e) => ({ engineId: e.id })),
    shared: { role: "Cloud Engineer", jdText: "Must have AWS Docker Kubernetes Python" },
  });
  assert.equal(combos.length, 18);
  const summary = summarizeCombinations(combos);
  assert.ok(summary.readyCount >= 12);
}

function testCalibrationScaffold() {
  const report = calibrationReport();
  assert.ok(report.rows.length >= 5);
  assert.ok(report.rows.every((r) => r.aavedakScore >= 0 && r.aavedakScore <= 100));
}

testRegistryMatrix();
testCombinationsOnlySelected();
testJobscanRequiresJd();
testNaRegressionWithFullInputs();
testSkillSyncerFormula();
testProfilesDistinctAndBounded();
testSelectAllEnginesCount();
testCalibrationScaffold();
console.log("ats-engines tests: ok");
