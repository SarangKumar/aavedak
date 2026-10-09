/**
 * Hand-off from Jobs → ATS page. Job descriptions are too long for a URL, so the details
 * travel through sessionStorage (same tab, read once, expires after 10 minutes).
 */

import { getEngine } from "@/lib/ats-engines/registry";
import type { AtsEngineId } from "@/lib/ats-engines/types";

const KEY = "aavedak:ats-prefill";
const MAX_AGE_MS = 10 * 60_000;

export type AtsPrefill = {
  role: string;
  jdText: string;
  resumeIds: string[];
  engineIds: AtsEngineId[];
  job: { id: string; title: string; company: string; url: string | null };
  createdAt: number;
};

export function saveAtsPrefill(prefill: Omit<AtsPrefill, "createdAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...prefill, createdAt: Date.now() }));
  } catch {
    /* storage unavailable (private mode): the ATS page simply opens empty */
  }
}

/** Read and clear the pending hand-off, if any (ignores stale or malformed data). */
export function takeAtsPrefill(): AtsPrefill | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<AtsPrefill>;
    if (!data || typeof data.role !== "string" || typeof data.jdText !== "string") return null;
    if (typeof data.createdAt !== "number" || Date.now() - data.createdAt > MAX_AGE_MS) return null;
    return {
      role: data.role,
      jdText: data.jdText,
      resumeIds: Array.isArray(data.resumeIds)
        ? data.resumeIds.filter((x) => typeof x === "string")
        : [],
      engineIds: Array.isArray(data.engineIds)
        ? (data.engineIds.filter((x) => typeof x === "string" && getEngine(x)) as AtsEngineId[])
        : [],
      job: data.job ?? { id: "", title: data.role, company: "", url: null },
      createdAt: data.createdAt,
    };
  } catch {
    return null;
  }
}
