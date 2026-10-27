/** Client-side PDF download — same pt metrics as the live HTML preview. */

import { draftToPlainText, suggestedDisplayName } from "@/lib/resume-creator-draft";
import {
  RESUME_CREATOR_FONTS,
  RESUME_FONT_WEIGHTS,
  pageSizePt,
  resumePageInsetsPt,
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
  text: (text: string | string[], x: number, y: number, opts?: { align?: string }) => void;
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
  left: number;
  /** Content starts here (top margin + header/footer inset). */
  top: number;
  /** Last y content may occupy; bottom margin starts below this. */
  bottom: number;
  y: number;
};

function pdfWeight(w: ResumeFontWeight): "normal" | "bold" {
  return RESUME_FONT_WEIGHTS[w].pdf;
}

function ensureSpace(ctx: WriteCtx, need: number) {
  // Keep drawing inside the content box: never into the Layout bottom margin.
  if (ctx.y + need > ctx.bottom + 1e-6) {
    ctx.doc.addPage();
    ctx.y = ctx.top;
  }
}

function formatDateToken(raw: string, format: ResumeCreatorStyle["dateFormat"]): string {
  const s = raw.trim();
  if (!s) return "";
  if (/present|current|now/i.test(s)) return s;
  const m = s.match(/^(\d{4})[-/.](\d{1,2})$/) || s.match(/^(\d{1,2})[-/.](\d{4})$/);
  let year = "";
  let month = 0;
  if (m) {
    if (m[1].length === 4) {
      year = m[1];
      month = Number(m[2]);
    } else {
      month = Number(m[1]);
      year = m[2];
    }
  } else {
    const yOnly = s.match(/^(19|20)\d{2}$/);
    if (yOnly) return s;
    const named = s.match(
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[.\s-]+(\d{4})$/i,
    );
    if (named) {
      const map: Record<string, number> = {
        jan: 1,
        feb: 2,
        mar: 3,
        apr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12,
      };
      month = map[named[1].slice(0, 3).toLowerCase()] ?? 0;
      year = named[2];
    } else {
      return s;
    }
  }
  if (!year || month < 1 || month > 12) return s;
  const short = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const long = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (format === "numeric") return `${String(month).padStart(2, "0")}.${year}`;
  if (format === "long") return `${long[month - 1]} ${year}`;
  return `${short[month - 1]} ${year}`;
}

function formatRange(start: string, end: string, format: ResumeCreatorStyle["dateFormat"]): string {
  const a = formatDateToken(start, format);
  const b = formatDateToken(end, format);
  return [a, b].filter(Boolean).join(" – ");
}

function writeLines(
  ctx: WriteCtx,
  text: string,
  opts: {
    pt: number;
    font?: "primary" | "secondary";
    weight?: ResumeFontWeight;
    italic?: boolean;
    indent?: number;
    gapAfter?: number;
    color?: number[];
    align?: "left" | "center" | "right";
    maxWidth?: number;
  },
) {
  const pt = opts.pt;
  const face = opts.font === "primary" ? ctx.primaryFont : ctx.secondaryFont;
  const bold = opts.weight ? pdfWeight(opts.weight) === "bold" : false;
  const fontStyle = opts.italic ? (bold ? "bolditalic" : "italic") : bold ? "bold" : "normal";
  const indent = opts.indent ?? 0;
  const gapAfter = opts.gapAfter ?? 2;
  const maxW = opts.maxWidth ?? ctx.contentW - indent;
  ctx.doc.setFont(face, fontStyle);
  ctx.doc.setFontSize(pt);
  if (opts.color) ctx.doc.setTextColor(...opts.color);
  else ctx.doc.setTextColor(0, 0, 0);
  const lh = pt * ctx.style.lineHeight;
  const align = opts.align ?? "left";
  for (const line of ctx.doc.splitTextToSize(text, maxW)) {
    // Line box must fit above the bottom Layout inset (marginY + header/footer).
    ensureSpace(ctx, lh);
    let x = ctx.left + indent;
    if (align === "center") x = ctx.left + ctx.contentW / 2;
    else if (align === "right") x = ctx.left + ctx.contentW;
    // jsPDF y is baseline; keep baseline at or above content bottom.
    const baseline = ctx.y + pt * 0.8;
    if (baseline > ctx.bottom + 1e-6) {
      ctx.doc.addPage();
      ctx.y = ctx.top;
    }
    ctx.doc.text(line, x, ctx.y + pt * 0.8, { align });
    ctx.y += lh;
  }
  ctx.y += gapAfter;
}

function writeSectionTitle(ctx: WriteCtx, title: string) {
  const titleNeed = ctx.style.sectionTitlePt * ctx.style.lineHeight + 6;
  const gap = ctx.style.sectionGapPt;
  const atTop = ctx.y <= ctx.top + 0.5;
  ensureSpace(ctx, (atTop ? 0 : gap) + titleNeed);
  // After a page break, start at the top margin — skip the section gap.
  if (ctx.y > ctx.top + 0.5) ctx.y += gap;
  writeLines(ctx, title.toUpperCase(), {
    pt: ctx.style.sectionTitlePt,
    font: "primary",
    weight: ctx.style.sectionTitleWeight,
    gapAfter: 1,
  });
  if (ctx.style.rule !== "none") {
    ensureSpace(ctx, ctx.style.titleContentGapPt + 2);
    ctx.doc.setDrawColor(ctx.style.rule === "light" ? 200 : 160);
    ctx.doc.line(ctx.left, ctx.y, ctx.left + ctx.contentW, ctx.y);
    ctx.y += ctx.style.titleContentGapPt;
  } else {
    ctx.y += ctx.style.titleContentGapPt;
  }
}

function pdfFontStyle(weight: ResumeFontWeight | undefined, italic?: boolean): string {
  const bold = weight ? pdfWeight(weight) === "bold" : false;
  if (italic) return bold ? "bolditalic" : "italic";
  return bold ? "bold" : "normal";
}

function writeSplitRow(
  ctx: WriteCtx,
  left: string,
  right: string,
  opts?: {
    leftWeight?: ResumeFontWeight;
    rightWeight?: ResumeFontWeight;
    leftItalic?: boolean;
    rightItalic?: boolean;
    gapAfter?: number;
  },
) {
  const pt = ctx.style.bodyPt;
  const lh = pt * ctx.style.lineHeight;
  ensureSpace(ctx, lh + 2);
  const leftWeight = opts?.leftWeight ?? "semibold";
  const rightWeight = opts?.rightWeight ?? "regular";
  const gapAfter = opts?.gapAfter ?? 1;
  const leftStyle = pdfFontStyle(leftWeight, opts?.leftItalic);
  const rightStyle = pdfFontStyle(rightWeight, opts?.rightItalic);

  if (!right.trim()) {
    writeLines(ctx, left, {
      pt,
      font: "secondary",
      weight: leftWeight,
      italic: opts?.leftItalic,
      gapAfter,
      color: [0, 0, 0],
    });
    return;
  }

  ctx.doc.setFontSize(pt);
  const approxRightW = Math.min(ctx.contentW * 0.42, Math.max(24, right.trim().length * pt * 0.45));
  const titleMax = Math.max(40, ctx.contentW - approxRightW - 8);
  ctx.doc.setFont(ctx.secondaryFont, leftStyle);
  ctx.doc.setTextColor(0, 0, 0);
  const titleLines = ctx.doc.splitTextToSize(left || " ", titleMax);
  const first = titleLines[0] ?? left;
  if (ctx.y + pt * 0.8 > ctx.bottom + 1e-6) {
    ctx.doc.addPage();
    ctx.y = ctx.top;
  }
  ctx.doc.text(first, ctx.left, ctx.y + pt * 0.8);
  ctx.doc.setFont(ctx.secondaryFont, rightStyle);
  ctx.doc.setTextColor(0, 0, 0);
  ctx.doc.text(right.trim(), ctx.left + ctx.contentW, ctx.y + pt * 0.8, { align: "right" });
  ctx.y += lh;
  for (const extra of titleLines.slice(1)) {
    ensureSpace(ctx, lh);
    if (ctx.y + pt * 0.8 > ctx.bottom + 1e-6) {
      ctx.doc.addPage();
      ctx.y = ctx.top;
    }
    ctx.doc.setFont(ctx.secondaryFont, leftStyle);
    ctx.doc.setTextColor(0, 0, 0);
    ctx.doc.text(extra, ctx.left, ctx.y + pt * 0.8);
    ctx.y += lh;
  }
  ctx.y += gapAfter;
}

function sectionTitleOf(sections: ResumeCreatorSectionMeta[], id: string): string {
  return sections.find((s) => s.id === id)?.title ?? id;
}

type SkillRow =
  { kind: "plain"; items: string[] } | { kind: "category"; category: string; items: string[] };

function parseSkills(raw: string): SkillRow[] {
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const categorized = lines.some((l) => /^[^:]{1,40}:\s*.+/.test(l));
  if (!categorized) {
    const items = raw
      .split(/[\n,•]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length ? [{ kind: "plain", items }] : [];
  }
  const rows: SkillRow[] = [];
  for (const line of lines) {
    const m = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (m) {
      const items = m[2]
        .split(/[,•]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      rows.push({ kind: "category", category: m[1].trim(), items });
    } else {
      const items = line
        .split(/[,•]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length) rows.push({ kind: "plain", items });
    }
  }
  return rows;
}

function renderDraft(doc: Doc, draft: ResumeCreatorDraft) {
  const style = draft.style;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const insets = resumePageInsetsPt(style);
  const left = insets.left;
  const contentW = pageW - insets.left - insets.right;
  const top = insets.top;
  const bottom = pageH - insets.bottom;
  const ctx: WriteCtx = {
    doc,
    primaryFont: RESUME_CREATOR_FONTS[style.primaryFont].pdf,
    secondaryFont: RESUME_CREATOR_FONTS[style.secondaryFont].pdf,
    style,
    contentW,
    left,
    top,
    bottom,
    y: top,
  };

  const { content } = draft;
  const headerAlign = style.headerAlign;

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
            align: headerAlign,
          });
        }
        const bits: string[] = [];
        const push = (link: { label: string; value: string }) => {
          const value = link.value.trim();
          if (!value) return;
          bits.push(link.label.trim() || value);
        };
        push(c.email);
        push(c.phone);
        if (c.location.trim()) bits.push(c.location.trim());
        push(c.linkedin);
        push(c.github);
        push(c.portfolio);
        if (bits.length) {
          writeLines(ctx, bits.join(" | "), {
            pt: style.footerPt,
            font: "secondary",
            weight: style.secondaryHeadingWeight,
            gapAfter: style.sectionGapPt * 0.4,
            color: [0, 0, 0],
            align: headerAlign,
          });
        }
        if (style.rule !== "none") {
          ensureSpace(ctx, 8);
          doc.setDrawColor(style.rule === "light" ? 200 : 180);
          doc.line(left, ctx.y, left + contentW, ctx.y);
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
          color: [0, 0, 0],
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
          writeSplitRow(ctx, e.company.trim() || "Company", e.location.trim(), {
            leftWeight: "bold",
            rightItalic: true,
            gapAfter: style.insideBlockGapPt,
          });
          const dateText = formatRange(e.start, e.end, style.dateFormat);
          if (e.title.trim() || dateText) {
            writeSplitRow(ctx, e.title.trim(), dateText, {
              leftItalic: true,
              leftWeight: "regular",
              rightWeight: "regular",
              gapAfter: style.insideBlockGapPt,
            });
          }
          for (const b of e.bullets) {
            if (!b.trim()) continue;
            writeLines(ctx, `•  ${b.trim()}`, {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              indent: 8,
              gapAfter: style.insideBlockGapPt,
              color: [0, 0, 0],
            });
          }
          ctx.y += style.contentBlockGapPt;
        }
        break;
      }
      case "education": {
        const entries = content.education.filter((e) => e.school.trim() || e.degree.trim());
        if (!entries.length) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "education"));
        for (const e of entries) {
          const primary =
            style.educationShowBy === "degree"
              ? e.degree.trim() || e.school.trim()
              : e.school.trim() || e.degree.trim();
          const secondary = style.educationShowBy === "degree" ? e.school.trim() : e.degree.trim();
          const dateText = formatRange(e.start, e.end, style.dateFormat);
          writeSplitRow(ctx, primary || "School", e.location.trim(), {
            leftWeight: "bold",
            rightItalic: true,
            gapAfter: style.insideBlockGapPt,
          });
          if (secondary || dateText) {
            writeSplitRow(ctx, secondary, dateText, {
              leftItalic: true,
              leftWeight: "regular",
              rightWeight: "regular",
              gapAfter: style.insideBlockGapPt,
            });
          }
          if (e.details.trim()) {
            writeLines(ctx, e.details.trim(), {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              gapAfter: style.contentBlockGapPt,
              color: [0, 0, 0],
            });
          } else {
            ctx.y += style.contentBlockGapPt;
          }
        }
        break;
      }
      case "skills": {
        const rows = parseSkills(content.skills);
        if (!rows.length) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "skills"));
        if (style.skillsCategoryMode === "categories" && rows.some((r) => r.kind === "category")) {
          for (const row of rows) {
            if (row.kind === "category") {
              writeLines(ctx, `${row.category}: ${row.items.join(", ")}`, {
                pt: style.bodyPt,
                font: "secondary",
                weight: style.bodyWeight,
                gapAfter: style.insideBlockGapPt,
              });
            } else {
              writeLines(ctx, row.items.join(", "), {
                pt: style.bodyPt,
                font: "secondary",
                weight: style.bodyWeight,
                gapAfter: style.insideBlockGapPt,
              });
            }
          }
        } else if (style.skillsLayout === "columns") {
          const items = rows.flatMap((r) =>
            r.kind === "category" ? [`${r.category}: ${r.items.join(", ")}`] : r.items,
          );
          const cols = Math.max(2, Math.min(6, style.skillsColumns));
          const colW = (contentW - (cols - 1) * 8) / cols;
          const lh = style.bodyPt * style.lineHeight;
          let col = 0;
          let rowY = ctx.y;
          let maxY = ctx.y;
          for (const item of items) {
            ctx.doc.setFont(ctx.secondaryFont, pdfWeight(style.bodyWeight));
            ctx.doc.setFontSize(style.bodyPt);
            const lines = ctx.doc.splitTextToSize(item, colW);
            const blockH = Math.max(lh, lines.length * lh);
            const yBefore = ctx.y;
            ensureSpace(ctx, blockH);
            // Page break: restart the row at the top margin.
            if (ctx.y < yBefore - 0.5) {
              col = 0;
              rowY = ctx.y;
              maxY = ctx.y;
            }
            if (col === 0) rowY = ctx.y;
            const x = left + col * (colW + 8);
            ctx.doc.setFont(ctx.secondaryFont, pdfWeight(style.bodyWeight));
            ctx.doc.setFontSize(style.bodyPt);
            ctx.doc.setTextColor(20, 20, 20);
            let y = rowY;
            for (const line of lines) {
              if (y + lh > ctx.bottom + 1e-6) {
                ctx.doc.addPage();
                ctx.y = ctx.top;
                col = 0;
                rowY = ctx.y;
                maxY = ctx.y;
                y = rowY;
              }
              ctx.doc.text(line, x, y + style.bodyPt * 0.8);
              y += lh;
            }
            maxY = Math.max(maxY, y);
            col += 1;
            if (col >= cols) {
              col = 0;
              ctx.y = maxY + style.insideBlockGapPt;
              maxY = ctx.y;
            }
          }
          if (col !== 0) ctx.y = maxY + style.insideBlockGapPt;
        } else {
          const text = rows
            .map((r) =>
              r.kind === "category" ? `${r.category}: ${r.items.join(", ")}` : r.items.join(" · "),
            )
            .join(" · ");
          writeLines(ctx, text, {
            pt: style.bodyPt,
            font: "secondary",
            weight: style.bodyWeight,
            gapAfter: 2,
          });
        }
        break;
      }
      case "projects": {
        const entries = content.projects.filter(
          (p) => p.name.trim() || p.description.trim() || p.bullets.some((b) => b.trim()),
        );
        if (!entries.length) break;
        writeSectionTitle(ctx, sectionTitleOf(draft.sections, "projects"));
        for (const p of entries) {
          const title = p.name.trim() || p.link.trim();
          if (title) {
            writeLines(ctx, title, {
              pt: style.bodyPt,
              font: "secondary",
              weight: "semibold",
              gapAfter: style.insideBlockGapPt,
              color: [0, 0, 0],
            });
          }
          if (p.description.trim()) {
            writeLines(ctx, p.description.trim(), {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              gapAfter: style.insideBlockGapPt,
              color: [0, 0, 0],
            });
          }
          for (const b of p.bullets) {
            if (!b.trim()) continue;
            writeLines(ctx, `•  ${b.trim()}`, {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              indent: 8,
              gapAfter: style.insideBlockGapPt,
            });
          }
          ctx.y += style.contentBlockGapPt;
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
              gapAfter: style.insideBlockGapPt,
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

/** Probe text baselines for tests — same pagination as download. */
export type ResumePdfTextProbe = {
  page: number;
  /** Cursor y (top of line box) before drawing. */
  y: number;
  /** jsPDF baseline y used for text(). */
  baseline: number;
  text: string;
};

export type ResumePdfLayoutProbe = {
  pageCount: number;
  pageHeight: number;
  top: number;
  bottom: number;
  texts: ResumePdfTextProbe[];
};

/**
 * Render with a recording doc to assert Layout top/bottom insets are honored
 * on every page (no baseline past `bottom`, new pages start at `top`).
 */
export function probeResumeCreatorPdfLayout(draft: ResumeCreatorDraft): ResumePdfLayoutProbe {
  const { width, height } = pageSizePt(draft.style.pageFormat);
  const insets = resumePageInsetsPt(draft.style);
  const top = insets.top;
  const bottom = height - insets.bottom;
  let page = 1;
  const texts: ResumePdfTextProbe[] = [];

  const doc: Doc = {
    internal: {
      pageSize: {
        getWidth: () => width,
        getHeight: () => height,
      },
    },
    setFont: () => {},
    setFontSize: () => {},
    setDrawColor: () => {},
    setTextColor: () => {},
    splitTextToSize: (text: string, maxWidth: number) => {
      // Rough wrap so multi-line blocks exercise pagination (avg ~0.5em per char).
      const avg = Math.max(4, (draft.style.bodyPt || 10) * 0.5);
      const cols = Math.max(8, Math.floor(maxWidth / avg));
      const words = text.split(/(\s+)/);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        if ((cur + w).length > cols && cur.trim()) {
          lines.push(cur);
          cur = w.trimStart();
        } else {
          cur += w;
        }
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [text];
    },
    text: (text: string | string[], _x: number, y: number) => {
      const lines = Array.isArray(text) ? text : [text];
      for (const line of lines) {
        // jsPDF `text` y is the baseline.
        texts.push({ page, y, baseline: y, text: line });
      }
    },
    line: () => {},
    addPage: () => {
      page += 1;
    },
    output: () => new Blob(),
  };

  renderDraft(doc, draft);
  return {
    pageCount: page,
    pageHeight: height,
    top,
    bottom,
    texts,
  };
}

export async function resumeCreatorPdfBlob(draft: ResumeCreatorDraft): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { width, height } = pageSizePt(draft.style.pageFormat);
  const doc = new jsPDF({
    unit: "pt",
    format: [width, height],
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
