import {
  runJobscanStyle,
  runResumeWordedStyle,
  runReziStyle,
  runSkillSyncerStyle,
  runTealStyle,
} from "../reference-profiles";
import { CALIBRATION_CASES, CALIBRATION_DATASET_VERSION, type CalibrationCase } from "./fixtures";

export type EngineCompareRow = {
  caseId: string;
  engine: string;
  aavedakScore: number;
  vendorScore: number | null;
  absDiff: number | null;
  notes: string[];
};

export function runCalibrationCase(c: CalibrationCase): EngineCompareRow[] {
  const base = {
    resumeId: c.id,
    resumeText: c.resumeText,
    role: c.role,
    jdText: c.jdText,
  };
  const rows: Array<{
    engine: string;
    analysis: { overallScore: number; notes?: string[] };
    vendorKey: keyof NonNullable<CalibrationCase["vendorScores"]>;
  }> = [
    {
      engine: "jobscan",
      analysis: runJobscanStyle({ ...base, mode: "job_match" }),
      vendorKey: "jobscan",
    },
    {
      engine: "resume_worded",
      analysis: runResumeWordedStyle({ ...base, mode: "job_match" }),
      vendorKey: "resume_worded",
    },
    { engine: "teal", analysis: runTealStyle({ ...base, mode: "job_match" }), vendorKey: "teal" },
    { engine: "rezi", analysis: runReziStyle({ ...base, mode: "job_match" }), vendorKey: "rezi" },
    {
      engine: "skillsyncer",
      analysis: runSkillSyncerStyle({ ...base, mode: "job_match" }),
      vendorKey: "skillsyncer",
    },
  ];
  return rows.map((r) => {
    const vendor = c.vendorScores?.[r.vendorKey]?.overall ?? null;
    return {
      caseId: c.id,
      engine: r.engine,
      aavedakScore: r.analysis.overallScore,
      vendorScore: vendor,
      absDiff: vendor == null ? null : Math.abs(r.analysis.overallScore - vendor),
      notes: r.analysis.notes ?? [],
    };
  });
}

export function calibrationReport(cases = CALIBRATION_CASES) {
  const rows = cases.flatMap(runCalibrationCase);
  const withVendor = rows.filter((r) => r.absDiff != null) as Array<
    EngineCompareRow & { absDiff: number }
  >;
  const mae =
    withVendor.length === 0
      ? null
      : withVendor.reduce((s, r) => s + r.absDiff, 0) / withVendor.length;
  return {
    datasetVersion: CALIBRATION_DATASET_VERSION,
    rows,
    mae,
    vendorComparisons: withVendor.length,
  };
}
