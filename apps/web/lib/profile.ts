import "server-only";

import { getAppDb } from "@/lib/app-db";
import {
  emptyProfileLinks,
  mergeLegacyLinks,
  parseProfileLinksJson,
  serializeProfileLinks,
  type ProfileLinks,
} from "@/lib/profile-links";
import { usernameFromUser } from "@/lib/username";

export type Profile = {
  userId: string;
  username: string;
  email: string | null;
  name: string | null;
  bio: string | null;
  /** @deprecated Prefer `links.portfolio` — kept in sync for older readers. */
  portfolioUrl: string | null;
  /** @deprecated Prefer `links.linkedin` — kept in sync for older readers. */
  linkedinUrl: string | null;
  links: ProfileLinks;
  imageUrl: string | null;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProfileRow = {
  user_id: string;
  username: string;
  email: string | null;
  name: string | null;
  bio: string | null;
  portfolio_url: string | null;
  linkedin_url: string | null;
  links_json: string | null;
  image_url: string | null;
  onboarding_complete: number;
  created_at: string;
  updated_at: string;
};

const PROFILE_SELECT = `SELECT user_id, username, email, name, bio, portfolio_url, linkedin_url,
  links_json, image_url, onboarding_complete, created_at, updated_at FROM profiles`;

function mapRow(row: ProfileRow): Profile {
  const links = mergeLegacyLinks(
    parseProfileLinksJson(row.links_json),
    row.portfolio_url,
    row.linkedin_url,
  );
  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    name: row.name,
    bio: row.bio,
    portfolioUrl: links.portfolio ?? null,
    linkedinUrl: links.linkedin ?? null,
    links,
    imageUrl: row.image_url,
    onboardingComplete: Boolean(row.onboarding_complete),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugBaseFromEmail(email: string): string {
  return usernameFromUser({ email });
}

function allocateUsername(email: string, userId: string): string {
  const db = getAppDb();
  const base = slugBaseFromEmail(email) || "user";
  let candidate = base;
  let n = 2;
  for (;;) {
    const row = db
      .prepare(`SELECT user_id FROM profiles WHERE username = ? LIMIT 1`)
      .get(candidate) as { user_id: string } | undefined;
    if (!row || row.user_id === userId) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
    if (n > 10_000) {
      candidate = `${base}-${userId.slice(0, 6)}`;
      return candidate;
    }
  }
}

export function getProfile(userId: string): Profile | null {
  const row = getAppDb().prepare(`${PROFILE_SELECT} WHERE user_id = ?`).get(userId) as
    ProfileRow | undefined;
  return row ? mapRow(row) : null;
}

export function getProfileByUsername(username: string): Profile | null {
  const row = getAppDb()
    .prepare(`${PROFILE_SELECT} WHERE username = ? COLLATE NOCASE`)
    .get(username) as ProfileRow | undefined;
  return row ? mapRow(row) : null;
}

/** Ensure a stable username exists for this auth user (email local-part + suffix). */
export function ensureProfile(user: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}): Profile {
  const existing = getProfile(user.id);
  const now = new Date().toISOString();
  const db = getAppDb();
  const imageUrl = user.image?.trim() || null;

  if (existing) {
    // Sync email + avatar from auth; do not clobber display name / bio / links.
    db.prepare(
      `UPDATE profiles SET email = ?, image_url = COALESCE(?, image_url), updated_at = ? WHERE user_id = ?`,
    ).run(user.email, imageUrl, now, user.id);
    return {
      ...existing,
      email: user.email,
      imageUrl: imageUrl ?? existing.imageUrl,
      updatedAt: now,
    };
  }

  const username = allocateUsername(user.email, user.id);
  db.prepare(
    `INSERT INTO profiles
      (user_id, username, email, name, bio, portfolio_url, linkedin_url, links_json, image_url,
       onboarding_complete, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 0, ?, ?)`,
  ).run(user.id, username, user.email, user.name ?? null, "{}", imageUrl, now, now);

  return {
    userId: user.id,
    username,
    email: user.email,
    name: user.name ?? null,
    bio: null,
    portfolioUrl: null,
    linkedinUrl: null,
    links: emptyProfileLinks(),
    imageUrl,
    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function setOnboardingComplete(userId: string, complete: boolean) {
  const now = new Date().toISOString();
  getAppDb()
    .prepare(`UPDATE profiles SET onboarding_complete = ?, updated_at = ? WHERE user_id = ?`)
    .run(complete ? 1 : 0, now, userId);
}

export type ProfilePublicPatch = {
  name?: string | null;
  bio?: string | null;
  portfolioUrl?: string | null;
  linkedinUrl?: string | null;
  links?: ProfileLinks;
};

function normalizeOptionalText(value: string | null, max: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new Error(`Text must be ${max} characters or fewer.`);
  }
  return trimmed;
}

function normalizeOptionalUrl(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid URL.");
    }
    const href = parsed.toString();
    return href.endsWith("/") && parsed.pathname === "/" ? href.slice(0, -1) : href;
  } catch {
    throw new Error("Enter a valid http(s) URL.");
  }
}

function normalizeLinks(input: ProfileLinks | undefined, fallback: ProfileLinks): ProfileLinks {
  const base = { ...emptyProfileLinks(), ...fallback };
  if (!input) return base;
  const out = emptyProfileLinks();
  for (const key of Object.keys(out) as Array<keyof ProfileLinks>) {
    if (input[key] !== undefined) {
      out[key] = normalizeOptionalUrl(input[key] ?? null);
    } else {
      out[key] = base[key] ?? null;
    }
  }
  return out;
}

/** Owner update for shareable profile fields. */
export function updateProfilePublic(userId: string, patch: ProfilePublicPatch): Profile {
  const existing = getProfile(userId);
  if (!existing) throw new Error("Profile not found.");

  const nextName =
    patch.name !== undefined ? normalizeOptionalText(patch.name, 120) : existing.name;
  const nextBio = patch.bio !== undefined ? normalizeOptionalText(patch.bio, 600) : existing.bio;

  let nextLinks = { ...existing.links };
  if (patch.links !== undefined) {
    nextLinks = normalizeLinks(patch.links, existing.links);
  } else {
    // Legacy single-field patches still work.
    if (patch.portfolioUrl !== undefined) {
      nextLinks = {
        ...nextLinks,
        portfolio: normalizeOptionalUrl(patch.portfolioUrl),
      };
    }
    if (patch.linkedinUrl !== undefined) {
      nextLinks = {
        ...nextLinks,
        linkedin: normalizeOptionalUrl(patch.linkedinUrl),
      };
    }
  }

  const nextPortfolio = nextLinks.portfolio ?? null;
  const nextLinkedin = nextLinks.linkedin ?? null;
  const linksJson = serializeProfileLinks(nextLinks);

  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `UPDATE profiles
       SET name = ?, bio = ?, portfolio_url = ?, linkedin_url = ?, links_json = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .run(nextName, nextBio, nextPortfolio, nextLinkedin, linksJson, now, userId);

  return getProfile(userId)!;
}

/** Display portfolio URL as stored — no placeholder defaults. */
export function resolvePortfolioUrl(profile: Profile): string | null {
  return profile.links.portfolio?.trim() || profile.portfolioUrl?.trim() || null;
}
