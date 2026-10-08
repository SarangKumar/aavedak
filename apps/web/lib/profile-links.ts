/** Shared profile link keys (client + server). */

export const PROFILE_LINK_KEYS = [
  "portfolio",
  "linkedin",
  "github",
  "leetcode",
  "hackerrank",
  "twitter",
  "website",
] as const;

export type ProfileLinkKey = (typeof PROFILE_LINK_KEYS)[number];

export type ProfileLinks = Partial<Record<ProfileLinkKey, string | null>>;

export type ProfileCustomLink = {
  title: string;
  url: string;
};

export const MAX_CUSTOM_PROFILE_LINKS = 12;

export type ProfileLinkMeta = {
  label: string;
  /** Full-URL fields (portfolio, website). Username fields use `baseUrl` instead. */
  placeholder: string;
  /**
   * When set, the settings UI shows this prefix and the user only enters a username.
   * Stored value is always the full URL.
   */
  baseUrl?: string;
  /** Older host/path prefixes still accepted when reading stored URLs. */
  altBaseUrls?: string[];
};

export const PROFILE_LINK_META: Record<ProfileLinkKey, ProfileLinkMeta> = {
  portfolio: {
    label: "Portfolio",
    placeholder: "https://example.com",
  },
  linkedin: {
    label: "LinkedIn",
    placeholder: "username",
    baseUrl: "https://www.linkedin.com/in/",
  },
  github: {
    label: "GitHub",
    placeholder: "username",
    baseUrl: "https://github.com/",
  },
  leetcode: {
    label: "LeetCode",
    placeholder: "username",
    baseUrl: "https://leetcode.com/u/",
  },
  hackerrank: {
    label: "HackerRank",
    placeholder: "username",
    baseUrl: "https://www.hackerrank.com/profile/",
    altBaseUrls: [
      "https://hackerrank.com/profile/",
      "https://www.hackerrank.com/",
      "https://hackerrank.com/",
    ],
  },
  twitter: {
    label: "X / Twitter",
    placeholder: "username",
    baseUrl: "https://x.com/",
  },
  website: {
    label: "Website",
    placeholder: "https://example.com",
  },
};

/** Cover-letter footer can include these from profile (+ email). */
export const COVER_FOOTER_LINK_KEYS = ["portfolio", "linkedin", "github", "leetcode"] as const;
export type CoverFooterLinkKey = (typeof COVER_FOOTER_LINK_KEYS)[number];

export function emptyProfileLinks(): ProfileLinks {
  const out: ProfileLinks = {};
  for (const key of PROFILE_LINK_KEYS) out[key] = null;
  return out;
}

function hostPathPrefixes(key: ProfileLinkKey): string[] {
  const meta = PROFILE_LINK_META[key];
  const bases = [meta.baseUrl, ...(meta.altBaseUrls ?? [])].filter(Boolean) as string[];
  return bases.map((b) =>
    b
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase(),
  );
}

/** Strip a known platform prefix (and optional trailing slash) to a username. */
export function profileLinkUsernameFromUrl(
  key: ProfileLinkKey,
  stored: string | null | undefined,
): string {
  const raw = stored?.trim() ?? "";
  if (!raw) return "";
  const base = PROFILE_LINK_META[key].baseUrl;
  if (!base) return raw;

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const path = `${u.host}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
      const prefixes = hostPathPrefixes(key).sort((a, b) => b.length - a.length);
      for (const prefix of prefixes) {
        if (path === prefix) return "";
        if (path.startsWith(`${prefix}/`)) {
          return path.slice(prefix.length + 1).split(/[/?#]/)[0] ?? "";
        }
      }
      const parts = u.pathname.split("/").filter(Boolean);
      const skip = new Set(["profile", "in", "u", "user"]);
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const seg = parts[i] ?? "";
        if (seg && !skip.has(seg.toLowerCase())) return seg;
      }
      return parts[parts.length - 1] ?? "";
    }

    const lower = raw.toLowerCase();
    for (const candidate of [base, ...(PROFILE_LINK_META[key].altBaseUrls ?? [])]) {
      if (lower.startsWith(candidate.toLowerCase())) {
        return (
          raw
            .slice(candidate.length)
            .replace(/^\/+|\/+$/g, "")
            .split(/[/?#]/)[0] ?? ""
        );
      }
      const bare = candidate.replace(/^https?:\/\//i, "");
      if (lower.startsWith(bare.toLowerCase())) {
        return (
          raw
            .slice(bare.length)
            .replace(/^\/+|\/+$/g, "")
            .split(/[/?#]/)[0] ?? ""
        );
      }
    }
  } catch {
    // fall through
  }

  return (
    raw
      .replace(/^@/, "")
      .replace(/^\/+|\/+$/g, "")
      .split(/[/?#]/)[0] ?? ""
  );
}

/** Build a full profile URL from a username (or pasted URL). */
export function profileLinkUrlFromUsername(
  key: ProfileLinkKey,
  usernameOrUrl: string | null | undefined,
): string | null {
  const raw = usernameOrUrl?.trim() ?? "";
  if (!raw) return null;
  const base = PROFILE_LINK_META[key].baseUrl;
  if (!base) {
    return raw;
  }
  // Pasted full URL → extract username, then recompose.
  if (/^https?:\/\//i.test(raw)) {
    const extracted = profileLinkUsernameFromUrl(key, raw);
    if (!extracted) return null;
    return `${base}${extracted}`;
  }
  const username =
    raw
      .replace(/^@/, "")
      .replace(/^\/+|\/+$/g, "")
      .split(/[/?#]/)[0] ?? "";
  if (!username) return null;
  return `${base}${username}`;
}

export function parseCustomProfileLinks(raw: unknown): ProfileCustomLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileCustomLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const title =
      typeof (item as { title?: unknown }).title === "string"
        ? (item as { title: string }).title.trim()
        : "";
    const url =
      typeof (item as { url?: unknown }).url === "string"
        ? (item as { url: string }).url.trim()
        : "";
    if (!title || !url) continue;
    out.push({ title: title.slice(0, 80), url });
    if (out.length >= MAX_CUSTOM_PROFILE_LINKS) break;
  }
  return out;
}

export function parseProfileLinksJson(raw: string | null | undefined): {
  links: ProfileLinks;
  custom: ProfileCustomLink[];
} {
  if (!raw?.trim()) return { links: emptyProfileLinks(), custom: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { links: emptyProfileLinks(), custom: [] };
    }
    const obj = parsed as Record<string, unknown>;
    const links = emptyProfileLinks();
    for (const key of PROFILE_LINK_KEYS) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) links[key] = v.trim();
      else links[key] = null;
    }
    return { links, custom: parseCustomProfileLinks(obj.custom) };
  } catch {
    return { links: emptyProfileLinks(), custom: [] };
  }
}

export function serializeProfileLinks(
  links: ProfileLinks,
  custom: ProfileCustomLink[] = [],
): string {
  const slim: Record<string, unknown> = {};
  for (const key of PROFILE_LINK_KEYS) {
    const v = links[key]?.trim();
    if (v) slim[key] = v;
  }
  const customSlim = custom
    .map((c) => ({
      title: c.title.trim().slice(0, 80),
      url: c.url.trim(),
    }))
    .filter((c) => c.title && c.url)
    .slice(0, MAX_CUSTOM_PROFILE_LINKS);
  if (customSlim.length) slim.custom = customSlim;
  return JSON.stringify(slim);
}

export function mergeLegacyLinks(
  links: ProfileLinks,
  portfolioUrl: string | null,
  linkedinUrl: string | null,
): ProfileLinks {
  return {
    ...links,
    portfolio: links.portfolio?.trim() || portfolioUrl?.trim() || null,
    linkedin: links.linkedin?.trim() || linkedinUrl?.trim() || null,
  };
}

export function profileLinkEntries(
  links: ProfileLinks,
  custom: ProfileCustomLink[] = [],
): Array<{
  key: string;
  label: string;
  url: string;
}> {
  const entries: Array<{ key: string; label: string; url: string }> = [];
  for (const key of PROFILE_LINK_KEYS) {
    const url = links[key]?.trim();
    if (!url) continue;
    entries.push({ key, label: PROFILE_LINK_META[key].label, url });
  }
  custom.forEach((c, i) => {
    const url = c.url?.trim();
    const title = c.title?.trim();
    if (!url || !title) return;
    entries.push({ key: `custom-${i}`, label: title, url });
  });
  return entries;
}

/** Short lowercase label for one-row footers (github, linkedin, …). */
export function footerLinkShortLabel(key: string): string {
  if (key === "email") return "email";
  if (key === "twitter") return "x";
  if (key.startsWith("custom-")) return key; // caller should use custom title
  return key;
}

/** Preferred order for public / cover footer rows. */
export const FOOTER_ROW_ORDER: Array<ProfileLinkKey | "email"> = [
  "email",
  "github",
  "linkedin",
  "portfolio",
  "leetcode",
  "hackerrank",
  "twitter",
  "website",
];
