import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { ensureCompany } from "@/lib/companies";

export type PersonStatus = "active" | "archived";

/**
 * Global shared people directory (referrals).
 * `userId` is who added the contact (nullable after account delete) — not ownership.
 */
export type PersonRecord = {
  id: string;
  /** Who added this person; null if adder deleted their account. */
  userId: string | null;
  name: string;
  email: string | null;
  company: string | null;
  roleTitle: string | null;
  notes: string | null;
  applicationId: string | null;
  status: PersonStatus;
  /** `system` = added by admin bulk discovery; `user` = added by someone in the app. */
  origin: "system" | "user";
  companyId: string | null;
  /** Normalized `linkedin.com/in/<slug>` when known. */
  linkedin: string | null;
  /** People discovery: first source that found this person, and confidence (0–100). */
  discoverySource: string | null;
  confidence: number | null;
  seniority: string | null;
  department: string | null;
  location: string | null;
  githubUrl: string | null;
  /** Best pattern-inferred address (never verified); only when `email` is empty. */
  inferredEmail: string | null;
  inferredEmailConfidence: number | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  company: string | null;
  role_title: string | null;
  notes: string | null;
  application_id: string | null;
  status: PersonStatus;
  origin?: string | null;
  company_id?: string | null;
  linkedin_url_normalized?: string | null;
  discovery_source?: string | null;
  confidence?: number | null;
  seniority?: string | null;
  department?: string | null;
  location?: string | null;
  github_url?: string | null;
  inferred_email?: string | null;
  inferred_email_confidence?: number | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): PersonRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    company: row.company,
    roleTitle: row.role_title,
    notes: row.notes,
    applicationId: row.application_id,
    status: row.status,
    origin: row.origin === "system" ? "system" : "user",
    companyId: row.company_id ?? null,
    linkedin: row.linkedin_url_normalized ?? null,
    discoverySource: row.discovery_source ?? null,
    confidence: row.confidence ?? null,
    seniority: row.seniority ?? null,
    department: row.department ?? null,
    location: row.location ?? null,
    githubUrl: row.github_url ?? null,
    inferredEmail: row.email ? null : (row.inferred_email ?? null),
    inferredEmailConfidence: row.email ? null : (row.inferred_email_confidence ?? null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw new Error("Name is required.");
  const n = name.trim();
  if (n.length > 200) throw new Error("Name is too long.");
  return n;
}

function optional(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

const LINKEDIN_PATH_RE = /^\/in\/([A-Za-z0-9\-_%.]+)\/?/;

/**
 * `https://in.linkedin.com/in/Jane-Doe/?x=1` → `linkedin.com/in/jane-doe`.
 * Mirrors the Python `normalize_linkedin` in discovery so web- and system-added
 * profiles dedupe against each other. Returns null for anything that is not a
 * LinkedIn member profile URL.
 */
export function normalizeLinkedin(value: unknown): string | null {
  const raw = optional(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const match = LINKEDIN_PATH_RE.exec(url.pathname);
  if (!match) return null;
  return `linkedin.com/in/${match[1].toLowerCase()}`;
}

/** List the shared people directory (all users). */
export async function listPeople(opts?: { includeArchived?: boolean }): Promise<PersonRecord[]> {
  await ensureAppSchema();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = includeArchived
    ? ((await getSql()`
        SELECT p.*, ie.value AS inferred_email, ie.confidence AS inferred_email_confidence
        FROM people p
        LEFT JOIN LATERAL (
          SELECT c.value, c.confidence FROM person_contacts c
          WHERE c.person_id = p.id AND c.kind = 'email' AND c.verification = 'inferred'
          ORDER BY c.confidence DESC NULLS LAST LIMIT 1
        ) ie ON true
        ORDER BY p.updated_at DESC
      `) as Row[])
    : ((await getSql()`
        SELECT p.*, ie.value AS inferred_email, ie.confidence AS inferred_email_confidence
        FROM people p
        LEFT JOIN LATERAL (
          SELECT c.value, c.confidence FROM person_contacts c
          WHERE c.person_id = p.id AND c.kind = 'email' AND c.verification = 'inferred'
          ORDER BY c.confidence DESC NULLS LAST LIMIT 1
        ) ie ON true
        WHERE p.status != 'archived'
        ORDER BY p.updated_at DESC
      `) as Row[]);
  return rows.map(mapRow);
}

export async function getPerson(id: string): Promise<PersonRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM people WHERE id = ${id}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Reject a LinkedIn URL already attached to a different person (unique index). */
async function assertLinkedinFree(linkedin: string, exceptPersonId?: string): Promise<void> {
  const rows = (await getSql()`
    SELECT id FROM people WHERE linkedin_url_normalized = ${linkedin} LIMIT 1
  `) as Array<{ id: string }>;
  if (rows[0] && rows[0].id !== exceptPersonId) {
    throw new Error("That LinkedIn profile is already linked to another contact.");
  }
}

export async function createPerson(
  addedByUserId: string,
  input: {
    name: string;
    email?: string | null;
    company?: string | null;
    roleTitle?: string | null;
    linkedin?: string | null;
    notes?: string | null;
    applicationId?: string | null;
  },
): Promise<PersonRecord> {
  await ensureAppSchema();
  const name = requireName(input.name);
  const id = randomUUID();
  const now = new Date().toISOString();
  const email = optional(input.email);
  const company = optional(input.company);
  const roleTitle = optional(input.roleTitle);
  const notes = optional(input.notes);
  const applicationId = optional(input.applicationId);
  const linkedinRaw = optional(input.linkedin);
  const linkedin = normalizeLinkedin(linkedinRaw);
  if (linkedinRaw && !linkedin) throw new Error("Enter a valid LinkedIn profile URL.");
  if (linkedin) await assertLinkedinFree(linkedin);
  // Link to the shared company so discovery can match this person to jobs there.
  const companyId = company ? (await ensureCompany(company)).id : null;
  await getSql()`
    INSERT INTO people
      (id, user_id, name, email, company, role_title, notes, application_id, status, created_at,
       updated_at, company_id, origin, linkedin_url_normalized)
    VALUES (
      ${id}, ${addedByUserId}, ${name}, ${email}, ${company}, ${roleTitle}, ${notes}, ${applicationId},
      'active', ${now}, ${now}, ${companyId}, 'user', ${linkedin}
    )
  `;
  const created = await getPerson(id);
  if (!created) throw new Error("Failed to create person.");
  return created;
}

export async function updatePerson(
  id: string,
  patch: Partial<{
    name: string;
    email: string | null;
    company: string | null;
    roleTitle: string | null;
    linkedin: string | null;
    notes: string | null;
    applicationId: string | null;
    status: PersonStatus;
  }>,
): Promise<PersonRecord> {
  await ensureAppSchema();
  const existing = await getPerson(id);
  if (!existing) throw new Error("Person not found.");

  const name = patch.name !== undefined ? requireName(patch.name) : existing.name;
  const email = patch.email !== undefined ? optional(patch.email) : existing.email;
  const company = patch.company !== undefined ? optional(patch.company) : existing.company;
  const roleTitle = patch.roleTitle !== undefined ? optional(patch.roleTitle) : existing.roleTitle;
  const notes = patch.notes !== undefined ? optional(patch.notes) : existing.notes;
  const applicationId =
    patch.applicationId !== undefined ? optional(patch.applicationId) : existing.applicationId;
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  let linkedin = existing.linkedin;
  if (patch.linkedin !== undefined) {
    const raw = optional(patch.linkedin);
    linkedin = normalizeLinkedin(raw);
    if (raw && !linkedin) throw new Error("Enter a valid LinkedIn profile URL.");
    if (linkedin) await assertLinkedinFree(linkedin, id);
  }

  const now = new Date().toISOString();
  const companyId =
    company === existing.company
      ? existing.companyId
      : company
        ? (await ensureCompany(company)).id
        : null;
  await getSql()`
    UPDATE people SET
      name = ${name}, email = ${email}, company = ${company}, role_title = ${roleTitle},
      notes = ${notes}, application_id = ${applicationId}, status = ${status}, updated_at = ${now},
      company_id = ${companyId},
      linkedin_url_normalized = ${linkedin}
    WHERE id = ${id}
  `;
  const updated = await getPerson(id);
  if (!updated) throw new Error("Person not found after update.");
  return updated;
}

export async function archivePerson(id: string): Promise<PersonRecord> {
  return updatePerson(id, { status: "archived" });
}

/** Keep people rows; clear adder + application links for a deleted account. */
export async function detachPeopleForDeletedUser(userId: string): Promise<void> {
  await ensureAppSchema();
  const now = new Date().toISOString();
  await getSql()`
    UPDATE people
    SET user_id = NULL,
        application_id = NULL,
        updated_at = ${now}
    WHERE user_id = ${userId}
       OR application_id IN (SELECT id FROM applications WHERE user_id = ${userId})
  `;
}

// --- Community votes (reliability signal; separate from job relevance) -----------------

export type VoteValue = -1 | 0 | 1;

/**
 * `up` / `down` are user votes; `replies` is the system's credit (+1 per user the person
 * replied to, see `person_reply_credits`). Score = up − down + replies.
 */
export type VoteSummary = { up: number; down: number; mine: VoteValue; replies: number };

export const NO_VOTES: VoteSummary = { up: 0, down: 0, mine: 0, replies: 0 };

export function voteScore(votes: VoteSummary): number {
  return votes.up - votes.down + votes.replies;
}

/**
 * One vote per (user, person); voting again changes it, 0 removes it. Votes are a
 * community signal only — never proof that someone will refer.
 */
export async function setPersonVote(
  userId: string,
  personId: string,
  vote: VoteValue,
): Promise<VoteSummary> {
  await ensureAppSchema();
  const person = await getPerson(personId);
  if (!person) throw new Error("Person not found.");
  const now = new Date().toISOString();
  if (vote === 0) {
    await getSql()`DELETE FROM person_votes WHERE user_id = ${userId} AND person_id = ${personId}`;
  } else {
    await getSql()`
      INSERT INTO person_votes (user_id, person_id, vote, created_at, updated_at)
      VALUES (${userId}, ${personId}, ${vote}, ${now}, ${now})
      ON CONFLICT (user_id, person_id) DO UPDATE SET vote = EXCLUDED.vote, updated_at = EXCLUDED.updated_at
    `;
  }
  return (await getVoteSummaries(userId, [personId])).get(personId) ?? NO_VOTES;
}

export async function getVoteSummaries(
  userId: string,
  personIds: string[],
): Promise<Map<string, VoteSummary>> {
  await ensureAppSchema();
  const out = new Map<string, VoteSummary>();
  if (personIds.length === 0) return out;
  const [rows, credits] = (await Promise.all([
    getSql()`
      SELECT person_id,
             COUNT(*) FILTER (WHERE vote = 1)::int AS up,
             COUNT(*) FILTER (WHERE vote = -1)::int AS down,
             COALESCE(MAX(vote) FILTER (WHERE user_id = ${userId}), 0)::int AS mine
      FROM person_votes
      WHERE person_id = ANY(${personIds})
      GROUP BY person_id
    `,
    getSql()`
      SELECT person_id, COUNT(*)::int AS replies
      FROM person_reply_credits
      WHERE person_id = ANY(${personIds})
      GROUP BY person_id
    `,
  ])) as [
    Array<{ person_id: string; up: number; down: number; mine: number }>,
    Array<{ person_id: string; replies: number }>,
  ];
  for (const r of rows) {
    out.set(r.person_id, { ...NO_VOTES, up: r.up, down: r.down, mine: (r.mine as VoteValue) ?? 0 });
  }
  for (const c of credits) {
    out.set(c.person_id, { ...(out.get(c.person_id) ?? NO_VOTES), replies: c.replies });
  }
  return out;
}

export type JobPerson = PersonRecord & {
  relevanceScore: number;
  relevanceReason: string;
  votes: VoteSummary;
};

/**
 * People who may help with a referral for this job: stored relevance (computed by FastAPI
 * discovery) first, then anyone else linked to the same company. Ordered by relevance,
 * then community votes. Only active people.
 */
export async function listPeopleForJob(
  userId: string,
  jobId: string,
  limit = 12,
): Promise<JobPerson[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT p.*, COALESCE(r.score, 20) AS relevance_score,
           COALESCE(r.reason, 'Works at this company') AS relevance_reason
    FROM jobs j
    JOIN people p ON p.status = 'active' AND (
      p.company_id = j.company_id
      OR (p.company_id IS NULL AND lower(btrim(p.company)) = lower(btrim(j.company)))
    )
    LEFT JOIN job_person_relevance r ON r.job_id = j.id AND r.person_id = p.id
    WHERE j.id = ${jobId} AND (j.user_id IS NULL OR j.user_id = ${userId})
    ORDER BY relevance_score DESC, p.updated_at DESC
    LIMIT ${limit * 2}
  `) as Array<Row & { relevance_score: number; relevance_reason: string }>;
  const votes = await getVoteSummaries(
    userId,
    rows.map((r) => r.id),
  );
  return rows
    .map((row) => ({
      ...mapRow(row),
      relevanceScore: Number(row.relevance_score),
      relevanceReason: row.relevance_reason,
      votes: votes.get(row.id) ?? NO_VOTES,
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore || voteScore(b.votes) - voteScore(a.votes))
    .slice(0, limit);
}

export type CompanyEmailPattern = {
  /** e.g. "{first}.{last}" */
  pattern: string;
  domain: string;
  /** e.g. "first.last@stripe.com" */
  example: string;
  confidence: number;
  evidence: number;
  source: string;
  updatedAt: string | null;
};

/** Human template for a stored pattern: "{first}.{last}" → "first.last". */
export function patternTemplate(pattern: string): string {
  return pattern.replace(/[{}]/g, "");
}

/** Learned email format for the job's company (from people discovery), if any. */
export async function getEmailPatternForJob(
  userId: string,
  jobId: string,
): Promise<CompanyEmailPattern | null> {
  await ensureAppSchema();
  try {
    const rows = (await getSql()`
      SELECT c.email_pattern, c.email_pattern_domain, c.email_pattern_confidence,
             c.email_pattern_evidence, c.email_pattern_source, c.email_pattern_updated_at
      FROM jobs j JOIN companies c ON c.id = j.company_id
      WHERE j.id = ${jobId} AND (j.user_id IS NULL OR j.user_id = ${userId})
        AND c.email_pattern IS NOT NULL AND c.email_pattern_domain IS NOT NULL
      LIMIT 1
    `) as Array<{
      email_pattern: string;
      email_pattern_domain: string;
      email_pattern_confidence: number | null;
      email_pattern_evidence: number | null;
      email_pattern_source: string | null;
      email_pattern_updated_at: string | null;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      pattern: row.email_pattern,
      domain: row.email_pattern_domain,
      example: `${patternTemplate(row.email_pattern)}@${row.email_pattern_domain}`,
      confidence: row.email_pattern_confidence ?? 0,
      evidence: row.email_pattern_evidence ?? 0,
      source: row.email_pattern_source ?? "evidence",
      updatedAt: row.email_pattern_updated_at,
    };
  } catch {
    return null;
  }
}
