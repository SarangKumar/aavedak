import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";
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
  onboarding_complete: number | boolean;
  created_at: string;
  updated_at: string;
};

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

async function allocateUsername(email: string, userId: string): Promise<string> {
  await ensureAppSchema();
  const sql = getSql();
  const base = slugBaseFromEmail(email) || "user";
  let candidate = base;
  let n = 2;
  for (;;) {
    const rows = (await sql`
      SELECT user_id FROM profiles WHERE lower(username) = lower(${candidate}) LIMIT 1
    `) as Array<{ user_id: string }>;
    const row = rows[0];
    if (!row || row.user_id === userId) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
    if (n > 10_000) {
      return `${base}-${userId.slice(0, 6)}`;
    }
  }
}

export async function getProfile(userId: string): Promise<Profile | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT user_id, username, email, name, bio, portfolio_url, linkedin_url,
      links_json, image_url, onboarding_complete, created_at, updated_at
    FROM profiles WHERE user_id = ${userId}
  `) as ProfileRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT user_id, username, email, name, bio, portfolio_url, linkedin_url,
      links_json, image_url, onboarding_complete, created_at, updated_at
    FROM profiles WHERE lower(username) = lower(${username})
  `) as ProfileRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Ensure a stable username exists for this auth user (email local-part + suffix). */
export async function ensureProfile(user: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<Profile> {
  await ensureAppSchema();
  const existing = await getProfile(user.id);
  const now = new Date().toISOString();
  const sql = getSql();
  const imageUrl = user.image?.trim() || null;

  if (existing) {
    await sql`
      UPDATE profiles
      SET email = ${user.email},
          image_url = COALESCE(${imageUrl}, image_url),
          updated_at = ${now}
      WHERE user_id = ${user.id}
    `;
    return {
      ...existing,
      email: user.email,
      imageUrl: imageUrl ?? existing.imageUrl,
      updatedAt: now,
    };
  }

  const username = await allocateUsername(user.email, user.id);
  await sql`
    INSERT INTO profiles
      (user_id, username, email, name, bio, portfolio_url, linkedin_url, links_json, image_url,
       onboarding_complete, created_at, updated_at)
    VALUES (
      ${user.id}, ${username}, ${user.email}, ${user.name ?? null}, NULL, NULL, NULL, '{}',
      ${imageUrl}, 0, ${now}, ${now}
    )
  `;

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

export async function setOnboardingComplete(userId: string, complete: boolean) {
  await ensureAppSchema();
  const now = new Date().toISOString();
  await getSql()`
    UPDATE profiles
    SET onboarding_complete = ${complete ? 1 : 0}, updated_at = ${now}
    WHERE user_id = ${userId}
  `;
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
export async function updateProfilePublic(
  userId: string,
  patch: ProfilePublicPatch,
): Promise<Profile> {
  const existing = await getProfile(userId);
  if (!existing) throw new Error("Profile not found.");

  const nextName =
    patch.name !== undefined ? normalizeOptionalText(patch.name, 120) : existing.name;
  const nextBio = patch.bio !== undefined ? normalizeOptionalText(patch.bio, 600) : existing.bio;

  let nextLinks = { ...existing.links };
  if (patch.links !== undefined) {
    nextLinks = normalizeLinks(patch.links, existing.links);
  } else {
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
  await getSql()`
    UPDATE profiles
    SET name = ${nextName},
        bio = ${nextBio},
        portfolio_url = ${nextPortfolio},
        linkedin_url = ${nextLinkedin},
        links_json = ${linksJson},
        updated_at = ${now}
    WHERE user_id = ${userId}
  `;

  const updated = await getProfile(userId);
  if (!updated) throw new Error("Profile not found after update.");
  return updated;
}

/** Display portfolio URL as stored — no placeholder defaults. */
export function resolvePortfolioUrl(profile: Profile): string | null {
  return profile.links.portfolio?.trim() || profile.portfolioUrl?.trim() || null;
}
