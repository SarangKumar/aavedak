/** Client-side A4 PDF download — same pt metrics as the live HTML preview. */

import { draftToPlainText, suggestedDisplayName } from "@/lib/resume-creator-draft";
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  RESUME_CREATOR_FONTS,
  RESUME_FONT_WEIGHTS,
  type ResumeCreatorDraft,
  type ResumeCreatorSectionMeta,
  type ResumeCreatorStyle,
  type ResumeFontWeight,
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
  primaryFont: "helvetica" | "times";
  secondaryFont: "helvetica" | "times";
  style: ResumeCreatorStyle;
  contentW: number;
  bottom: number;
  y: number;
};

function pdfWeight(w: ResumeFontWeight): "normal" | "bold" {
  return RESUME_FONT_WEIGHTS[w].pdf;
}

function ensureSpace(ctx: WriteCtx, need: number) {
  if (ctx.y + need > ctx.bottom) {
    ctx.doc.addPage();
    ctx.y = ctx.style.marginYPt;
  }
}

function writeLines(
  ctx: WriteCtx,
  text: string,
  opts: {
    pt: number;
    font?: "primary" | "secondary";
    weight?: ResumeFontWeight;
    indent?: number;
    gapAfter?: number;
    color?: number[];
  },
) {
  const pt = opts.pt;
  const face = opts.font === "primary" ? ctx.primaryFont : ctx.secondaryFont;
  const fontStyle = opts.weight ? pdfWeight(opts.weight) : "normal";
  const indent = opts.indent ?? 0;
  const gapAfter = opts.gapAfter ?? 2;
  ctx.doc.setFont(face, fontStyle);
  ctx.doc.setFontSize(pt);
  if (opts.color) ctx.doc.setTextColor(...opts.color);
  else ctx.doc.setTextColor(20, 20, 20);
  const lh = pt * ctx.style.lineHeight;
  for (const line of ctx.doc.splitTextToSize(text, ctx.contentW - indent)) {
    ensureSpace(ctx, lh);
    // jsPDF draws on the baseline; HTML uses top-of-em. Offset by ~0.8em so first
    // glyphs sit at the same visual y as the preview's content box.
    ctx.doc.text(line, ctx.style.marginXPt + indent, ctx.y + pt * 0.8);
    ctx.y += lh;
  }
  ctx.y += gapAfter;
}

function writeSectionTitle(ctx: WriteCtx, title: string) {
  ctx.y += ctx.style.sectionGapPt;
  ensureSpace(ctx, ctx.style.sectionTitlePt * ctx.style.lineHeight + 6);
  writeLines(ctx, title.toUpperCase(), {
    pt: ctx.style.sectionTitlePt,
    font: "primary",
    weight: ctx.style.sectionTitleWeight,
    gapAfter: 1,
  });
  if (ctx.style.rule !== "none") {
    ctx.doc.setDrawColor(ctx.style.rule === "light" ? 200 : 160);
    ctx.doc.line(ctx.style.marginXPt, ctx.y, ctx.style.marginXPt + ctx.contentW, ctx.y);
    ctx.y += 4;
  }
}

function sectionTitleOf(sections: ResumeCreatorSectionMeta[], id: string): string {
  return sections.find((s) => s.id === id)?.title ?? id;
}

function renderDraft(doc: Doc, draft: ResumeCreatorDraft) {
  const style = draft.style;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - style.marginXPt * 2;
  const ctx: WriteCtx = {
    doc,
    primaryFont: RESUME_CREATOR_FONTS[style.primaryFont].pdf,
    secondaryFont: RESUME_CREATOR_FONTS[style.secondaryFont].pdf,
    style,
    contentW,
    bottom: pageH - style.marginYPt,
    y: style.marginYPt,
  };

  const { content } = draft;

  for (const section of draft.sections) {
    if (!section.visible) continue;
    switch (section.id) {
      case "contact": {
        const c = content.contact;
        if (c.fullName.trim()) {
          writeLines(ctx, c.fullName.trim(), {
            pt: style.headerPt,
            font: "primary",
            weight: style.headerWeight,
            gapAfter: 2,
          });
        }
        const bits = [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio]
          .map((s) => s.trim())
          .filter(Boolean);
        if (bits.length) {
          writeLines(ctx, bits.join("  ·  "), {
            pt: style.footerPt,
            font: "secondary",
            weight: style.secondaryHeadingWeight,
            gapAfter: style.sectionGapPt * 0.4,
            color: [80, 80, 80],
          });
        }
        if (style.rule !== "none") {
          doc.setDrawColor(style.rule === "light" ? 200 : 180);
          doc.line(style.marginXPt, ctx.y, style.marginXPt + contentW, ctx.y);
          ctx.y += 6;
        }
        break;
      }
      case "summary": {
        if (!content.summary.trim()) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "summary"));
        writeLines(ctx, content.summary.trim(), {
          pt: style.bodyPt,
          font: "secondary",
          weight: style.bodyWeight,
          gapAfter: 2,
        });
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
              pt: style.bodyPt,
              font: "secondary",
              weight: "semibold",
              gapAfter: 1,
            });
          }
          if (e.location.trim()) {
            writeLines(ctx, e.location.trim(), {
              pt: style.footerPt,
              font: "secondary",
              weight: style.secondaryHeadingWeight,
              gapAfter: 1,
              color: [90, 90, 90],
            });
          }
          for (const b of e.bullets) {
            if (!b.trim()) continue;
            writeLines(ctx, `•  ${b.trim()}`, {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              indent: 8,
              gapAfter: 1,
            });
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
            pt: style.bodyPt,
            font: "secondary",
            weight: "semibold",
            gapAfter: 1,
          });
          const meta = [e.location.trim(), e.details.trim()].filter(Boolean).join(" · ");
          if (meta)
            writeLines(ctx, meta, {
              pt: style.footerPt,
              font: "secondary",
              weight: style.secondaryHeadingWeight,
              gapAfter: 2,
              color: [90, 90, 90],
            });
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
        writeLines(ctx, skills.join(" · "), {
          pt: style.bodyPt,
          font: "secondary",
          weight: style.bodyWeight,
          gapAfter: 2,
        });
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
          if (head)
            writeLines(ctx, head, {
              pt: style.bodyPt,
              font: "secondary",
              weight: "semibold",
              gapAfter: 1,
            });
          if (p.description.trim()) {
            writeLines(ctx, p.description.trim(), {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              gapAfter: 1,
            });
          }
          for (const b of p.bullets) {
            if (!b.trim()) continue;
            writeLines(ctx, `•  ${b.trim()}`, {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              indent: 8,
              gapAfter: 1,
            });
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
            {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              gapAfter: 1,
            },
          );
        }
        break;
      }
      default:
        break;
    }
  }
}

export async function resumeCreatorPdfBlob(draft: ResumeCreatorDraft): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "pt",
    format: [A4_WIDTH_PT, A4_HEIGHT_PT],
  }) as unknown as Doc;
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
