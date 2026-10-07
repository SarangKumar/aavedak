/** Keyword overlap between a resume and a job description. No external model. */

const STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
  "will",
  "role",
  "job",
  "team",
  "work",
  "years",
  "year",
  "experience",
  "including",
  "using",
  "ability",
  "skills",
  "skill",
  "required",
  "requirements",
  "responsibilities",
  "about",
  "must",
  "have",
  "has",
  "their",
  "they",
  "who",
  "what",
  "into",
  "over",
  "such",
  "than",
  "then",
  "also",
  "can",
  "not",
  "but",
  "all",
  "any",
  "per",
]);

export type MatchScore = {
  atsScore: number;
  resumeMatchScore: number;
  matched: string[];
  missing: string[];
};

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+.#-]{1,}/g) ?? []).filter(
    (token) => token.length > 2 && !STOP.has(token),
  );
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}

export function scoreResumeAgainstJd(resumeText: string, jdText: string): MatchScore {
  const resume = new Set(tokens(resumeText));
  const jd = unique(tokens(jdText));
  if (jd.length === 0 || resume.size === 0) {
    return { atsScore: 0, resumeMatchScore: 0, matched: [], missing: jd.slice(0, 12) };
  }
  const matched = jd.filter((token) => resume.has(token));
  const missing = jd.filter((token) => !resume.has(token));
  const atsScore = Math.round((matched.length / jd.length) * 100);
  const union = new Set([...resume, ...jd]);
  const resumeMatchScore = Math.round((matched.length / union.size) * 100);
  return {
    atsScore,
    resumeMatchScore,
    matched: matched.slice(0, 12),
    missing: missing.slice(0, 12),
  };
}

export function draftCoverFromJd(input: { company: string; role: string; matched: string[] }): {
  title: string;
  body: string;
} {
  const company = input.company.trim() || "the company";
  const role = input.role.trim() || "the role";
  const skills =
    input.matched.length > 0
      ? input.matched.slice(0, 6).join(", ")
      : "the work described in the job post";
  return {
    title: `Cover letter — ${role} at ${company}`,
    body: `Dear Hiring Manager,

I am writing to apply for the ${role} position at ${company}. I have been following the work your team ships, and the description lines up with how I like to build: careful about the user, specific about the system, and willing to own the unglamorous parts.

The overlap I can speak to includes ${skills}. I would rather show that in a conversation than list every tool I have touched.

Thank you for reading. I would welcome the chance to talk about how I can help.

Sincerely,
John Doe`,
  };
}

/** Best-effort text from a PDF buffer (literal strings + printable runs). */
export function extractPdfText(buffer: Buffer): string {
  const latin = buffer.toString("latin1");
  const chunks: string[] = [];
  const literal = /\(((?:\\.|[^\\)]){2,})\)/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(latin))) {
    const inner = match[1]!
      .replace(/\\n/g, " ")
      .replace(/\\r/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-z]{3,}/.test(inner)) chunks.push(inner);
  }
  const joined = chunks.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length > 80) return joined.slice(0, 20_000);
  const runs = buffer.toString("utf8").match(/[A-Za-z][A-Za-z0-9+.#,/&-]{5,}/g) ?? [];
  return runs.join(" ").replace(/\s+/g, " ").trim().slice(0, 20_000);
}
