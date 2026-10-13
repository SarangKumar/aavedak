/**
 * Strip non-JD boilerplate (privacy/cookie notices, EEO statements, data-protection and
 * fraud warnings, legal footers, navigation) from plain-text job descriptions before they
 * are stored and scored. Same rules and patterns file (`data/jd/boilerplate.json`) as
 * FastAPI's `app/discovery/jobs/jd_clean.py`. Content sections (responsibilities,
 * requirements, qualifications, skills, benefits, about the role) are kept; if cleaning
 * would leave almost nothing, the original text is returned.
 */
import rules from "../../../data/jd/boilerplate.json";

function full(items: string[]): RegExp {
  return new RegExp(`^(?:${items.map((p) => `(?:${p})`).join("|")})$`, "i");
}

const DROP_HEADING = full(rules.dropHeadings);
const KEEP_HEADING = full(rules.keepHeadings);
const NAV = full(rules.navLines);
const DROP_PARA = new RegExp(rules.dropParagraphs.map((p) => `(?:${p})`).join("|"), "i");
const BULLET = /^[\s•\-*–·#>]+/;
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z("'“])/;

function norm(line: string): string {
  return line.replace(BULLET, "").trim().replace(/:$/, "").trim().toLowerCase();
}

function looksLikeHeading(line: string): boolean {
  const raw = line.replace(BULLET, "").trim();
  if (!raw || raw.length > 60 || raw.split(/\s+/).length > 8) return false;
  if (raw.endsWith(":")) return true;
  if (/[.,;!?]$/.test(raw)) return false;
  const words = raw.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  if (words.length === 0) return false;
  if (raw === raw.toUpperCase() && /\p{Lu}/u.test(raw)) return true;
  const caps = words.filter((w) => /^\p{Lu}/u.test(w)).length;
  return caps / words.length >= 0.6 && words.length <= 6;
}

export function stripJdBoilerplate(text: string | null | undefined): string {
  const original = text ?? "";
  if (!original.trim()) return original;
  const out: string[] = [];
  let dropping = false;
  for (const rawLine of original.split(/\r?\n/)) {
    let line = rawLine;
    const stripped = line.trim();
    if (!stripped) {
      if (!dropping) out.push("");
      continue;
    }
    const key = norm(stripped);
    if (key.length <= 60 && NAV.test(key)) continue;
    if (key.length <= 80 && DROP_HEADING.test(key)) {
      dropping = true;
      continue;
    }
    if (KEEP_HEADING.test(key) || looksLikeHeading(stripped)) {
      dropping = false;
      out.push(line);
      continue;
    }
    if (dropping) continue;
    if (DROP_PARA.test(stripped)) {
      const prefix = line.slice(0, line.length - line.trimStart().length);
      const kept = stripped.split(SENTENCE_SPLIT).filter((s) => !DROP_PARA.test(s));
      if (kept.length === 0) continue;
      line = prefix + kept.join(" ");
    }
    out.push(line);
  }
  const cleaned = out
    .join("\n")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  if (original.length >= rules.minKeepChars && cleaned.length < rules.minKeepChars) return original;
  if (cleaned.length < rules.minKeepRatio * original.length && cleaned.length < 1000)
    return original;
  return cleaned;
}

/** Cleaned description plus the raw text to keep (null when cleaning changed nothing). */
export function cleanJobDescription(raw: string): {
  description: string;
  descriptionRaw: string | null;
} {
  const description = stripJdBoilerplate(raw);
  return { description, descriptionRaw: description !== raw ? raw : null };
}
