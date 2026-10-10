/**
 * The verified career-source seed, read straight from the discovery registry in the API app
 * (`apps/api/app/discovery/data/career_sources.json`) so public pages list exactly the
 * companies the nightly scan starts from. Bundled at build time; no runtime file reads.
 * Sources added on the Admin page appear here once exported to the registry
 * (`apps/api/scripts/export_admin_sources.py`).
 */
import seed from "../../api/app/discovery/data/career_sources.json";

export type CareerSourceProvider =
  "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "jsonld" | "json_feed";

export type CareerSource = { name: string; provider: string; careersUrl: string };

export const PROVIDER_LABELS: Record<CareerSourceProvider, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  // Career sources added on the Admin page and exported to the registry.
  jsonld: "Company career pages",
  json_feed: "Job feeds",
};

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

/** Valid entries only, one per company (a company on two platforms is listed once). */
export const CAREER_SOURCES: CareerSource[] = (() => {
  const byName = new Map<string, CareerSource>();
  for (const row of seed as unknown[]) {
    if (!row || typeof row !== "object") continue;
    const { name, provider, careersUrl } = row as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || typeof provider !== "string") continue;
    if (!isHttpUrl(careersUrl)) continue;
    const key = name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, { name: name.trim(), provider, careersUrl });
  }
  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
})();

/** Companies per job-board platform, in a fixed display order. */
export function careerSourcesByProvider(): Array<{
  provider: CareerSourceProvider;
  label: string;
  sources: CareerSource[];
}> {
  return (Object.keys(PROVIDER_LABELS) as CareerSourceProvider[])
    .map((provider) => ({
      provider,
      label: PROVIDER_LABELS[provider],
      sources: CAREER_SOURCES.filter((s) => s.provider === provider),
    }))
    .filter((group) => group.sources.length > 0);
}
