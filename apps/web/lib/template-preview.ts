/**
 * Template variables shared by cover letters and mail templates (client + server safe).
 *
 * - Cover letters resolve everything to real values: the signed-in user's profile and the
 *   selected job or custom company. Saved and downloaded letters never contain raw `{{…}}`.
 * - Mail template previews resolve the user's own variables for real, but job / company /
 *   recipient variables use clearly labelled demo values. At send time all resolve for real.
 */
import { profileLinkUrlFromUsername, type ProfileLinks } from "@/lib/profile-links";

export type TemplateVarGroup = "you" | "job" | "recipient" | "other";

export type TemplateVarDoc = {
  key: string;
  /** Other spellings accepted in templates. */
  aliases: string[];
  label: string;
  group: TemplateVarGroup;
  /** Where the value comes from. */
  source: string;
};

export const TEMPLATE_VAR_DOCS: TemplateVarDoc[] = [
  { key: "user_name", aliases: [], label: "Your name", group: "you", source: "Profile name" },
  {
    key: "user_email",
    aliases: ["from_email", "email"],
    label: "Your email",
    group: "you",
    source: "Profile email (else sign-in email)",
  },
  {
    key: "user_phone",
    aliases: ["phone"],
    label: "Your phone",
    group: "you",
    source: "Not stored in your profile — fill it in",
  },
  {
    key: "linkedin",
    aliases: ["linkedin_url"],
    label: "LinkedIn",
    group: "you",
    source: "Profile links → LinkedIn",
  },
  { key: "github", aliases: [], label: "GitHub", group: "you", source: "Profile links → GitHub" },
  {
    key: "portfolio",
    aliases: ["website"],
    label: "Portfolio",
    group: "you",
    source: "Profile links → Portfolio (else Website)",
  },
  {
    key: "company",
    aliases: ["company_name"],
    label: "Company",
    group: "job",
    source: "Selected job, or the custom company",
  },
  {
    key: "role",
    aliases: ["job_title", "title"],
    label: "Role / job title",
    group: "job",
    source: "Selected job title, or the custom role",
  },
  {
    key: "location",
    aliases: ["job_location"],
    label: "Location",
    group: "job",
    source: "Selected job location",
  },
  {
    key: "hiring_manager",
    aliases: [],
    label: "Hiring manager",
    group: "recipient",
    source: "Fill it in (cover letters) · recipient name (emails)",
  },
  {
    key: "person_name",
    aliases: ["recipient_name"],
    label: "Recipient name",
    group: "recipient",
    source: "The person you're emailing",
  },
  {
    key: "person_email",
    aliases: ["recipient_email"],
    label: "Recipient email",
    group: "recipient",
    source: "The person you're emailing",
  },
  { key: "date", aliases: ["today"], label: "Date", group: "other", source: "Today's date" },
];

const CANONICAL = new Map<string, string>();
for (const doc of TEMPLATE_VAR_DOCS) {
  CANONICAL.set(doc.key, doc.key);
  for (const alias of doc.aliases) CANONICAL.set(alias, doc.key);
}

/** The canonical key for a variable name (`from_email` → `user_email`), or the name itself. */
export function canonicalVarKey(name: string): string {
  const key = name.trim().toLowerCase();
  return CANONICAL.get(key) ?? key;
}

export type TemplateUser = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  links?: ProfileLinks | null;
};

function linkUrl(
  links: ProfileLinks | null | undefined,
  key: "linkedin" | "github" | "portfolio" | "website",
) {
  return profileLinkUrlFromUsername(key, links?.[key] ?? null) ?? "";
}

/** The signed-in user's own variables (real values; empty when the profile lacks them). */
export function userTemplateVars(user: TemplateUser): Record<string, string> {
  return {
    user_name: user.name?.trim() || "",
    user_email: user.email?.trim() || "",
    user_phone: user.phone?.trim() || "",
    linkedin: linkUrl(user.links, "linkedin"),
    github: linkUrl(user.links, "github"),
    portfolio: linkUrl(user.links, "portfolio") || linkUrl(user.links, "website"),
  };
}

export function jobTemplateVars(job: {
  company?: string | null;
  role?: string | null;
  location?: string | null;
}): Record<string, string> {
  return {
    company: job.company?.trim() || "",
    role: job.role?.trim() || "",
    location: job.location?.trim() || "",
  };
}

/** Long-form date for letters, e.g. "13 October 2026". */
export function templateDate(now = new Date()): string {
  return now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Demo job / recipient values for mail template previews (labelled as demo in the UI). */
export const DEMO_MAIL_VARS: Record<string, string> = {
  company: "Example Corp",
  role: "Software Engineer",
  location: "Remote",
  person_name: "John Doe",
  person_email: "john.doe@example.com",
  hiring_manager: "John Doe",
};

export const DEMO_MAIL_KEYS = new Set(Object.keys(DEMO_MAIL_VARS));

/** Mail template preview: your real values + demo job / recipient values + today's date. */
export function mailPreviewVars(user: TemplateUser): Record<string, string> {
  return { ...userTemplateVars(user), ...DEMO_MAIL_VARS, date: templateDate() };
}

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Canonical variable keys used in a text, in order of first use. */
export function templateVarsUsed(text: string): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(VAR_RE)) {
    const key = canonicalVarKey(match[1]!);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * Replace known variables that have a value. Missing ones stay as `{{key}}` (canonical
 * spelling) so the preview can highlight them; `missing` lists them.
 */
export function resolveTemplate(
  text: string,
  vars: Record<string, string>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(VAR_RE, (_, name: string) => {
    const key = canonicalVarKey(name);
    const value = vars[key]?.trim();
    if (value) return value;
    if (!missing.includes(key)) missing.push(key);
    return `{{${key}}}`;
  });
  return { text: out, missing };
}

/** Remove any variable left unresolved (for PDFs / sent mail), tidying the gap it leaves. */
export function stripUnresolved(text: string): string {
  return text
    .replace(VAR_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n");
}

/** Resolve for final output: known values in, anything missing removed. */
export function renderTemplateFinal(text: string, vars: Record<string, string>): string {
  return stripUnresolved(resolveTemplate(text, vars).text);
}

/** @deprecated Use `renderTemplateFinal`. */
export const renderTemplatePreview = renderTemplateFinal;

export const DEFAULT_TEMPLATE_SUBJECT = "Referral ask — {{role}} at {{company}}";
export const DEFAULT_FOLLOWUP_SUBJECT = "Following up — {{role}} at {{company}}";
