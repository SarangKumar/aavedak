import {
  APPLICATION_STATUSES,
  isApplicationStatus,
  type ApplicationStatus,
} from "@/lib/application-status";

export type ApplicationImportItem = {
  company_name: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  salary_ctc?: string | null;
  job_link?: string | null;
  job_id?: string | null;
  notes?: string | null;
  applied_at?: string | null;
  created_at?: string | null;
};

export type ApplicationImportError = {
  index: number;
  field: string;
  message: string;
};

export const APPLICATION_IMPORT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Arambh applications import",
  description:
    "Either a top-level array of application objects, or an object with an `applications` array.",
  oneOf: [
    { type: "array", items: { $ref: "#/$defs/application" } },
    {
      type: "object",
      required: ["applications"],
      additionalProperties: false,
      properties: {
        applications: {
          type: "array",
          items: { $ref: "#/$defs/application" },
        },
      },
    },
  ],
  $defs: {
    application: {
      type: "object",
      required: ["company_name", "role", "location", "status"],
      additionalProperties: false,
      properties: {
        company_name: { type: "string", minLength: 1, maxLength: 200 },
        role: { type: "string", minLength: 1, maxLength: 200 },
        location: { type: "string", minLength: 1, maxLength: 200 },
        status: { type: "string", enum: [...APPLICATION_STATUSES] },
        salary_ctc: { type: ["string", "null"], maxLength: 200 },
        job_link: { type: ["string", "null"], maxLength: 2000 },
        job_id: { type: ["string", "null"], maxLength: 200 },
        notes: { type: ["string", "null"], maxLength: 10000 },
        applied_at: {
          type: ["string", "null"],
          description: "ISO date or datetime (e.g. 2026-09-22 or 2026-09-22T00:00:00.000Z)",
        },
        created_at: {
          type: ["string", "null"],
          description: "Alias for applied_at when applied_at is omitted",
        },
      },
    },
  },
} as const;

export const APPLICATION_IMPORT_SAMPLE = {
  applications: [
    {
      company_name: "JioSaavn",
      role: "SDE-BE",
      location: "Mumbai",
      status: "applied",
      applied_at: "2026-09-22",
    },
    {
      company_name: "Kobie",
      role: "SDE",
      location: "Bangalore",
      status: "applied",
      applied_at: "2026-09-22",
    },
    {
      company_name: "Teradata",
      role: "SDE",
      location: "Hyderabad",
      status: "applied",
      applied_at: "2026-09-22",
    },
    {
      company_name: "Zuvees",
      role: "SDE-1",
      location: "Bangalore",
      status: "applied",
      applied_at: "2026-09-23",
    },
  ],
} as const;

function isIsoDateLike(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.+-Z]+)?$/.test(value)) return false;
  const t = Date.parse(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return !Number.isNaN(t);
}

function normalizeDateToIso(value: string): string {
  if (value.length === 10) return `${value}T00:00:00.000Z`;
  return new Date(value).toISOString();
}

function optionalString(
  value: unknown,
  field: string,
  index: number,
  errors: ApplicationImportError[],
  maxLen: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    errors.push({ index, field, message: "Must be a string or null." });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    errors.push({ index, field, message: `Must be ≤ ${maxLen} characters.` });
  }
  return trimmed || null;
}

/** Strict validate; returns items only if every row is valid. */
export function parseAndValidateApplicationsImport(payload: unknown):
  | {
      ok: true;
      items: ApplicationImportItem[];
    }
  | {
      ok: false;
      errors: ApplicationImportError[];
    } {
  const errors: ApplicationImportError[] = [];
  let rawList: unknown;

  if (Array.isArray(payload)) {
    rawList = payload;
  } else if (payload && typeof payload === "object" && "applications" in payload) {
    rawList = (payload as { applications: unknown }).applications;
  } else {
    return {
      ok: false,
      errors: [
        {
          index: -1,
          field: "$",
          message: "Root must be an array or an object with an `applications` array.",
        },
      ],
    };
  }

  if (!Array.isArray(rawList)) {
    return {
      ok: false,
      errors: [{ index: -1, field: "applications", message: "Must be an array." }],
    };
  }

  if (rawList.length === 0) {
    return {
      ok: false,
      errors: [{ index: -1, field: "applications", message: "Array must not be empty." }],
    };
  }

  const items: ApplicationImportItem[] = [];

  rawList.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push({ index, field: "$", message: "Each item must be an object." });
      return;
    }
    const obj = row as Record<string, unknown>;
    const allowed = new Set([
      "company_name",
      "role",
      "location",
      "status",
      "salary_ctc",
      "job_link",
      "job_id",
      "notes",
      "applied_at",
      "created_at",
    ]);
    for (const key of Object.keys(obj)) {
      if (!allowed.has(key)) {
        errors.push({ index, field: key, message: "Unknown field." });
      }
    }

    const company = typeof obj.company_name === "string" ? obj.company_name.trim() : "";
    if (!company) {
      errors.push({ index, field: "company_name", message: "Required non-empty string." });
    } else if (company.length > 200) {
      errors.push({ index, field: "company_name", message: "Must be ≤ 200 characters." });
    }

    const role = typeof obj.role === "string" ? obj.role.trim() : "";
    if (!role) {
      errors.push({ index, field: "role", message: "Required non-empty string." });
    } else if (role.length > 200) {
      errors.push({ index, field: "role", message: "Must be ≤ 200 characters." });
    }

    const location = typeof obj.location === "string" ? obj.location.trim() : "";
    if (!location) {
      errors.push({ index, field: "location", message: "Required non-empty string." });
    } else if (location.length > 200) {
      errors.push({ index, field: "location", message: "Must be ≤ 200 characters." });
    }

    let status: ApplicationStatus | null = null;
    if (typeof obj.status !== "string" || !obj.status.trim()) {
      errors.push({ index, field: "status", message: "Required status enum." });
    } else if (!isApplicationStatus(obj.status.trim())) {
      errors.push({
        index,
        field: "status",
        message: `Invalid status. Allowed: ${APPLICATION_STATUSES.join(", ")}`,
      });
    } else {
      status = obj.status.trim() as ApplicationStatus;
    }

    const salary = optionalString(obj.salary_ctc, "salary_ctc", index, errors, 200);
    const jobLink = optionalString(obj.job_link, "job_link", index, errors, 2000);
    if (jobLink && !/^https?:\/\//i.test(jobLink) && jobLink.length > 0) {
      // soft URL check — still allow relative? require http(s)
      errors.push({
        index,
        field: "job_link",
        message: "Must be an http(s) URL or null.",
      });
    }
    const jobId = optionalString(obj.job_id, "job_id", index, errors, 200);
    const notes = optionalString(obj.notes, "notes", index, errors, 10000);

    let appliedAt: string | null | undefined;
    const appliedRaw = obj.applied_at ?? obj.created_at;
    if (appliedRaw !== undefined && appliedRaw !== null) {
      if (typeof appliedRaw !== "string" || !appliedRaw.trim()) {
        errors.push({
          index,
          field: obj.applied_at !== undefined ? "applied_at" : "created_at",
          message: "Must be an ISO date string or null.",
        });
      } else if (!isIsoDateLike(appliedRaw.trim())) {
        errors.push({
          index,
          field: obj.applied_at !== undefined ? "applied_at" : "created_at",
          message: "Invalid ISO date/datetime.",
        });
      } else {
        appliedAt = normalizeDateToIso(appliedRaw.trim());
      }
    } else if (appliedRaw === null) {
      appliedAt = null;
    }

    if (company && role && location && status && errors.every((e) => e.index !== index)) {
      items.push({
        company_name: company,
        role,
        location,
        status,
        salary_ctc: salary ?? null,
        job_link: jobLink === undefined ? null : jobLink,
        job_id: jobId === undefined ? null : jobId,
        notes: notes === undefined ? null : notes,
        applied_at: appliedAt === undefined ? null : appliedAt,
      });
    }
  });

  // Re-check: if any errors for any index, reject whole file (even if some items parsed)
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, items };
}

export function getApplicationImportHumanReadable(): string {
  return `Arambh applications import schema
=================================

Root: either
  • an array of application objects, or
  • { "applications": [ ... ] }

Each application object
-----------------------
Required:
  company_name  string (min 1, max 200)
  role          string (min 1, max 200)
  location      string (min 1, max 200)
  status        one of: ${APPLICATION_STATUSES.join(", ")}

Optional:
  salary_ctc    string | null (max 200)
  job_link      string | null (http(s) URL, max 2000)
  job_id        string | null (max 200)
  notes         string | null (max 10000)
  applied_at    ISO date/datetime string | null  (e.g. "2026-09-22")
  created_at    alias for applied_at when applied_at omitted

Rules
-----
• Entire file is validated before any insert (all-or-nothing).
• Duplicate company+role (case-insensitive) for the signed-in user are skipped.
• Unknown fields are rejected.
`;
}
