/** Defaults, localStorage load/save, and pure helpers for the resume creator draft. */

import {
  DEFAULT_SECTION_ORDER,
  type ResumeCreatorDraft,
  type ResumeCreatorSectionId,
  type ResumeCreatorSectionMeta,
  type ResumeCreatorTemplateId,
  type ResumeCreatorTypography,
  RESUME_CREATOR_DRAFT_KEY,
  RESUME_CREATOR_PANELS_KEY,
} from "@/lib/resume-creator-types";

function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newExperienceEntry() {
  return {
    id: uid("exp"),
    company: "",
    title: "",
    location: "",
    start: "",
    end: "",
    bullets: [""],
  };
}

export function newEducationEntry() {
  return {
    id: uid("edu"),
    school: "",
    degree: "",
    location: "",
    start: "",
    end: "",
    details: "",
  };
}

export function newProjectEntry() {
  return {
    id: uid("proj"),
    name: "",
    link: "",
    description: "",
    bullets: [""],
  };
}

export function newCertificationEntry() {
  return {
    id: uid("cert"),
    name: "",
    issuer: "",
    year: "",
  };
}

export function defaultTypography(): ResumeCreatorTypography {
  return {
    fontFamily: "inter",
    headerPt: 18,
    sectionTitlePt: 11,
    bodyPt: 10,
    footerPt: 8.5,
  };
}

export function createEmptyDraft(): ResumeCreatorDraft {
  return {
    version: 1,
    templateId: "classic",
    typography: defaultTypography(),
    sections: DEFAULT_SECTION_ORDER.map((s) => ({ ...s })),
    content: {
      contact: {
        fullName: "",
        email: "",
        phone: "",
        location: "",
        linkedin: "",
        github: "",
        portfolio: "",
      },
      summary: "",
      experience: [newExperienceEntry()],
      education: [newEducationEntry()],
      skills: "",
      projects: [newProjectEntry()],
      certifications: [],
    },
    targetRole: "",
    targetJd: "",
    updatedAt: new Date().toISOString(),
  };
}

/** Soft placeholder so a blank preview still looks like a resume. */
export function createSampleDraft(): ResumeCreatorDraft {
  const draft = createEmptyDraft();
  draft.content.contact = {
    fullName: "Alex Rivera",
    email: "alex.rivera@example.com",
    phone: "+91 98765 43210",
    location: "Bengaluru, India",
    linkedin: "linkedin.com/in/alexrivera",
    github: "github.com/alexrivera",
    portfolio: "",
  };
  draft.content.summary =
    "Software engineer with 2 years building reliable web APIs and data pipelines. Comfortable owning features end to end and writing clear docs.";
  draft.content.experience = [
    {
      id: uid("exp"),
      company: "Northwind Labs",
      title: "Software Engineer",
      location: "Bengaluru",
      start: "2024-01",
      end: "Present",
      bullets: [
        "Shipped a NestJS service that cut p95 latency for search from 420ms to 180ms.",
        "Added Postgres indexes and query budgets; reduced timeout errors by 60%.",
        "Wrote runbooks and on-call notes used by a 6-person squad.",
      ],
    },
  ];
  draft.content.education = [
    {
      id: uid("edu"),
      school: "Example Institute of Technology",
      degree: "B.Tech, Computer Science",
      location: "India",
      start: "2019",
      end: "2023",
      details: "GPA 8.4 / 10",
    },
  ];
  draft.content.skills =
    "TypeScript, Python, React, Next.js, Node.js, PostgreSQL, Redis, Docker, Git";
  draft.content.projects = [
    {
      id: uid("proj"),
      name: "Job Match Tracker",
      link: "github.com/alexrivera/job-match",
      description: "Personal tool that ranks open roles against a resume.",
      bullets: ["Parsed public ATS boards and scored fits with a weighted rubric."],
    },
  ];
  draft.updatedAt = new Date().toISOString();
  return draft;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

const SECTION_IDS: ResumeCreatorSectionId[] = [
  "contact",
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
];

function normalizeSections(raw: unknown): ResumeCreatorSectionMeta[] {
  const byId = new Map(DEFAULT_SECTION_ORDER.map((s) => [s.id, { ...s }]));
  if (Array.isArray(raw)) {
    const ordered: ResumeCreatorSectionMeta[] = [];
    const seen = new Set<ResumeCreatorSectionId>();
    for (const row of raw) {
      if (!isObject(row)) continue;
      const id = row.id as ResumeCreatorSectionId;
      if (!SECTION_IDS.includes(id) || seen.has(id)) continue;
      seen.add(id);
      const base = byId.get(id)!;
      ordered.push({
        id,
        title: asString(row.title, base.title) || base.title,
        visible: row.visible !== false,
      });
    }
    for (const id of SECTION_IDS) {
      if (!seen.has(id)) ordered.push({ ...byId.get(id)! });
    }
    return ordered;
  }
  return DEFAULT_SECTION_ORDER.map((s) => ({ ...s }));
}

/** Coerce unknown JSON into a valid draft; never throws. */
export function normalizeDraft(raw: unknown): ResumeCreatorDraft {
  const base = createEmptyDraft();
  if (!isObject(raw)) return base;

  const templateId = asString(raw.templateId, "classic") as ResumeCreatorTemplateId;
  if (templateId === "classic" || templateId === "modern" || templateId === "executive") {
    base.templateId = templateId;
  }

  if (isObject(raw.typography)) {
    const t = raw.typography;
    const font = asString(t.fontFamily, "inter");
    base.typography = {
      fontFamily:
        font === "georgia" || font === "times" || font === "system" || font === "inter"
          ? font
          : "inter",
      headerPt: asNumber(t.headerPt, 18, 12, 28),
      sectionTitlePt: asNumber(t.sectionTitlePt, 11, 8, 18),
      bodyPt: asNumber(t.bodyPt, 10, 7, 14),
      footerPt: asNumber(t.footerPt, 8.5, 6, 12),
    };
  }

  base.sections = normalizeSections(raw.sections);
  base.targetRole = asString(raw.targetRole);
  base.targetJd = asString(raw.targetJd);
  base.updatedAt = asString(raw.updatedAt, new Date().toISOString());

  if (isObject(raw.content)) {
    const c = raw.content;
    if (isObject(c.contact)) {
      base.content.contact = {
        fullName: asString(c.contact.fullName),
        email: asString(c.contact.email),
        phone: asString(c.contact.phone),
        location: asString(c.contact.location),
        linkedin: asString(c.contact.linkedin),
        github: asString(c.contact.github),
        portfolio: asString(c.contact.portfolio),
      };
    }
    base.content.summary = asString(c.summary);
    base.content.skills = asString(c.skills);

    if (Array.isArray(c.experience)) {
      base.content.experience = c.experience.filter(isObject).map((row) => ({
        id: asString(row.id, uid("exp")),
        company: asString(row.company),
        title: asString(row.title),
        location: asString(row.location),
        start: asString(row.start),
        end: asString(row.end),
        bullets: Array.isArray(row.bullets)
          ? row.bullets.map((b) => asString(b)).filter((b, i, arr) => b || arr.length === 1)
          : [""],
      }));
      if (!base.content.experience.length) base.content.experience = [newExperienceEntry()];
    }

    if (Array.isArray(c.education)) {
      base.content.education = c.education.filter(isObject).map((row) => ({
        id: asString(row.id, uid("edu")),
        school: asString(row.school),
        degree: asString(row.degree),
        location: asString(row.location),
        start: asString(row.start),
        end: asString(row.end),
        details: asString(row.details),
      }));
      if (!base.content.education.length) base.content.education = [newEducationEntry()];
    }

    if (Array.isArray(c.projects)) {
      base.content.projects = c.projects.filter(isObject).map((row) => ({
        id: asString(row.id, uid("proj")),
        name: asString(row.name),
        link: asString(row.link),
        description: asString(row.description),
        bullets: Array.isArray(row.bullets) ? row.bullets.map((b) => asString(b)) : [""],
      }));
    }

    if (Array.isArray(c.certifications)) {
      base.content.certifications = c.certifications.filter(isObject).map((row) => ({
        id: asString(row.id, uid("cert")),
        name: asString(row.name),
        issuer: asString(row.issuer),
        year: asString(row.year),
      }));
    }
  }

  return base;
}

export function loadDraftFromStorage(): ResumeCreatorDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESUME_CREATOR_DRAFT_KEY);
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDraftToStorage(draft: ResumeCreatorDraft): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ResumeCreatorDraft = { ...draft, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(RESUME_CREATOR_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — editing still works in memory.
  }
}

export function clearDraftStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RESUME_CREATOR_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export type PanelLayout = { left: number; center: number; right: number };

export const DEFAULT_PANEL_LAYOUT: PanelLayout = { left: 25, center: 50, right: 25 };

export function loadPanelLayout(): PanelLayout {
  if (typeof window === "undefined") return DEFAULT_PANEL_LAYOUT;
  try {
    const raw = window.localStorage.getItem(RESUME_CREATOR_PANELS_KEY);
    if (!raw) return DEFAULT_PANEL_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    const left = asNumber(parsed.left, 25, 15, 40);
    const right = asNumber(parsed.right, 25, 15, 40);
    const center = Math.max(20, 100 - left - right);
    return { left, center, right };
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

export function savePanelLayout(layout: PanelLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RESUME_CREATOR_PANELS_KEY, JSON.stringify(layout));
  } catch {
    // ignore
  }
}

export function reorderSections(
  sections: ResumeCreatorSectionMeta[],
  orderedIds: ResumeCreatorSectionId[],
): ResumeCreatorSectionMeta[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const next: ResumeCreatorSectionMeta[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (row) next.push(row);
  }
  for (const row of sections) {
    if (!orderedIds.includes(row.id)) next.push(row);
  }
  return next;
}

export function setSectionVisible(
  sections: ResumeCreatorSectionMeta[],
  id: ResumeCreatorSectionId,
  visible: boolean,
): ResumeCreatorSectionMeta[] {
  return sections.map((s) => (s.id === id ? { ...s, visible } : s));
}

/** Plain text used for ATS scoring — mirrors visible PDF content order. */
export function draftToPlainText(draft: ResumeCreatorDraft): string {
  const lines: string[] = [];
  const { content } = draft;
  const visible = new Set(draft.sections.filter((s) => s.visible).map((s) => s.id));

  for (const section of draft.sections) {
    if (!section.visible) continue;
    switch (section.id) {
      case "contact": {
        const c = content.contact;
        if (c.fullName.trim()) lines.push(c.fullName.trim());
        const bits = [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
          .map((s) => s.trim())
          .filter(Boolean);
        if (bits.length) lines.push(bits.join(" · "));
        lines.push("");
        break;
      }
      case "summary": {
        if (!content.summary.trim()) break;
        lines.push(section.title.toUpperCase());
        lines.push(content.summary.trim());
        lines.push("");
        break;
      }
      case "experience": {
        const entries = content.experience.filter(
          (e) => e.company.trim() || e.title.trim() || e.bullets.some((b) => b.trim()),
        );
        if (!entries.length) break;
        lines.push(section.title.toUpperCase());
        for (const e of entries) {
          const head = [e.title, e.company]
            .map((s) => s.trim())
            .filter(Boolean)
            .join(" — ");
          const when = [e.start, e.end]
            .map((s) => s.trim())
            .filter(Boolean)
            .join(" – ");
          const loc = e.location.trim();
          lines.push([head, when, loc].filter(Boolean).join(" | "));
          for (const b of e.bullets) {
            if (b.trim()) lines.push(`• ${b.trim()}`);
          }
          lines.push("");
        }
        break;
      }
      case "education": {
        const entries = content.education.filter((e) => e.school.trim() || e.degree.trim());
        if (!entries.length) break;
        lines.push(section.title.toUpperCase());
        for (const e of entries) {
          const head = [e.degree, e.school]
            .map((s) => s.trim())
            .filter(Boolean)
            .join(" — ");
          const when = [e.start, e.end]
            .map((s) => s.trim())
            .filter(Boolean)
            .join(" – ");
          lines.push([head, when, e.location.trim()].filter(Boolean).join(" | "));
          if (e.details.trim()) lines.push(e.details.trim());
          lines.push("");
        }
        break;
      }
      case "skills": {
        const skills = content.skills
          .split(/[\n,•]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!skills.length) break;
        lines.push(section.title.toUpperCase());
        lines.push(skills.join(", "));
        lines.push("");
        break;
      }
      case "projects": {
        const entries = content.projects.filter(
          (p) => p.name.trim() || p.description.trim() || p.bullets.some((b) => b.trim()),
        );
        if (!entries.length) break;
        lines.push(section.title.toUpperCase());
        for (const p of entries) {
          const head = [p.name.trim(), p.link.trim()].filter(Boolean).join(" — ");
          if (head) lines.push(head);
          if (p.description.trim()) lines.push(p.description.trim());
          for (const b of p.bullets) {
            if (b.trim()) lines.push(`• ${b.trim()}`);
          }
          lines.push("");
        }
        break;
      }
      case "certifications": {
        const entries = content.certifications.filter((c) => c.name.trim());
        if (!entries.length) break;
        lines.push(section.title.toUpperCase());
        for (const c of entries) {
          lines.push([c.name.trim(), c.issuer.trim(), c.year.trim()].filter(Boolean).join(" — "));
        }
        lines.push("");
        break;
      }
      default:
        break;
    }
  }

  void visible;
  return lines.join("\n").trim();
}

export function suggestedDisplayName(draft: ResumeCreatorDraft): string {
  const name = draft.content.contact.fullName.trim() || "Resume";
  const role = draft.targetRole.trim();
  const base = role ? `${name} — ${role}` : name;
  return base.slice(0, 120);
}
