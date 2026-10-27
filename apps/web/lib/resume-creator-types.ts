/** Client-side resume-builder draft. Autosaved locally until the user hits Save. */

export type ResumeCreatorPresetId = "classic" | "modern" | "executive";

/** Active style source: a built-in preset id, a saved custom id, or free edits. */
export type ResumeCreatorStyleSource =
  | { kind: "preset"; id: ResumeCreatorPresetId }
  | { kind: "custom"; id: string; name: string }
  | { kind: "edited" };

export type ResumeCreatorFontId =
  | "inter"
  | "arial"
  | "helvetica"
  | "verdana"
  | "roboto"
  | "openSans"
  | "lato"
  | "calibri"
  | "segoe"
  | "system"
  | "georgia"
  | "times";

export type ResumeFontWeight = "regular" | "medium" | "semibold" | "bold";

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

/** A contact field shown as a titled link (mailto / tel / https). */
export type ResumeContactLink = {
  /** Visible text on the resume. Falls back to `value` when empty. */
  label: string;
  /** Raw value: email address, phone number, or URL/handle. */
  value: string;
};

export type ResumeContact = {
  fullName: string;
  email: ResumeContactLink;
  phone: ResumeContactLink;
  location: string;
  linkedin: ResumeContactLink;
  github: ResumeContactLink;
  portfolio: ResumeContactLink;
};

/**
 * Print style in PDF points (1pt = 1/72in). The HTML preview uses the same numbers
 * with CSS `pt` units on a true-A4 paper, then scales the whole page to fit the pane.
 */
export type ResumePageFormat = "a4" | "letter";
export type ResumeDateFormat = "shortName" | "numeric" | "long";
export type ResumeHAlign = "left" | "center" | "right";
export type ResumeSideAlign = "left" | "right";
export type ResumeSkillsLayout = "inline" | "columns";
export type ResumeSkillsCategoryMode = "inline" | "categories";
export type ResumeEducationShowBy = "institution" | "degree";
export type ResumeEducationLayout = "stacked" | "inline";

export type ResumeCreatorStyle = {
  /** Name / primary headings. */
  primaryFont: ResumeCreatorFontId;
  /** Body, secondary headings, meta. */
  secondaryFont: ResumeCreatorFontId;
  headerPt: number;
  footerPt: number;
  bodyPt: number;
  sectionTitlePt: number;
  headerWeight: ResumeFontWeight;
  secondaryHeadingWeight: ResumeFontWeight;
  bodyWeight: ResumeFontWeight;
  sectionTitleWeight: ResumeFontWeight;
  /** Line-height multiplier (UI shows as %). */
  lineHeight: number;
  /** Visual rule under section titles. */
  rule: "strong" | "light" | "none";

  // —— Global layout ——
  pageFormat: ResumePageFormat;
  /** Header & footer band (pt). Min 0. */
  headerFooterPt: number;
  /** Top & bottom page margin (pt). Min 0. */
  marginYPt: number;
  /** Left & right page margin (pt). Min 0. */
  marginXPt: number;
  /** Between sections (pt). */
  sectionGapPt: number;
  /** Between titles and content (pt). */
  titleContentGapPt: number;
  /** Between content blocks such as roles (pt). */
  contentBlockGapPt: number;
  /** Inside a content block, e.g. between bullets (pt). */
  insideBlockGapPt: number;
  dateFormat: ResumeDateFormat;
  headerAlign: ResumeHAlign;
  dateAlign: ResumeSideAlign;
  locationAlign: ResumeSideAlign;

  // —— Skills (section-scoped; still on style so preview/PDF share one model) ——
  skillsLayout: ResumeSkillsLayout;
  skillsColumns: number;
  skillsCategoryMode: ResumeSkillsCategoryMode;
  /** Category label column width when categorized (pt). */
  skillsCategoryWidthPt: number;

  // —— Education (section-scoped) ——
  educationShowBy: ResumeEducationShowBy;
  educationLayout: ResumeEducationLayout;
};

export type ResumeCreatorSectionMeta = {
  id: ResumeCreatorSectionId;
  title: string;
  visible: boolean;
};

export type ResumeCreatorContent = {
  contact: ResumeContact;
  summary: string;
  experience: ResumeExperienceEntry[];
  education: ResumeEducationEntry[];
  skills: string;
  projects: ResumeProjectEntry[];
  certifications: ResumeCertificationEntry[];
};

export type ResumeCreatorDraft = {
  version: 2;
  styleSource: ResumeCreatorStyleSource;
  style: ResumeCreatorStyle;
  sections: ResumeCreatorSectionMeta[];
  content: ResumeCreatorContent;
  targetRole: string;
  targetJd: string;
  updatedAt: string;
};

export type ResumeCreatorStyleConfig = {
  id: string;
  name: string;
  builtin: boolean;
  style: ResumeCreatorStyle;
};

export const RESUME_CREATOR_DRAFT_KEY = "aavedak.resume-creator.draft.v2";
export const RESUME_CREATOR_DRAFT_KEY_V1 = "aavedak.resume-creator.draft.v1";
export const RESUME_CREATOR_PANELS_KEY = "aavedak.resume-creator.panels.v1";

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

/** Page size in PDF points for the active format. */
export function pageSizePt(format: ResumePageFormat): { width: number; height: number } {
  if (format === "letter") return { width: 612, height: 792 };
  return { width: A4_WIDTH_PT, height: A4_HEIGHT_PT };
}

export const RESUME_CREATOR_FONTS: Record<
  ResumeCreatorFontId,
  { label: string; css: string; pdf: "helvetica" | "times"; group: "sans" | "serif" }
> = {
  inter: {
    label: "Inter",
    css: 'Inter, Helvetica, Arial, "Helvetica Neue", ui-sans-serif, system-ui, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  arial: {
    label: "Arial",
    css: 'Arial, Helvetica, "Helvetica Neue", ui-sans-serif, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  helvetica: {
    label: "Helvetica",
    css: 'Helvetica, Arial, "Helvetica Neue", ui-sans-serif, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  verdana: {
    label: "Verdana",
    css: "Verdana, Geneva, Tahoma, sans-serif",
    pdf: "helvetica",
    group: "sans",
  },
  roboto: {
    label: "Roboto",
    css: 'Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  openSans: {
    label: "Open Sans",
    css: '"Open Sans", "Segoe UI", Helvetica, Arial, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  lato: {
    label: "Lato",
    css: 'Lato, "Helvetica Neue", Helvetica, Arial, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  calibri: {
    label: "Calibri",
    css: 'Calibri, Carlito, "Segoe UI", Candara, Arial, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  segoe: {
    label: "Segoe UI",
    css: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  system: {
    label: "System sans",
    css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    pdf: "helvetica",
    group: "sans",
  },
  georgia: {
    label: "Georgia",
    css: 'Georgia, "Times New Roman", Times, serif',
    pdf: "times",
    group: "serif",
  },
  times: {
    label: "Times",
    css: 'Times, "Times New Roman", Georgia, serif',
    pdf: "times",
    group: "serif",
  },
};

export const RESUME_FONT_WEIGHTS: Record<
  ResumeFontWeight,
  { label: string; css: number; pdf: "normal" | "bold" }
> = {
  regular: { label: "Regular", css: 400, pdf: "normal" },
  medium: { label: "Medium", css: 500, pdf: "normal" },
  semibold: { label: "Semibold", css: 600, pdf: "bold" },
  bold: { label: "Bold", css: 700, pdf: "bold" },
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
      primaryFont: "arial",
      secondaryFont: "arial",
      headerPt: 16,
      footerPt: 9,
      bodyPt: 10,
      sectionTitlePt: 11,
      headerWeight: "bold",
      secondaryHeadingWeight: "regular",
      bodyWeight: "regular",
      sectionTitleWeight: "semibold",
      lineHeight: 1.28,
      rule: "strong",
      pageFormat: "a4",
      headerFooterPt: 22,
      marginYPt: 40,
      marginXPt: 40,
      sectionGapPt: 10,
      titleContentGapPt: 4,
      contentBlockGapPt: 6,
      insideBlockGapPt: 2,
      dateFormat: "shortName",
      headerAlign: "left",
      dateAlign: "right",
      locationAlign: "right",
      skillsLayout: "inline",
      skillsColumns: 3,
      skillsCategoryMode: "inline",
      skillsCategoryWidthPt: 94,
      educationShowBy: "degree",
      educationLayout: "stacked",
    },
  },
  modern: {
    label: "Modern clean",
    description: "Tighter gaps · lighter rules · slightly smaller type.",
    style: {
      primaryFont: "inter",
      secondaryFont: "inter",
      headerPt: 16,
      footerPt: 8,
      bodyPt: 9.5,
      sectionTitlePt: 10,
      headerWeight: "semibold",
      secondaryHeadingWeight: "regular",
      bodyWeight: "regular",
      sectionTitleWeight: "medium",
      lineHeight: 1.32,
      rule: "light",
      pageFormat: "a4",
      headerFooterPt: 18,
      marginYPt: 36,
      marginXPt: 36,
      sectionGapPt: 8,
      titleContentGapPt: 3,
      contentBlockGapPt: 5,
      insideBlockGapPt: 2,
      dateFormat: "shortName",
      headerAlign: "left",
      dateAlign: "right",
      locationAlign: "left",
      skillsLayout: "columns",
      skillsColumns: 4,
      skillsCategoryMode: "inline",
      skillsCategoryWidthPt: 94,
      educationShowBy: "institution",
      educationLayout: "stacked",
    },
  },
  executive: {
    label: "Executive",
    description: "Serif type · wider margins · calm section spacing.",
    style: {
      primaryFont: "georgia",
      secondaryFont: "georgia",
      headerPt: 20,
      footerPt: 8.5,
      bodyPt: 10,
      sectionTitlePt: 11,
      headerWeight: "bold",
      secondaryHeadingWeight: "regular",
      bodyWeight: "regular",
      sectionTitleWeight: "semibold",
      lineHeight: 1.3,
      rule: "strong",
      pageFormat: "letter",
      headerFooterPt: 24,
      marginYPt: 44,
      marginXPt: 48,
      sectionGapPt: 12,
      titleContentGapPt: 4,
      contentBlockGapPt: 8,
      insideBlockGapPt: 2,
      dateFormat: "long",
      headerAlign: "center",
      dateAlign: "right",
      locationAlign: "right",
      skillsLayout: "inline",
      skillsColumns: 3,
      skillsCategoryMode: "categories",
      skillsCategoryWidthPt: 110,
      educationShowBy: "institution",
      educationLayout: "stacked",
    },
  },
};
