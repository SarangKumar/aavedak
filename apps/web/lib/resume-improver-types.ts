/** Shapes returned by FastAPI `/svc/v1/improve` (see apps/api/app/improve/service.py). */

export type ImproveLine = { id: string; kind: string; text: string; glyph?: string | null };

export type ImproveChange = {
  id: string;
  kind: "bullet" | "skills" | "bullet_order" | "section_order" | "date_format" | "separators";
  section: string;
  before: string[];
  after: string[];
  rules: string[];
  reason: string;
  accepted: boolean;
  target: Record<string, unknown>;
  /** First run only: how each engine's score moves when this change is added to the others. */
  impact?: Record<string, number> | null;
};

export type AlignmentItem = {
  skill: string;
  label: string;
  importance: "required" | "preferred" | "core" | "common";
  status: "supported" | "skills_only" | "missing";
  evidence: { lineId: string; section: string; text: string }[];
};

export type EngineScore =
  | {
      ok: true;
      score: number | null;
      scoreType?: string;
      mode?: string;
      engineVersion?: string;
      breakdown: { key: string; label: string; score: number }[];
    }
  | { ok: false; failureKind: string; message: string };

export type ScorePair = {
  snapshot: {
    engineVersion: string;
    improverVersion: string;
    mode: string;
    role: string;
    yearsExperience: number | null;
    jdHash: string;
    engines: string[];
    engineVersions: Record<string, string>;
  };
  before: Record<string, EngineScore>;
  after: Record<string, EngineScore>;
};

export type ImproveResult = {
  improverVersion: string;
  originalText: string;
  revisedText: string;
  revised: {
    header: string[];
    sections: { key: string; heading: string; lines: ImproveLine[] }[];
  };
  changes: ImproveChange[];
  rejected: (ImproveChange & { problems: string[] })[];
  /** Set only when no change could be kept: why the original was returned unchanged. */
  documentProblems: string[];
  /** Accepted changes left out because, combined with the others, they failed the fact check. */
  dropped: { id: string; kind: ImproveChange["kind"]; before: string[]; reasons: string[] }[];
  alignment: {
    source: "jd" | "role";
    items: AlignmentItem[];
    supported: AlignmentItem[];
    skillsOnly: AlignmentItem[];
    missing: AlignmentItem[];
  };
  suggestions: { lineId: string | null; kind: string; text: string; message: string }[];
  rolePack: { key: string; label: string; matched: boolean };
  structureConfidence: "high" | "medium" | "low";
  scores?: ScorePair;
};
