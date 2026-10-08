/** Profile showcase projects (client + server). */

export type ProfileProject = {
  id: string;
  title: string;
  url: string;
  description: string;
  imageUrl: string | null;
  faviconUrl: string | null;
};

export const MAX_PROFILE_PROJECTS = 12;

/** Short blurb that fits ~2 lines on a project card. */
export const MAX_PROJECT_DESCRIPTION = 160;

export function emptyProfileProject(): ProfileProject {
  return {
    id: crypto.randomUUID(),
    title: "",
    url: "",
    description: "",
    imageUrl: null,
    faviconUrl: null,
  };
}

export function parseProfileProjectsJson(raw: string | null | undefined): ProfileProject[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ProfileProject[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : crypto.randomUUID();
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const url = typeof row.url === "string" ? row.url.trim() : "";
      const description = typeof row.description === "string" ? row.description.trim() : "";
      const faviconUrl =
        typeof row.faviconUrl === "string" && row.faviconUrl.trim() ? row.faviconUrl.trim() : null;
      if (!title) continue;
      out.push({
        id,
        title: title.slice(0, 120),
        url,
        description: description.slice(0, MAX_PROJECT_DESCRIPTION),
        imageUrl: null,
        faviconUrl,
      });
      if (out.length >= MAX_PROFILE_PROJECTS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeProfileProjects(projects: ProfileProject[]): string {
  const slim = projects
    .map((p) => ({
      id: p.id.trim() || crypto.randomUUID(),
      title: p.title.trim().slice(0, 120),
      url: p.url.trim(),
      description: p.description.trim().slice(0, MAX_PROJECT_DESCRIPTION),
      faviconUrl: p.faviconUrl?.trim() || null,
    }))
    .filter((p) => p.title)
    .slice(0, MAX_PROFILE_PROJECTS);
  return JSON.stringify(slim);
}
