/** Client-safe job source / status constants (no DB). */

export const JOB_SOURCES = ["manual", "linkedin", "careers", "indeed", "other", "demo"] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

export type JobStatus = "active" | "archived";

export function isJobSource(value: string): value is JobSource {
  return (JOB_SOURCES as readonly string[]).includes(value);
}
