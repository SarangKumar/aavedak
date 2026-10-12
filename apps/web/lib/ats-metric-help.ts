/**
 * Plain-language meaning of each score row and signal shown in the ATS detail panel.
 * Keyed by the label the engine emits; a few labels carry numbers or a qualifier, so those
 * are matched by pattern. Labels without an entry simply get no hover explanation.
 */
const EXACT: Record<string, string> = {
  // Native engine score rows
  "ATS Compatibility":
    "How easily ATS parsers can read the resume's text, sections and contact details.",
  "Required Skills": "Share of the job's required hard skills that appear on your resume.",
  "Preferred Skills": "Share of the job's nice-to-have skills that appear on your resume.",
  "Experience Match": "How well your years and roles line up with what the job asks for.",
  "Responsibility Match": "How many of the job's listed responsibilities your experience covers.",
  "Keyword Coverage": "Share of the job's key terms that appear on your resume.",
  "Evidence Quality": "How much of your skill claims is backed by concrete, measurable experience.",
  "Job Title Match": "How closely your recent job titles match the role you are targeting.",
  "Resume Quality": "Writing and impact quality of the resume, judged without the job description.",
  "Technical Skills": "Depth and range of technical skills shown on the resume.",
  "Experience Quality": "Quality of experience bullets: strong action verbs, results and clarity.",
  "Structure & Formatting":
    "Whether the resume has clear sections and a layout parsers can follow.",

  // Enhancv
  "ATS Parse Rate":
    "Checks that the resume will parse cleanly: contact details, tables and icons. Shown as the number of issues found.",
  "Quantifying Impact":
    "Bullets that state a measurable result. Shown as the number of bullets with no number in them.",
  Repetition: "Words used too often and bullets that open with the same word.",
  "Spelling & Grammar":
    "Common typos, doubled words and spacing errors. Uses a short list of checks, not a full spell-checker.",

  // Open ATS
  "Keyword · hard":
    "Share of the job's hard skills (languages, tools, frameworks) found on the resume.",
  "Keyword · soft": "Share of the job's soft-skill terms found on the resume.",
  "Keyword · action": "Distinct strong action verbs that start your bullets, out of 10.",
  "Keyword · industry": "Share of common industry terms from the job found on the resume.",
  "Content quality":
    "Action verbs, passive voice, hedging and length of the resume text, combined into one score.",
  Formatting: "Points taken off for tables, multi-column layout, icons and missing key fields.",
  "Formatting penalty": "Points taken off for formatting problems.",
  "Word count": "Total words on the resume.",
  "Bullets analyzed": "Number of experience bullets the score was based on.",
  "Distinct strong action verbs": "Different strong action verbs used across your bullets.",
  "Passive sentences": "Sentences written in the passive voice.",
  "Hedging bullets": "Bullets that use hedging words such as 'might' or 'possibly'.",

  // ATS Resume Checker
  Achievements:
    "Half from bullets that include a number, half from bullets that open with a strong action verb.",
  Contact: "Email and phone number present near the top of the resume.",
  Education: "A recognised degree and a graduation year on the resume.",
  Experience: "Dated role ranges found on the resume. Missing dates lower this score.",
  Structure: "Share of standard resume sections present, plus bonus sections, out of 100.",
  "Writing quality":
    "Writing quality after penalties for filler words, buzzwords, passive voice and readability.",
  "Quantified bullets": "Share of bullets that contain a number.",
  "Strong-verb bullets": "Share of bullets that start with a strong action verb.",
  "Flesch reading ease": "How easy the text is to read, from 0 to 100. Higher is easier.",
  Health:
    "Overall parse health, Green, Yellow or Red, based on how many critical and high-severity issues were found.",
  "Resume quality (non-keyword categories)":
    "Overall quality from the categories that do not depend on the job description.",
  "Keyword match": "Share of the job's keywords that appear on the resume.",
  "Years covered by date ranges": "Number of distinct years covered by your dated roles.",

  // Resume Skills Extractor
  "Skill keyword ratio": "Share of the job's or role's skills that the resume mentions.",
  "Role skill coverage": "Share of the role's core skills found on the resume.",
  "Keyword overlap":
    "Words shared between the job description and the resume, as a share of the job's words.",
  Keyword: "Share of the job's terms that appear on the resume.",
  "Raw TF-IDF cosine similarity":
    "Text similarity between the resume and the job before calibration. It measures shared wording, not meaning.",

  // Hybrid Resume Analyzer
  "Skill match": "Points for required skills found on the resume.",
  Length: "Points for resume length. About 300 to 800 unique words scores full points.",
  "More than 150 words": "Full points when the resume has more than 150 words.",
  "Missing-skill penalty": "Points deducted for each required skill missing from the resume.",
  "Section keywords": "Points for standard section headings, up to 45.",
  "Email (@)": "Points when an email address is present, out of 20.",
  "Digits (phone/dates)":
    "Points when the resume has numbers such as a phone number or dates, out of 10.",
  "Rule-based resume validation":
    "Points from rule checks that the document looks like a resume: sections, email, digits and length.",
};

const PATTERNS: Array<[RegExp, string]> = [
  [
    /^Rubric \(normalized/,
    "Skill, keyword and length points, rescaled to 100 so they can be compared with other engines.",
  ],
  [
    /^Rubric total/,
    "Raw rubric points before they are rescaled. Skill, keyword and length points, minus penalties.",
  ],
  [
    /^Bonus skills/,
    "Skills on the resume that the job or role did not ask for. They do not raise the score.",
  ],
  [
    /^Calibrated similarity|^TF-IDF similarity \(calibrated\)/,
    "Raw similarity multiplied by a fixed factor and capped at 100, so it sits on the same scale as the other parts.",
  ],
  [
    /^TF-IDF/,
    "Text similarity between the resume and the job description. It measures shared wording, not meaning.",
  ],
];

export function metricHelp(label: string): string | undefined {
  const exact = EXACT[label];
  if (exact) return exact;
  return PATTERNS.find(([pattern]) => pattern.test(label))?.[1];
}
