/**
 * Lightweight ATS engine registry / profile tests.
 * Run: npx --yes tsx lib/ats-engines/run-tests.ts   (from apps/web)
 */
import assert from "node:assert/strict";

import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CellStatusLabel, EngineLabel } from "@/components/ats-engine-badge";

import { readRunStream } from "./run-stream";
import { applyCellUpdate, cellDisplay, STAGE_LABELS } from "./stages";
import type { AtsBatchResultCell, AtsEngineId, AtsStage } from "./types";

import { calibrationReport } from "./calibration/compare";
import {
  buildCombinations,
  getEngine,
  scoreTypeForMode,
  summarizeCombinations,
  ATS_ENGINES,
} from "./registry";
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
  assert.equal(combos.length, 10);
  assert.equal(
    summarizeCombinations(combos).readyCount,
    10,
    "All ten engines must be ready when title+JD are supplied",
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
  assert.equal(ATS_ENGINES.length, 10);
  const combos = buildCombinations({
    resumeIds: ["a", "b", "c"],
    engines: ATS_ENGINES.map((e) => ({ engineId: e.id })),
    shared: { role: "Cloud Engineer", jdText: "Must have AWS Docker Kubernetes Python" },
  });
  assert.equal(combos.length, 30);
  const summary = summarizeCombinations(combos);
  assert.ok(summary.readyCount >= 12);
}

function testCalibrationScaffold() {
  const report = calibrationReport();
  assert.ok(report.rows.length >= 5);
  assert.ok(report.rows.every((r) => r.aavedakScore >= 0 && r.aavedakScore <= 100));
}

const NEW_ENGINES: AtsEngineId[] = [
  "open_ats",
  "ats_resume_checker",
  "resume_skills_extractor",
  "hybrid_resume_analyzer",
];

function testNewEnginesRegistered() {
  const ids = ATS_ENGINES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "engine ids must be unique");
  for (const id of NEW_ENGINES) {
    const eng = getEngine(id)!;
    assert.ok(eng, id);
    assert.equal(eng.kind, "open_source");
    assert.equal(eng.fallback, "none", `${id} must not fake a local score`);
    assert.ok(eng.referenceRepo?.startsWith("github.com/"));
    for (const mode of eng.supportedModes) assert.ok(eng.scoreTypeByMode?.[mode], `${id}:${mode}`);
  }
  assert.equal(scoreTypeForMode(getEngine("ats_resume_checker")!, "resume_only"), "resume_quality");
  assert.equal(scoreTypeForMode(getEngine("ats_resume_checker")!, "job_match"), "ats_readiness");
  assert.equal(scoreTypeForMode(getEngine("hybrid_resume_analyzer")!, "job_match"), "hybrid_match");
}

function testNewEngineModes() {
  const run = (role: string, jdText: string) =>
    new Map(
      buildCombinations({
        resumeIds: ["r"],
        engines: NEW_ENGINES.map((engineId) => ({ engineId })),
        shared: { role, jdText },
      }).map((c) => [c.engineId, c]),
    );
  const none = run("", "");
  for (const id of ["ats_resume_checker", "open_ats", "hybrid_resume_analyzer"] as const) {
    assert.equal(none.get(id)!.status, "ready", id);
    assert.equal(none.get(id)!.mode, "resume_only", id);
  }
  assert.equal(none.get("open_ats")!.scoreType, "resume_quality");
  assert.equal(none.get("hybrid_resume_analyzer")!.scoreType, "resume_validation");
  const extractor = none.get("resume_skills_extractor")!;
  assert.equal(extractor.status, "needs_input");
  assert.match(extractor.reason ?? "", /job title or job description/);
  const titleOnly = run("Backend Engineer", "");
  for (const id of NEW_ENGINES) {
    assert.equal(titleOnly.get(id)!.status, "ready", id);
    assert.equal(titleOnly.get(id)!.mode, "role_match", id);
  }
  assert.equal(titleOnly.get("resume_skills_extractor")!.scoreType, "role_match");
  const full = run("Backend Engineer", "Python FastAPI Docker Kubernetes");
  assert.ok([...full.values()].every((c) => c.status === "ready" && c.mode === "job_match"));
}

// tsx compiles component JSX with the classic runtime (Next's tsconfig uses jsx: "preserve").
(globalThis as { React?: typeof React }).React = React;

function testEngineLabelShowsNameAndKind() {
  const kind: Record<string, string> = { native: "Native", open_source: "OSS", reference: "Ref" };
  for (const eng of ATS_ENGINES) {
    const html = renderToStaticMarkup(createElement(EngineLabel, { engineId: eng.id }));
    assert.ok(html.includes(eng.name.replace(/&/g, "&amp;")), `${eng.id} name rendered`);
    assert.ok(html.includes(kind[eng.kind]), `${eng.id} shows ${kind[eng.kind]} tag`);
  }
}

const cell = (over: Partial<AtsBatchResultCell>): AtsBatchResultCell => ({
  resumeId: "r",
  engineId: "open_ats",
  status: "running",
  ...over,
});

function testStageDisplay() {
  const running: AtsStage[] = [
    "validating_input",
    "parsing_resume",
    "parsing_job_description",
    "extracting_skills",
    "analyzing_content",
    "matching_keywords",
    "calculating_score",
    "generating_report",
  ];
  for (const stage of running) {
    const d = cellDisplay(cell({ stage }));
    assert.equal(d.label, STAGE_LABELS[stage]);
    assert.equal(d.tone, "progress");
    const html = renderToStaticMarkup(createElement(CellStatusLabel, { cell: cell({ stage }) }));
    assert.ok(html.includes(STAGE_LABELS[stage]) && html.includes('role="status"'), stage);
  }
  assert.notEqual(cellDisplay(cell({})).label, "Analyzing…", "no generic label before a stage");
  assert.equal(cellDisplay(cell({ status: "queued" })).label, "Queued");
  assert.equal(cellDisplay(cell({ status: "cancelled" })).label, "Cancelled");
  assert.equal(cellDisplay(cell({ status: "done", overallScore: 70 })).tone, "score");
  assert.equal(
    cellDisplay(cell({ status: "done", overallScore: 70, stage: "completed_with_warnings" })).tone,
    "warning",
  );
  assert.equal(cellDisplay(cell({ status: "excluded", error: "x" })).label, "Needs input");
  assert.equal(cellDisplay(cell({ status: "unsupported" })).label, "Unsupported mode");
  assert.equal(
    cellDisplay(cell({ status: "error", failureKind: "parsing_failure" })).label,
    "Parsing failed",
  );
  assert.equal(
    cellDisplay(cell({ status: "error", failureKind: "service_unavailable" })).label,
    "Service unavailable",
  );
  assert.equal(cellDisplay(cell({ status: "error" })).label, "Failed");
  for (const label of Object.values(STAGE_LABELS)) assert.ok(!/N\/A/.test(label));
}

function testCellUpdateGuards() {
  const r1 = cell({ runId: "a", seq: 3, stage: "matching_keywords" });
  // Out-of-order stage within a run is dropped
  assert.equal(applyCellUpdate(r1, cell({ runId: "a", seq: 2, stage: "parsing_resume" }), "a"), r1);
  const later = cell({ runId: "a", seq: 4, stage: "calculating_score" });
  assert.equal(applyCellUpdate(r1, later, "a"), later);
  // Terminal never reverts to running for the same run
  const done = cell({ runId: "a", status: "done", overallScore: 80, seq: 9 });
  assert.equal(
    applyCellUpdate(done, cell({ runId: "a", seq: 10, stage: "generating_report" }), "a"),
    done,
  );
  const cancelled = cell({ runId: "a", status: "cancelled" });
  assert.equal(applyCellUpdate(cancelled, done, "a"), cancelled);
  // Stale run updates are ignored; a new active run replaces the cell
  const fresh = cell({ runId: "b", status: "queued" });
  assert.equal(applyCellUpdate(done, cell({ runId: "z", seq: 99 }), "b"), done);
  assert.equal(applyCellUpdate(done, fresh, "b"), fresh);
  // Separate combinations never share state (keyed by resume×engine in the hub)
  assert.equal(applyCellUpdate(undefined, fresh, "b"), fresh);
}

async function testReadRunStream() {
  const lines = [
    {
      type: "stage",
      resumeId: "r",
      engineId: "open_ats",
      runId: "x",
      seq: 1,
      stage: "parsing_resume",
      at: "t",
    },
    {
      type: "stage",
      resumeId: "r",
      engineId: "open_ats",
      runId: "OTHER",
      seq: 2,
      stage: "failed",
      at: "t",
    },
    "not json",
    {
      type: "stage",
      resumeId: "r",
      engineId: "open_ats",
      runId: "x",
      seq: 3,
      stage: "matching_keywords",
      at: "t",
    },
    { type: "result", runId: "x", seq: 4, result: cell({ status: "done", overallScore: 61 }) },
  ];
  const text = lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n";
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // Split mid-line to exercise buffering
      for (let i = 0; i < bytes.length; i += 17) controller.enqueue(bytes.slice(i, i + 17));
      controller.close();
    },
  });
  const seen: string[] = [];
  const result = await readRunStream(body, "x", (ev) => seen.push(ev.stage));
  assert.deepEqual(seen, ["parsing_resume", "matching_keywords"]);
  assert.equal(result?.overallScore, 61);

  const empty = new ReadableStream<Uint8Array>({ start: (c) => c.close() });
  assert.equal(await readRunStream(empty, "x", () => {}), null);
}

testRegistryMatrix();
testNewEnginesRegistered();
testNewEngineModes();
testEngineLabelShowsNameAndKind();
testStageDisplay();
testCellUpdateGuards();
testCombinationsOnlySelected();
testJobscanRequiresJd();
testNaRegressionWithFullInputs();
testSkillSyncerFormula();
testProfilesDistinctAndBounded();
testSelectAllEnginesCount();
testCalibrationScaffold();
testReadRunStream()
  .then(() => console.log("ats-engines tests: ok"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
