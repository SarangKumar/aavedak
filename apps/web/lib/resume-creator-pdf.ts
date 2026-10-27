/** Client-side A4 PDF download for the resume creator draft. */

import { draftToPlainText, suggestedDisplayName } from "@/lib/resume-creator-draft";
import {
  RESUME_CREATOR_FONTS,
  type ResumeCreatorDraft,
  type ResumeCreatorSectionMeta,
} from "@/lib/resume-creator-types";

function safeFilename(name: string): string {
  const base = name
    .trim()
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "resume"}.pdf`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Doc = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  setFont: (name: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setDrawColor: (...args: number[]) => void;
  setTextColor: (...args: number[]) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  text: (text: string | string[], x: number, y: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addPage: () => void;
  output: (type: "blob") => Blob;
};

type WriteCtx = {
  doc: Doc;
  font: "helvetica" | "times";
  margin: number;
  contentW: number;
  bottom: number;
  y: number;
  bodyPt: number;
  titlePt: number;
  headerPt: number;
  footerPt: number;
  templateId: ResumeCreatorDraft["templateId"];
};

function ensureSpace(ctx: WriteCtx, need: number) {
  if (ctx.y + need > ctx.bottom) {
    ctx.doc.addPage();
    ctx.y = ctx.margin;
  }
}

function writeLines(
  ctx: WriteCtx,
  text: string,
  opts: { pt: number; style?: string; indent?: number; gapAfter?: number; color?: number[] },
) {
  const pt = opts.pt;
  const style = opts.style ?? "normal";
  const indent = opts.indent ?? 0;
  const gapAfter = opts.gapAfter ?? 2;
  ctx.doc.setFont(ctx.font, style);
  ctx.doc.setFontSize(pt);
  if (opts.color) ctx.doc.setTextColor(...opts.color);
  else ctx.doc.setTextColor(20, 20, 20);
  const lh = pt * 1.28;
  for (const line of ctx.doc.splitTextToSize(text, ctx.contentW - indent)) {
    ensureSpace(ctx, lh);
    ctx.doc.text(line, ctx.margin + indent, ctx.y);
    ctx.y += lh;
  }
  ctx.y += gapAfter;
}

function writeSectionTitle(ctx: WriteCtx, title: string) {
  ctx.y += ctx.templateId === "modern" ? 6 : 8;
  ensureSpace(ctx, ctx.titlePt * 1.5 + 4);
  writeLines(ctx, title.toUpperCase(), {
    pt: ctx.titlePt,
    style: "bold",
    gapAfter: 1,
  });
  ctx.doc.setDrawColor(ctx.templateId === "modern" ? 200 : 160);
  ctx.doc.line(ctx.margin, ctx.y, ctx.margin + ctx.contentW, ctx.y);
  ctx.y += 4;
}

function sectionTitleOf(sections: ResumeCreatorSectionMeta[], id: string): string {
  return sections.find((s) => s.id === id)?.title ?? id;
}

function renderDraft(doc: Doc, draft: ResumeCreatorDraft) {
  const font = RESUME_CREATOR_FONTS[draft.typography.fontFamily].pdf;
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const ctx: WriteCtx = {
    doc,
    font,
    margin,
    contentW,
    bottom: pageH - margin,
    y: margin,
    bodyPt: draft.typography.bodyPt,
    titlePt: draft.typography.sectionTitlePt,
    headerPt: draft.typography.headerPt,
    footerPt: draft.typography.footerPt,
    templateId: draft.templateId,
  };

  const { content } = draft;
  const visible = (id: string) => draft.sections.some((s) => s.id === id && s.visible);

  for (const section of draft.sections) {
    if (!section.visible) continue;
    switch (section.id) {
      case "contact": {
        const c = content.contact;
        if (c.fullName.trim()) {
          writeLines(ctx, c.fullName.trim(), {
            pt: ctx.headerPt,
            style: "bold",
            gapAfter: 2,
          });
        }
        const bits = [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
          .map((s) => s.trim())
          .filter(Boolean);
        if (bits.length) {
          writeLines(ctx, bits.join("  ·  "), {
            pt: ctx.footerPt,
            gapAfter: 4,
            color: [80, 80, 80],
          });
        }
        if (draft.templateId !== "classic") {
          doc.setDrawColor(180);
          doc.line(margin, ctx.y, margin + contentW, ctx.y);
          ctx.y += 6;
        }
        break;
      }
      case "summary": {
        if (!content.summary.trim()) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "summary"));
        writeLines(ctx, content.summary.trim(), { pt: ctx.bodyPt, gapAfter: 2 });
        break;
      }
      case "experience": {
        const entries = content.experience.filter(
          (e) => e.company.trim() || e.title.trim() || e.bullets.some((b) => b.trim()),
        );
        if (!entries.length) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "experience"));
        for (const e of entries) {
          const left = [e.title.trim(), e.company.trim()].filter(Boolean).join(" — ");
          const right = [e.start.trim(), e.end.trim()].filter(Boolean).join(" – ");
          if (left || right) {
            writeLines(ctx, [left, right].filter(Boolean).join("   ·   "), {
              pt: ctx.bodyPt,
              style: "bold",
              gapAfter: 1,
            });
          }
          if (e.location.trim()) {
            writeLines(ctx, e.location.trim(), {
              pt: ctx.footerPt,
              gapAfter: 1,
              color: [90, 90, 90],
            });
          }
          for (const b of e.bullets) {
            if (!b.trim()) continue;
            writeLines(ctx, `•  ${b.trim()}`, { pt: ctx.bodyPt, indent: 8, gapAfter: 1 });
          }
          ctx.y += 3;
        }
        break;
      }
      case "education": {
        const entries = content.education.filter((e) => e.school.trim() || e.degree.trim());
        if (!entries.length) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "education"));
        for (const e of entries) {
          const left = [e.degree.trim(), e.school.trim()].filter(Boolean).join(" — ");
          const right = [e.start.trim(), e.end.trim()].filter(Boolean).join(" – ");
          writeLines(ctx, [left, right].filter(Boolean).join("   ·   "), {
            pt: ctx.bodyPt,
            style: "bold",
            gapAfter: 1,
          });
          const meta = [e.location.trim(), e.details.trim()].filter(Boolean).join(" · ");
          if (meta) writeLines(ctx, meta, { pt: ctx.footerPt, gapAfter: 2, color: [90, 90, 90] });
        }
        break;
      }
      case "skills": {
        const skills = content.skills
          .split(/[\n,•]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!skills.length) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "skills"));
        writeLines(ctx, skills.join(" · "), { pt: ctx.bodyPt, gapAfter: 2 });
        break;
      }
      case "projects": {
        const entries = content.projects.filter(
          (p) => p.name.trim() || p.description.trim() || p.bullets.some((b) => b.trim()),
        );
        if (!entries.length) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "projects"));
        for (const p of entries) {
          const head = [p.name.trim(), p.link.trim()].filter(Boolean).join(" — ");
          if (head) writeLines(ctx, head, { pt: ctx.bodyPt, style: "bold", gapAfter: 1 });
          if (p.description.trim()) {
            writeLines(ctx, p.description.trim(), { pt: ctx.bodyPt, gapAfter: 1 });
          }
          for (const b of p.bullets) {
            if (!b.trim()) continue;
            writeLines(ctx, `•  ${b.trim()}`, { pt: ctx.bodyPt, indent: 8, gapAfter: 1 });
          }
          ctx.y += 2;
        }
        break;
      }
      case "certifications": {
        const entries = content.certifications.filter((c) => c.name.trim());
        if (!entries.length) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "certifications"));
        for (const c of entries) {
          writeLines(
            ctx,
            [c.name.trim(), c.issuer.trim(), c.year.trim()].filter(Boolean).join(" — "),
            { pt: ctx.bodyPt, gapAfter: 1 },
          );
        }
        break;
      }
      default:
        break;
    }
  }

  void visible;
}

export async function resumeCreatorPdfBlob(draft: ResumeCreatorDraft): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" }) as unknown as Doc;
  renderDraft(doc, draft);
  return doc.output("blob");
}

export async function downloadResumeCreatorPdf(draft: ResumeCreatorDraft) {
  const blob = await resumeCreatorPdfBlob(draft);
  triggerBlobDownload(blob, safeFilename(suggestedDisplayName(draft)));
}

export function resumeCreatorPlainText(draft: ResumeCreatorDraft): string {
  return draftToPlainText(draft);
}
