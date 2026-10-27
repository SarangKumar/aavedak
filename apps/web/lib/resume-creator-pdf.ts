/** Client-side PDF download — same pt metrics as the live HTML preview. */

import { draftToPlainText, suggestedDisplayName } from "@/lib/resume-creator-draft";
import {
  RESUME_CREATOR_FONTS,
  RESUME_FONT_WEIGHTS,
  pageSizePt,
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
  bottom: number;
  y: number;
};

function pdfWeight(w: ResumeFontWeight): "normal" | "bold" {
  return RESUME_FONT_WEIGHTS[w].pdf;
}

function ensureSpace(ctx: WriteCtx, need: number) {
  if (ctx.y + need > ctx.bottom) {
    ctx.doc.addPage();
    ctx.y = ctx.style.marginYPt + ctx.style.headerFooterPt;
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
    indent?: number;
    gapAfter?: number;
    color?: number[];
    align?: "left" | "center" | "right";
    maxWidth?: number;
  },
) {
  const pt = opts.pt;
  const face = opts.font === "primary" ? ctx.primaryFont : ctx.secondaryFont;
  const fontStyle = opts.weight ? pdfWeight(opts.weight) : "normal";
  const indent = opts.indent ?? 0;
  const gapAfter = opts.gapAfter ?? 2;
  const maxW = opts.maxWidth ?? ctx.contentW - indent;
  ctx.doc.setFont(face, fontStyle);
  ctx.doc.setFontSize(pt);
  if (opts.color) ctx.doc.setTextColor(...opts.color);
  else ctx.doc.setTextColor(20, 20, 20);
  const lh = pt * ctx.style.lineHeight;
  const align = opts.align ?? "left";
  for (const line of ctx.doc.splitTextToSize(text, maxW)) {
    ensureSpace(ctx, lh);
    let x = ctx.left + indent;
    if (align === "center") x = ctx.left + ctx.contentW / 2;
    else if (align === "right") x = ctx.left + ctx.contentW;
    ctx.doc.text(line, x, ctx.y + pt * 0.8, { align });
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
    ctx.doc.line(ctx.left, ctx.y, ctx.left + ctx.contentW, ctx.y);
    ctx.y += ctx.style.titleContentGapPt;
  } else {
    ctx.y += ctx.style.titleContentGapPt;
  }
}

function writeTitleDateRow(
  ctx: WriteCtx,
  title: string,
  dateText: string,
  titleWeight: ResumeFontWeight = "semibold",
) {
  const pt = ctx.style.bodyPt;
  const lh = pt * ctx.style.lineHeight;
  ensureSpace(ctx, lh + 2);
  ctx.doc.setFont(ctx.secondaryFont, pdfWeight(titleWeight));
  ctx.doc.setFontSize(pt);
  ctx.doc.setTextColor(20, 20, 20);

  if (!dateText) {
    writeLines(ctx, title, {
      pt,
      font: "secondary",
      weight: titleWeight,
      gapAfter: 1,
    });
    return;
  }

  ctx.doc.setFont(ctx.secondaryFont, "normal");
  const dateLines = ctx.doc.splitTextToSize(dateText, ctx.contentW * 0.45);
  const dateShown = dateLines[0] ?? dateText;
  const approxDateW = Math.min(ctx.contentW * 0.4, dateShown.length * pt * 0.45);
  const titleMax = Math.max(40, ctx.contentW - approxDateW - 8);
  ctx.doc.setFont(ctx.secondaryFont, pdfWeight(titleWeight));
  const titleLines = ctx.doc.splitTextToSize(title, titleMax);
  const first = titleLines[0] ?? title;

  if (ctx.style.dateAlign === "left") {
    ctx.doc.setFont(ctx.secondaryFont, "normal");
    ctx.doc.setTextColor(90, 90, 90);
    ctx.doc.text(dateShown, ctx.left, ctx.y + pt * 0.8);
    ctx.doc.setFont(ctx.secondaryFont, pdfWeight(titleWeight));
    ctx.doc.setTextColor(20, 20, 20);
    ctx.doc.text(first, ctx.left + approxDateW + 8, ctx.y + pt * 0.8);
  } else {
    ctx.doc.text(first, ctx.left, ctx.y + pt * 0.8);
    ctx.doc.setFont(ctx.secondaryFont, "normal");
    ctx.doc.setTextColor(90, 90, 90);
    ctx.doc.text(dateShown, ctx.left + ctx.contentW, ctx.y + pt * 0.8, { align: "right" });
    ctx.doc.setTextColor(20, 20, 20);
  }
  ctx.y += lh;
  for (const extra of titleLines.slice(1)) {
    ensureSpace(ctx, lh);
    ctx.doc.setFont(ctx.secondaryFont, pdfWeight(titleWeight));
    ctx.doc.text(extra, ctx.left, ctx.y + pt * 0.8);
    ctx.y += lh;
  }
  ctx.y += 1;
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
  const left = style.marginXPt;
  const contentW = pageW - style.marginXPt * 2;
  const top = style.marginYPt + style.headerFooterPt;
  const bottom = pageH - style.marginYPt - style.headerFooterPt;
  const ctx: WriteCtx = {
    doc,
    primaryFont: RESUME_CREATOR_FONTS[style.primaryFont].pdf,
    secondaryFont: RESUME_CREATOR_FONTS[style.secondaryFont].pdf,
    style,
    contentW,
    left,
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
          writeLines(ctx, bits.join("  ·  "), {
            pt: style.footerPt,
            font: "secondary",
            weight: style.secondaryHeadingWeight,
            gapAfter: style.sectionGapPt * 0.4,
            color: [80, 80, 80],
            align: headerAlign,
          });
        }
        if (style.rule !== "none") {
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
          const company = e.company.trim() || "Company";
          const dateText = formatRange(e.start, e.end, style.dateFormat);
          writeTitleDateRow(ctx, company, dateText);
          if (e.title.trim()) {
            writeLines(ctx, e.title.trim(), {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              gapAfter: style.insideBlockGapPt,
            });
          }
          if (e.location.trim()) {
            writeLines(ctx, e.location.trim(), {
              pt: style.footerPt,
              font: "secondary",
              weight: style.secondaryHeadingWeight,
              gapAfter: 1,
              color: [90, 90, 90],
              align: style.locationAlign === "right" ? "right" : "left",
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
          writeTitleDateRow(ctx, primary || " ", dateText);
          if (secondary) {
            writeLines(ctx, secondary, {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              gapAfter: style.insideBlockGapPt,
            });
          }
          const meta = [e.location.trim(), e.details.trim()].filter(Boolean).join(" · ");
          if (meta) {
            writeLines(ctx, meta, {
              pt: style.footerPt,
              font: "secondary",
              weight: style.secondaryHeadingWeight,
              gapAfter: style.contentBlockGapPt,
              color: [90, 90, 90],
              align: style.locationAlign === "right" ? "right" : "left",
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
            ensureSpace(ctx, lh);
            if (col === 0) rowY = ctx.y;
            const x = left + col * (colW + 8);
            ctx.doc.setFont(ctx.secondaryFont, pdfWeight(style.bodyWeight));
            ctx.doc.setFontSize(style.bodyPt);
            ctx.doc.setTextColor(20, 20, 20);
            const lines = ctx.doc.splitTextToSize(item, colW);
            let y = rowY;
            for (const line of lines) {
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
          const head = [p.name.trim(), p.link.trim()].filter(Boolean).join(" — ");
          if (head) {
            writeLines(ctx, head, {
              pt: style.bodyPt,
              font: "secondary",
              weight: "semibold",
              gapAfter: style.insideBlockGapPt,
            });
          }
          if (p.description.trim()) {
            writeLines(ctx, p.description.trim(), {
              pt: style.bodyPt,
              font: "secondary",
              weight: style.bodyWeight,
              gapAfter: style.insideBlockGapPt,
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
