/** Client-side plain single-column resume PDF / DOCX from the improver's structured output. */

import type { ImproveResult } from "@/lib/resume-improver-types";

type Revised = ImproveResult["revised"];

type Block =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "entry"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "text"; text: string };

/** One flat list of blocks shared by both renderers so PDF and DOCX can't drift apart. */
export function resumeBlocks(revised: Revised): Block[] {
  const out: Block[] = [];
  revised.header.forEach((text, i) => out.push({ kind: i === 0 ? "name" : "contact", text }));
  for (const s of revised.sections) {
    if (s.heading) out.push({ kind: "heading", text: s.heading });
    for (const ln of s.lines) {
      if (ln.kind === "header") continue;
      if (ln.kind === "bullet") out.push({ kind: "bullet", text: ln.text });
      else if (ln.kind === "entry") out.push({ kind: "entry", text: ln.text });
      else if (ln.kind === "cont" && out.at(-1)?.kind === "bullet") {
        const last = out.at(-1)!;
        last.text = `${last.text} ${ln.text}`;
      } else out.push({ kind: "text", text: ln.text });
    }
  }
  return out;
}

export function safeResumeFilename(name: string, ext: string) {
  const base = name
    .trim()
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "resume"}.${ext}`;
}

// ---- PDF settings -------------------------------------------------------

type PdfSettings = {
  margin: number;
  namePt: number;
  contactPt: number;
  headingPt: number;
  entryPt: number;
  bulletPt: number;
  textPt: number;
  lhMult: number;
  headingGapBefore: number;
  headingGapAfter: number;
  entryGap: number;
  bulletGap: number;
  textGap: number;
};

const BASE: PdfSettings = {
  margin: 46,
  namePt: 16,
  contactPt: 9.5,
  headingPt: 10.5,
  entryPt: 10.5,
  bulletPt: 10,
  textPt: 10,
  lhMult: 1.25,
  headingGapBefore: 7,
  headingGapAfter: 2,
  entryGap: 1,
  bulletGap: 1,
  textGap: 1,
};

function scaleSettings(s: PdfSettings, f: number): PdfSettings {
  // Fonts shrink more aggressively; margins shrink moderately. Floor at readable minimums.
  return {
    margin: Math.max(26, s.margin * f),
    namePt: Math.max(12, s.namePt * f),
    contactPt: Math.max(7.5, s.contactPt * f),
    headingPt: Math.max(8, s.headingPt * f),
    entryPt: Math.max(8, s.entryPt * f),
    bulletPt: Math.max(7.5, s.bulletPt * f),
    textPt: Math.max(7.5, s.textPt * f),
    lhMult: Math.max(1.1, s.lhMult * f),
    headingGapBefore: Math.max(3, s.headingGapBefore * f),
    headingGapAfter: Math.max(1, s.headingGapAfter * f),
    entryGap: Math.max(0, s.entryGap * f),
    bulletGap: Math.max(0, s.bulletGap * f),
    textGap: Math.max(0, s.textGap * f),
  };
}

type Doc = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  setFont: (name: string, style?: string) => void;
  setFontSize: (size: number) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  text: (text: string | string[], x: number, y: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  setDrawColor: (...args: number[]) => void;
  addPage: () => void;
  output: (type: "blob") => Blob;
};

/**
 * Simulate rendering and return the total virtual height (> pageH if it would overflow).
 * Uses splitTextToSize from jsPDF to measure line-wrapped text accurately without writing.
 */
function measurePdf(doc: Doc, blocks: Block[], s: PdfSettings): number {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - s.margin * 2;
  const bottom = pageH - s.margin;
  let y = s.margin;
  let overflow = 0; // extra pages worth of height accumulated

  const addLines = (text: string, pt: number, style: string, indent = 0, gap = 2) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(pt);
    const lh = pt * s.lhMult;
    for (const _ of doc.splitTextToSize(text, contentW - indent)) {
      void _;
      if (y + lh > bottom) {
        overflow += y - s.margin;
        y = s.margin;
      }
      y += lh;
    }
    y += gap;
  };

  for (const b of blocks) {
    if (b.kind === "name") addLines(b.text, s.namePt, "bold", 0, 2);
    else if (b.kind === "contact") addLines(b.text, s.contactPt, "normal", 0, 0);
    else if (b.kind === "heading") {
      y += s.headingGapBefore;
      addLines(b.text.toUpperCase(), s.headingPt, "bold", 0, 0);
      y += s.headingGapAfter;
    } else if (b.kind === "entry") addLines(b.text, s.entryPt, "bold", 0, s.entryGap);
    else if (b.kind === "bullet") addLines(b.text, s.bulletPt, "normal", 14, s.bulletGap);
    else addLines(b.text, s.textPt, "normal", 0, s.textGap);
  }

  return overflow + y;
}

/** Render blocks to doc using given settings. */
function renderPdf(doc: Doc, blocks: Block[], s: PdfSettings) {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - s.margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - s.margin;
  let y = s.margin;

  const write = (text: string, pt: number, style: string, indent = 0, gap = 2) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(pt);
    const lh = pt * s.lhMult;
    for (const line of doc.splitTextToSize(text, contentW - indent)) {
      if (y + lh > bottom) {
        doc.addPage();
        y = s.margin;
      }
      doc.text(line, s.margin + indent, y);
      y += lh;
    }
    y += gap;
  };

  for (const b of blocks) {
    if (b.kind === "name") write(b.text, s.namePt, "bold", 0, 2);
    else if (b.kind === "contact") write(b.text, s.contactPt, "normal", 0, 0);
    else if (b.kind === "heading") {
      y += s.headingGapBefore;
      write(b.text.toUpperCase(), s.headingPt, "bold", 0, 0);
      doc.setDrawColor(180);
      doc.line(s.margin, y - s.headingGapBefore, s.margin + contentW, y - s.headingGapBefore);
      y += s.headingGapAfter;
    } else if (b.kind === "entry") write(b.text, s.entryPt, "bold", 0, s.entryGap);
    else if (b.kind === "bullet") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(s.bulletPt);
      doc.text("•", s.margin + 4, y);
      write(b.text, s.bulletPt, "normal", 14, s.bulletGap);
    } else write(b.text, s.textPt, "normal", 0, s.textGap);
  }
}

export async function resumePdfBlob(revised: Revised): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const blocks = resumeBlocks(revised);

  // First pass: measure with base settings.
  const probe = new jsPDF({ unit: "pt", format: "a4" }) as unknown as Doc;
  const pageH = probe.internal.pageSize.getHeight();
  const measured = measurePdf(probe, blocks, BASE);

  // If content overflows 1 page, scale settings down proportionally.
  // Allow at most 25% reduction (scale ≥ 0.75) to keep it readable.
  let settings = BASE;
  if (measured > pageH - BASE.margin) {
    const usable = pageH - BASE.margin * 2;
    const needed = measured - BASE.margin;
    const factor = Math.max(0.75, usable / needed);
    settings = scaleSettings(BASE, factor);
  }

  // Final render.
  const doc = new jsPDF({ unit: "pt", format: "a4" }) as unknown as Doc;
  renderPdf(doc, blocks, settings);
  return doc.output("blob");
}

// ---- helpers ------------------------------------------------------------

function download(blob: Blob, filename: string) {
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

export async function downloadResumePdf(revised: Revised, name: string) {
  download(await resumePdfBlob(revised), safeResumeFilename(name, "pdf"));
}

export async function downloadResumeDocx(revised: Revised, name: string) {
  const { Document, Packer, Paragraph, TextRun, BorderStyle } = await import("docx");
  const font = "Arial";
  const paragraphs = resumeBlocks(revised).map((b) => {
    switch (b.kind) {
      case "name":
        return new Paragraph({
          children: [new TextRun({ text: b.text, bold: true, size: 32, font })],
        });
      case "contact":
        return new Paragraph({ children: [new TextRun({ text: b.text, size: 19, font })] });
      case "heading":
        return new Paragraph({
          spacing: { before: 140, after: 40 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "B4B4B4", space: 1 } },
          children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 22, font })],
        });
      case "entry":
        return new Paragraph({
          spacing: { before: 60, after: 0 },
          children: [new TextRun({ text: b.text, bold: true, size: 21, font })],
        });
      case "bullet":
        return new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 0 },
          children: [new TextRun({ text: b.text, size: 20, font })],
        });
      default:
        return new Paragraph({
          spacing: { after: 0 },
          children: [new TextRun({ text: b.text, size: 20, font })],
        });
    }
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children: paragraphs }] }));
  download(blob, safeResumeFilename(name, "docx"));
}
