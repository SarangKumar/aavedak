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

export const PROFILE_LINK_META: Record<ProfileLinkKey, { label: string; placeholder: string }> = {
  portfolio: {
    label: "Portfolio",
    placeholder: "https://example.com",
  },
  linkedin: {
    label: "LinkedIn",
    placeholder: "https://www.linkedin.com/in/username/",
  },
  github: {
    label: "GitHub",
    placeholder: "https://github.com/username",
  },
  leetcode: {
    label: "LeetCode",
    placeholder: "https://leetcode.com/u/username/",
  },
  hackerrank: {
    label: "HackerRank",
    placeholder: "https://www.hackerrank.com/username",
  },
  twitter: {
    label: "X / Twitter",
    placeholder: "https://x.com/username",
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

export function parseProfileLinksJson(raw: string | null | undefined): ProfileLinks {
  if (!raw?.trim()) return emptyProfileLinks();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyProfileLinks();
    }
    const out = emptyProfileLinks();
    for (const key of PROFILE_LINK_KEYS) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) out[key] = v.trim();
      else out[key] = null;
    }
    return out;
  } catch {
    return emptyProfileLinks();
  }
}

export function serializeProfileLinks(links: ProfileLinks): string {
  const slim: Record<string, string> = {};
  for (const key of PROFILE_LINK_KEYS) {
    const v = links[key]?.trim();
    if (v) slim[key] = v;
  }
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

export function profileLinkEntries(links: ProfileLinks): Array<{
  key: ProfileLinkKey;
  label: string;
  url: string;
}> {
  const entries: Array<{ key: ProfileLinkKey; label: string; url: string }> = [];
  for (const key of PROFILE_LINK_KEYS) {
    const url = links[key]?.trim();
    if (!url) continue;
    entries.push({ key, label: PROFILE_LINK_META[key].label, url });
  }
  return entries;
}

/** Short lowercase label for one-row footers (github, linkedin, …). */
export function footerLinkShortLabel(key: ProfileLinkKey | "email"): string {
  if (key === "email") return "email";
  if (key === "twitter") return "x";
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
