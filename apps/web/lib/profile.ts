import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { MAX_APP_USERS, UserCapError } from "@/lib/user-cap";
import {
  emptyCareerProfile,
  isCareerProfileComplete,
  normalizeCareerPatch,
  parseStringList,
  serializeStringList,
  type CareerProfile,
  type CareerProfilePatch,
  type CompanySizePreference,
  type ExperienceLevel,
  type JobSearchStatus,
  type RemotePreference,
  type SalaryCurrency,
  type WorkAuthorization,
} from "@/lib/career-profile";
import {
  emptyProfileLinks,
  mergeLegacyLinks,
  parseProfileLinksJson,
  serializeProfileLinks,
  type ProfileLinks,
} from "@/lib/profile-links";
import { usernameFromUser } from "@/lib/username";

export type { CareerProfile, CareerProfilePatch };

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
  career: CareerProfile;
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
  experience_level: string | null;
  preferred_roles_json: string | null;
  expected_salary_min: number | null;
  expected_salary_max: number | null;
  salary_currency: string | null;
  preferred_locations_json: string | null;
  remote_preference: string | null;
  work_authorization: string | null;
  skills_json: string | null;
  job_search_status: string | null;
  company_size_preference: string | null;
  industry_preference: string | null;
  created_at: string;
  updated_at: string;
};

function mapCareer(row: ProfileRow): CareerProfile {
  const base = emptyCareerProfile();
  return {
    experienceLevel: (row.experience_level as ExperienceLevel | null) ?? null,
    preferredRoles: parseStringList(row.preferred_roles_json),
    expectedSalaryMin: row.expected_salary_min == null ? null : Number(row.expected_salary_min),
    expectedSalaryMax: row.expected_salary_max == null ? null : Number(row.expected_salary_max),
    salaryCurrency: (row.salary_currency as SalaryCurrency | null) || base.salaryCurrency,
    preferredLocations: parseStringList(row.preferred_locations_json),
    remotePreference: (row.remote_preference as RemotePreference | null) ?? null,
    workAuthorization: (row.work_authorization as WorkAuthorization | null) ?? null,
    skills: parseStringList(row.skills_json),
    jobSearchStatus: (row.job_search_status as JobSearchStatus | null) ?? null,
    companySizePreference: (row.company_size_preference as CompanySizePreference | null) ?? null,
    industryPreference: row.industry_preference?.trim() || null,
  };
}

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
    career: mapCareer(row),
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
      links_json, image_url, onboarding_complete,
      experience_level, preferred_roles_json, expected_salary_min, expected_salary_max,
      salary_currency, preferred_locations_json, remote_preference, work_authorization,
      skills_json, job_search_status, company_size_preference, industry_preference,
      created_at, updated_at
    FROM profiles WHERE user_id = ${userId}
  `) as ProfileRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT user_id, username, email, name, bio, portfolio_url, linkedin_url,
      links_json, image_url, onboarding_complete,
      experience_level, preferred_roles_json, expected_salary_min, expected_salary_max,
      salary_currency, preferred_locations_json, remote_preference, work_authorization,
      skills_json, job_search_status, company_size_preference, industry_preference,
      created_at, updated_at
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
  // Atomic slot claim: only insert when under the hard user cap.
  const inserted = (await sql`
    INSERT INTO profiles
      (user_id, username, email, name, bio, portfolio_url, linkedin_url, links_json, image_url,
       onboarding_complete, created_at, updated_at)
    SELECT
      ${user.id}, ${username}, ${user.email}, ${user.name ?? null}, NULL, NULL, NULL, '{}',
      ${imageUrl}, 0, ${now}, ${now}
    WHERE (SELECT COUNT(*)::int FROM profiles) < ${MAX_APP_USERS}
    RETURNING user_id, username, email, name, bio, portfolio_url, linkedin_url,
      links_json, image_url, onboarding_complete,
      experience_level, preferred_roles_json, expected_salary_min, expected_salary_max,
      salary_currency, preferred_locations_json, remote_preference, work_authorization,
      skills_json, job_search_status, company_size_preference, industry_preference,
      created_at, updated_at
  `) as ProfileRow[];

  if (!inserted[0]) {
    throw new UserCapError();
  }

  return mapRow(inserted[0]);
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

export async function updateCareerProfile(
  userId: string,
  patch: CareerProfilePatch,
): Promise<Profile> {
  const existing = await getProfile(userId);
  if (!existing) throw new Error("Profile not found.");

  const normalized = normalizeCareerPatch(patch);
  const next: CareerProfile = { ...existing.career };

  if (normalized.experienceLevel !== undefined) next.experienceLevel = normalized.experienceLevel;
  if (normalized.preferredRoles !== undefined) next.preferredRoles = normalized.preferredRoles;
  if (normalized.expectedSalaryMin !== undefined)
    next.expectedSalaryMin = normalized.expectedSalaryMin;
  if (normalized.expectedSalaryMax !== undefined)
    next.expectedSalaryMax = normalized.expectedSalaryMax;
  if (normalized.salaryCurrency !== undefined) next.salaryCurrency = normalized.salaryCurrency;
  if (normalized.preferredLocations !== undefined) {
    next.preferredLocations = normalized.preferredLocations;
  }
  if (normalized.remotePreference !== undefined)
    next.remotePreference = normalized.remotePreference;
  if (normalized.workAuthorization !== undefined) {
    next.workAuthorization = normalized.workAuthorization;
  }
  if (normalized.skills !== undefined) next.skills = normalized.skills;
  if (normalized.jobSearchStatus !== undefined) next.jobSearchStatus = normalized.jobSearchStatus;
  if (normalized.companySizePreference !== undefined) {
    next.companySizePreference = normalized.companySizePreference;
  }
  if (normalized.industryPreference !== undefined) {
    next.industryPreference = normalized.industryPreference;
  }

  if (
    next.expectedSalaryMin != null &&
    next.expectedSalaryMax != null &&
    next.expectedSalaryMin > next.expectedSalaryMax
  ) {
    throw new Error("Expected package minimum cannot exceed maximum.");
  }

  const now = new Date().toISOString();
  await getSql()`
    UPDATE profiles SET
      experience_level = ${next.experienceLevel},
      preferred_roles_json = ${serializeStringList(next.preferredRoles)},
      expected_salary_min = ${next.expectedSalaryMin},
      expected_salary_max = ${next.expectedSalaryMax},
      salary_currency = ${next.salaryCurrency},
      preferred_locations_json = ${serializeStringList(next.preferredLocations)},
      remote_preference = ${next.remotePreference},
      work_authorization = ${next.workAuthorization},
      skills_json = ${serializeStringList(next.skills)},
      job_search_status = ${next.jobSearchStatus},
      company_size_preference = ${next.companySizePreference},
      industry_preference = ${next.industryPreference},
      updated_at = ${now}
    WHERE user_id = ${userId}
  `;

  const updated = await getProfile(userId);
  if (!updated) throw new Error("Profile not found after update.");
  return updated;
}

export function profileHasCompleteCareer(profile: Profile): boolean {
  return isCareerProfileComplete(profile.career);
}

/** Display portfolio URL as stored — no placeholder defaults. */
export function resolvePortfolioUrl(profile: Profile): string | null {
  return profile.links.portfolio?.trim() || profile.portfolioUrl?.trim() || null;
}
