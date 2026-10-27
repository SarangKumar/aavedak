/** Client-side resume-builder draft. Autosaved locally until the user hits Save. */

export type ResumeCreatorTemplateId = "classic" | "modern" | "executive";

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

export type ResumeCreatorTypography = {
  fontFamily: ResumeCreatorFontId;
  /** Point sizes used in both the HTML A4 preview and the downloaded PDF. */
  headerPt: number;
  sectionTitlePt: number;
  bodyPt: number;
  footerPt: number;
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
  version: 1;
  templateId: ResumeCreatorTemplateId;
  typography: ResumeCreatorTypography;
  /** Ordered section list; drag-reorder updates this and the PDF order. */
  sections: ResumeCreatorSectionMeta[];
  content: ResumeCreatorContent;
  /** Target role + JD help the ATS pane produce a job-oriented score (signed-in only). */
  targetRole: string;
  targetJd: string;
  updatedAt: string;
};

export const RESUME_CREATOR_DRAFT_KEY = "aavedak.resume-creator.draft.v1";
export const RESUME_CREATOR_PANELS_KEY = "aavedak.resume-creator.panels.v1";

export const RESUME_CREATOR_FONTS: Record<
  ResumeCreatorFontId,
  { label: string; css: string; pdf: "helvetica" | "times" }
> = {
  inter: {
    label: "Inter / Helvetica",
    css: 'Inter, Helvetica, Arial, "Helvetica Neue", ui-sans-serif, system-ui, sans-serif',
    pdf: "helvetica",
  },
  system: {
    label: "System sans",
    css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    pdf: "helvetica",
  },
  georgia: {
    label: "Georgia",
    css: 'Georgia, "Times New Roman", Times, serif',
    pdf: "times",
  },
  times: {
    label: "Times",
    css: '"Times New Roman", Times, Georgia, serif',
    pdf: "times",
  },
};

export const RESUME_CREATOR_TEMPLATES: Record<
  ResumeCreatorTemplateId,
  { label: string; description: string }
> = {
  classic: {
    label: "Classic",
    description: "Single-column formal layout with underlined section titles.",
  },
  modern: {
    label: "Modern clean",
    description: "Single-column with a compact header and light section rules.",
  },
  executive: {
    label: "Executive",
    description: "Formal layout with a slim left rail for skills and contact links.",
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
