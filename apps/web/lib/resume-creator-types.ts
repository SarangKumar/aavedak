/** Client-side resume-builder draft. Autosaved locally until the user hits Save. */

export type ResumeCreatorPresetId = "classic" | "modern" | "executive";

/** Active style source: a built-in preset id, a saved custom id, or free edits. */
export type ResumeCreatorStyleSource =
  | { kind: "preset"; id: ResumeCreatorPresetId }
  | { kind: "custom"; id: string; name: string }
  | { kind: "edited" };

export type ResumeCreatorFontId = "inter" | "georgia" | "times" | "system";

export type ResumeCreatorSectionId =
  "contact" | "summary" | "experience" | "education" | "skills" | "projects" | "certifications";

export type ResumeExperienceEntry = {
  id: string;
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
};

export type ResumeEducationEntry = {
  id: string;
  school: string;
  degree: string;
  location: string;
  start: string;
  end: string;
  details: string;
};

export type ResumeProjectEntry = {
  id: string;
  name: string;
  link: string;
  description: string;
  bullets: string[];
};

export type ResumeCertificationEntry = {
  id: string;
  name: string;
  issuer: string;
  year: string;
};

export type ResumeContact = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
};

/**
 * Print style in PDF points (1pt = 1/72in). The HTML preview uses the same numbers
 * with CSS `pt` units on a true-A4 paper, then scales the whole page to fit the pane.
 */
export type ResumeCreatorStyle = {
  fontFamily: ResumeCreatorFontId;
  headerPt: number;
  sectionTitlePt: number;
  bodyPt: number;
  footerPt: number;
  /** Left/right page margin (pt). */
  marginXPt: number;
  /** Top/bottom page margin (pt). */
  marginYPt: number;
  /** Extra space before each section title (pt). */
  sectionGapPt: number;
  /** Line-height multiplier applied to all text blocks. */
  lineHeight: number;
  /** Visual rule under section titles: heavier (classic) or lighter (modern). */
  rule: "strong" | "light" | "none";
};

export type ResumeCreatorSectionMeta = {
  id: ResumeCreatorSectionId;
  /** User-facing heading printed on the PDF (except contact). */
  title: string;
  visible: boolean;
};

export type ResumeCreatorContent = {
  contact: ResumeContact;
  summary: string;
  experience: ResumeExperienceEntry[];
  education: ResumeEducationEntry[];
  /** Comma- or newline-separated skills; stored as a single string for simple editing. */
  skills: string;
  projects: ResumeProjectEntry[];
  certifications: ResumeCertificationEntry[];
};

export type ResumeCreatorDraft = {
  version: 2;
  /** Which preset/custom last applied; `edited` after manual style tweaks. */
  styleSource: ResumeCreatorStyleSource;
  style: ResumeCreatorStyle;
  /** Ordered section list; drag-reorder updates this and the PDF order. */
  sections: ResumeCreatorSectionMeta[];
  content: ResumeCreatorContent;
  /** Target role + JD help the ATS pane produce a job-oriented score (signed-in only). */
  targetRole: string;
  targetJd: string;
  updatedAt: string;
};

/** A named style config the user saved (DB) or a built-in preset. */
export type ResumeCreatorStyleConfig = {
  id: string;
  name: string;
  builtin: boolean;
  style: ResumeCreatorStyle;
};

export const RESUME_CREATOR_DRAFT_KEY = "aavedak.resume-creator.draft.v2";
/** Migrate once from the phase-1 key. */
export const RESUME_CREATOR_DRAFT_KEY_V1 = "aavedak.resume-creator.draft.v1";
export const RESUME_CREATOR_PANELS_KEY = "aavedak.resume-creator.panels.v1";

/** A4 in PDF points (jsPDF default). */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

export const RESUME_CREATOR_FONTS: Record<
  ResumeCreatorFontId,
  { label: string; css: string; pdf: "helvetica" | "times" }
> = {
  inter: {
    label: "Inter / Helvetica",
    css: 'Helvetica, Arial, "Helvetica Neue", Inter, ui-sans-serif, system-ui, sans-serif',
    pdf: "helvetica",
  },
  system: {
    label: "System sans",
    css: 'Helvetica, Arial, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    pdf: "helvetica",
  },
  georgia: {
    label: "Georgia",
    css: 'Georgia, "Times New Roman", Times, serif',
    pdf: "times",
  },
  times: {
    label: "Times",
    css: 'Times, "Times New Roman", Georgia, serif',
    pdf: "times",
  },
};

export const DEFAULT_SECTION_ORDER: ResumeCreatorSectionMeta[] = [
  { id: "contact", title: "Contact", visible: true },
  { id: "summary", title: "Summary", visible: true },
  { id: "experience", title: "Experience", visible: true },
  { id: "education", title: "Education", visible: true },
  { id: "skills", title: "Skills", visible: true },
  { id: "projects", title: "Projects", visible: true },
  { id: "certifications", title: "Certifications", visible: false },
];

export const STYLE_PRESETS: Record<
  ResumeCreatorPresetId,
  { label: string; description: string; style: ResumeCreatorStyle }
> = {
  classic: {
    label: "Classic",
    description: "Formal single-column · underlined titles · standard margins.",
    style: {
      fontFamily: "inter",
      headerPt: 18,
      sectionTitlePt: 11,
      bodyPt: 10,
      footerPt: 8.5,
      marginXPt: 40,
      marginYPt: 40,
      sectionGapPt: 10,
      lineHeight: 1.28,
      rule: "strong",
    },
  },
  modern: {
    label: "Modern clean",
    description: "Tighter gaps · lighter rules · slightly smaller type.",
    style: {
      fontFamily: "inter",
      headerPt: 16,
      sectionTitlePt: 10,
      bodyPt: 9.5,
      footerPt: 8,
      marginXPt: 36,
      marginYPt: 36,
      sectionGapPt: 8,
      lineHeight: 1.32,
      rule: "light",
    },
  },
  executive: {
    label: "Executive",
    description: "Serif type · wider margins · calm section spacing.",
    style: {
      fontFamily: "georgia",
      headerPt: 20,
      sectionTitlePt: 11,
      bodyPt: 10,
      footerPt: 8.5,
      marginXPt: 48,
      marginYPt: 44,
      sectionGapPt: 12,
      lineHeight: 1.3,
      rule: "strong",
    },
  },
};
