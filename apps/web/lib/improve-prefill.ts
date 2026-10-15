/**
 * Hand-off from Jobs → Improve resume. Like the ATS hand-off (`lib/ats-prefill.ts`), the job
 * description is too long for a URL, so it travels through sessionStorage (same tab, read once,
 * expires after 10 minutes).
 */

const KEY = "aavedak:improve-prefill";
const MAX_AGE_MS = 10 * 60_000;

export type ImprovePrefill = {
  role: string;
  jdText: string;
  job: { id: string; title: string; company: string; url: string | null };
  createdAt: number;
};

export function saveImprovePrefill(prefill: Omit<ImprovePrefill, "createdAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...prefill, createdAt: Date.now() }));
  } catch {
    /* storage unavailable (private mode): the Improve page opens with profile defaults */
  }
}

/** Read and clear the pending hand-off, if any (ignores stale or malformed data). */
export function takeImprovePrefill(): ImprovePrefill | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ImprovePrefill>;
    if (!data || typeof data.role !== "string" || typeof data.jdText !== "string") return null;
    if (typeof data.createdAt !== "number" || Date.now() - data.createdAt > MAX_AGE_MS) return null;
    const job = data.job;
    return {
      role: data.role,
      jdText: data.jdText,
      job:
        job && typeof job.title === "string"
          ? {
              id: String(job.id ?? ""),
              title: job.title,
              company: String(job.company ?? ""),
              url: typeof job.url === "string" ? job.url : null,
            }
          : { id: "", title: data.role, company: "", url: null },
      createdAt: data.createdAt,
    };
  } catch {
    return null;
  }
}
