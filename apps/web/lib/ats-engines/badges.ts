import type { AtsEngineId } from "./types";

export type EngineBadgeStyle = {
  /** Two-letter monogram — identity is never conveyed by color alone. */
  monogram: string;
  /** Restrained tint + border; text stays foreground-level contrast in both themes. */
  className: string;
};

/**
 * Single source of truth for engine identity badges (selector, results table, detail).
 * Each engine differs by monogram, hue and border style (solid / dashed / dotted / double).
 */
export const ENGINE_BADGES: Record<AtsEngineId, EngineBadgeStyle> = {
  aavedak: {
    monogram: "AV",
    className: "border-primary/50 bg-primary/10 text-foreground",
  },
  jobscan_style: {
    monogram: "JS",
    className: "border-sky-500/50 bg-sky-500/10 text-sky-900 dark:text-sky-100",
  },
  resume_worded_style: {
    monogram: "RW",
    className: "border-violet-500/50 bg-violet-500/10 text-violet-900 dark:text-violet-100",
  },
  teal_style: {
    monogram: "TL",
    className: "border-teal-500/50 bg-teal-500/10 text-teal-900 dark:text-teal-100",
  },
  rezi_style: {
    monogram: "RZ",
    className: "border-rose-500/50 bg-rose-500/10 text-rose-900 dark:text-rose-100",
  },
  skillsyncer_style: {
    monogram: "SS",
    className: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  },
  open_ats: {
    monogram: "OA",
    className:
      "border-dashed border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
  },
  ats_resume_checker: {
    monogram: "RC",
    className:
      "border-dashed border-indigo-500/60 bg-indigo-500/10 text-indigo-900 dark:text-indigo-100",
  },
  resume_skills_extractor: {
    monogram: "SE",
    className: "border-dotted border-cyan-500/70 bg-cyan-500/10 text-cyan-900 dark:text-cyan-100",
  },
  hybrid_resume_analyzer: {
    monogram: "HY",
    className:
      "border-double border-[3px] border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-900 dark:text-fuchsia-100",
  },
};

export function engineBadge(id: AtsEngineId): EngineBadgeStyle {
  return ENGINE_BADGES[id];
}
