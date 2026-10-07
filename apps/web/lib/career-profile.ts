/** YC-style career preferences for onboarding, profile, and future job matching. */

export const EXPERIENCE_LEVELS = [
  { value: "0-1", label: "0–1 years" },
  { value: "1-3", label: "1–3 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "5-8", label: "5–8 years" },
  { value: "8+", label: "8+ years" },
] as const;

export const REMOTE_PREFERENCES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
  { value: "open", label: "Open to any" },
] as const;

export const JOB_SEARCH_STATUSES = [
  { value: "actively_looking", label: "Actively looking" },
  { value: "open", label: "Open to opportunities" },
  { value: "not_looking", label: "Not looking right now" },
] as const;

export const COMPANY_SIZE_PREFERENCES = [
  { value: "startup", label: "Startup (≤50)" },
  { value: "mid", label: "Mid-size (50–500)" },
  { value: "large", label: "Large (500+)" },
  { value: "any", label: "Any size" },
] as const;

export const WORK_AUTHORIZATIONS = [
  { value: "india_authorized", label: "Authorized to work in India" },
  { value: "need_sponsorship", label: "Need visa / sponsorship" },
  { value: "other", label: "Other / prefer not to say" },
] as const;

export const SALARY_CURRENCIES = [
  { value: "INR", label: "INR (₹)" },
  { value: "USD", label: "USD ($)" },
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]["value"];
export type RemotePreference = (typeof REMOTE_PREFERENCES)[number]["value"];
export type JobSearchStatus = (typeof JOB_SEARCH_STATUSES)[number]["value"];
export type CompanySizePreference = (typeof COMPANY_SIZE_PREFERENCES)[number]["value"];
export type WorkAuthorization = (typeof WORK_AUTHORIZATIONS)[number]["value"];
export type SalaryCurrency = (typeof SALARY_CURRENCIES)[number]["value"];

export type CareerProfile = {
  experienceLevel: ExperienceLevel | null;
  preferredRoles: string[];
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  salaryCurrency: SalaryCurrency;
  preferredLocations: string[];
  remotePreference: RemotePreference | null;
  workAuthorization: WorkAuthorization | null;
  skills: string[];
  jobSearchStatus: JobSearchStatus | null;
  companySizePreference: CompanySizePreference | null;
  industryPreference: string | null;
};

export type CareerProfilePatch = Partial<{
  experienceLevel: ExperienceLevel | null;
  preferredRoles: string[];
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  salaryCurrency: SalaryCurrency;
  preferredLocations: string[];
  remotePreference: RemotePreference | null;
  workAuthorization: WorkAuthorization | null;
  skills: string[];
  jobSearchStatus: JobSearchStatus | null;
  companySizePreference: CompanySizePreference | null;
  industryPreference: string | null;
}>;

export function emptyCareerProfile(): CareerProfile {
  return {
    experienceLevel: null,
    preferredRoles: [],
    expectedSalaryMin: null,
    expectedSalaryMax: null,
    salaryCurrency: "INR",
    preferredLocations: [],
    remotePreference: null,
    workAuthorization: null,
    skills: [],
    jobSearchStatus: null,
    companySizePreference: null,
    industryPreference: null,
  };
}

export function parseStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // fall through: comma-separated
  }
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeStringList(items: string[]): string {
  return JSON.stringify(items.map((s) => s.trim()).filter(Boolean));
}

/** Parse "Software Engineer, Product Manager" style input into unique tags. */
export function tagsFromInput(value: string, max = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[,;\n]/)) {
    const t = part.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.slice(0, 80));
    if (out.length >= max) break;
  }
  return out;
}

function inSet<T extends string>(value: unknown, allowed: readonly { value: T }[]): value is T {
  return typeof value === "string" && allowed.some((o) => o.value === value);
}

function normalizeSalary(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[,_\s]/g, ""));
  if (!Number.isFinite(n) || n < 0)
    throw new Error("Expected package must be a non-negative number.");
  if (n > 1_000_000_000) throw new Error("Expected package is too large.");
  return Math.round(n);
}

export function normalizeCareerPatch(input: CareerProfilePatch): CareerProfilePatch {
  const out: CareerProfilePatch = {};

  if (input.experienceLevel !== undefined) {
    if (input.experienceLevel === null) out.experienceLevel = null;
    else if (inSet(input.experienceLevel, EXPERIENCE_LEVELS))
      out.experienceLevel = input.experienceLevel;
    else throw new Error("Invalid experience level.");
  }

  if (input.preferredRoles !== undefined) {
    out.preferredRoles = tagsFromInput(
      Array.isArray(input.preferredRoles)
        ? input.preferredRoles.join(", ")
        : String(input.preferredRoles),
      12,
    );
  }

  if (input.expectedSalaryMin !== undefined) {
    out.expectedSalaryMin = normalizeSalary(input.expectedSalaryMin);
  }
  if (input.expectedSalaryMax !== undefined) {
    out.expectedSalaryMax = normalizeSalary(input.expectedSalaryMax);
  }

  if (input.salaryCurrency !== undefined) {
    if (inSet(input.salaryCurrency, SALARY_CURRENCIES)) out.salaryCurrency = input.salaryCurrency;
    else throw new Error("Invalid salary currency.");
  }

  if (input.preferredLocations !== undefined) {
    out.preferredLocations = tagsFromInput(
      Array.isArray(input.preferredLocations)
        ? input.preferredLocations.join(", ")
        : String(input.preferredLocations),
      12,
    );
  }

  if (input.remotePreference !== undefined) {
    if (input.remotePreference === null) out.remotePreference = null;
    else if (inSet(input.remotePreference, REMOTE_PREFERENCES)) {
      out.remotePreference = input.remotePreference;
    } else throw new Error("Invalid remote preference.");
  }

  if (input.workAuthorization !== undefined) {
    if (input.workAuthorization === null) out.workAuthorization = null;
    else if (inSet(input.workAuthorization, WORK_AUTHORIZATIONS)) {
      out.workAuthorization = input.workAuthorization;
    } else throw new Error("Invalid work authorization.");
  }

  if (input.skills !== undefined) {
    out.skills = tagsFromInput(
      Array.isArray(input.skills) ? input.skills.join(", ") : String(input.skills),
      30,
    );
  }

  if (input.jobSearchStatus !== undefined) {
    if (input.jobSearchStatus === null) out.jobSearchStatus = null;
    else if (inSet(input.jobSearchStatus, JOB_SEARCH_STATUSES)) {
      out.jobSearchStatus = input.jobSearchStatus;
    } else throw new Error("Invalid job search status.");
  }

  if (input.companySizePreference !== undefined) {
    if (input.companySizePreference === null) out.companySizePreference = null;
    else if (inSet(input.companySizePreference, COMPANY_SIZE_PREFERENCES)) {
      out.companySizePreference = input.companySizePreference;
    } else throw new Error("Invalid company size preference.");
  }

  if (input.industryPreference !== undefined) {
    if (input.industryPreference === null) out.industryPreference = null;
    else {
      const t = String(input.industryPreference).trim().replace(/\s+/g, " ");
      if (t.length > 120) throw new Error("Industry preference is too long.");
      out.industryPreference = t || null;
    }
  }

  if (
    out.expectedSalaryMin != null &&
    out.expectedSalaryMax != null &&
    out.expectedSalaryMin > out.expectedSalaryMax
  ) {
    throw new Error("Expected package minimum cannot exceed maximum.");
  }

  return out;
}

/** Required fields for finishing onboarding / unlocking the app. */
export function isCareerProfileComplete(career: CareerProfile): boolean {
  if (!career.experienceLevel) return false;
  if (career.preferredRoles.length < 1) return false;
  if (career.expectedSalaryMin == null && career.expectedSalaryMax == null) return false;
  if (!career.salaryCurrency) return false;
  if (!career.remotePreference) return false;
  if (!career.jobSearchStatus) return false;
  if (career.skills.length < 1) return false;
  return true;
}

export function formatSalaryLabel(career: CareerProfile): string | null {
  const cur = career.salaryCurrency || "INR";
  const symbol = cur === "USD" ? "$" : "₹";
  const fmt = (n: number) =>
    cur === "INR" ? n.toLocaleString("en-IN") : n.toLocaleString("en-US");
  if (career.expectedSalaryMin != null && career.expectedSalaryMax != null) {
    return `${symbol}${fmt(career.expectedSalaryMin)} – ${symbol}${fmt(career.expectedSalaryMax)} ${cur}`;
  }
  if (career.expectedSalaryMin != null) return `${symbol}${fmt(career.expectedSalaryMin)}+ ${cur}`;
  if (career.expectedSalaryMax != null)
    return `Up to ${symbol}${fmt(career.expectedSalaryMax)} ${cur}`;
  return null;
}

export function labelFor<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T | null | undefined,
): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}
