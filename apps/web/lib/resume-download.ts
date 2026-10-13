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

export async function resumePdfBlob(revised: Revised): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" }) as unknown as Doc;
  const margin = 48;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;
  const write = (text: string, size: number, style: string, indent = 0, gap = 2) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lh = size * 1.3;
    for (const line of doc.splitTextToSize(text, width - indent)) {
      if (y + lh > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin + indent, y);
      y += lh;
    }
    y += gap;
  };
  for (const b of resumeBlocks(revised)) {
    if (b.kind === "name") write(b.text, 16, "bold", 0, 2);
    else if (b.kind === "contact") write(b.text, 9.5, "normal", 0, 0);
    else if (b.kind === "heading") {
      y += 8;
      write(b.text.toUpperCase(), 11, "bold", 0, 0);
      doc.setDrawColor(180);
      doc.line(margin, y - 8, margin + width, y - 8);
      y += 2;
    } else if (b.kind === "entry") write(b.text, 10.5, "bold", 0, 1);
    else if (b.kind === "bullet") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("•", margin + 4, y);
      write(b.text, 10, "normal", 14, 1);
    } else write(b.text, 10, "normal", 0, 1);
  }
  return doc.output("blob");
}

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
          spacing: { before: 200, after: 60 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "B4B4B4", space: 1 } },
          children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 22, font })],
        });
      case "entry":
        return new Paragraph({
          spacing: { before: 80 },
          children: [new TextRun({ text: b.text, bold: true, size: 21, font })],
        });
      case "bullet":
        return new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: b.text, size: 20, font })],
        });
      default:
        return new Paragraph({ children: [new TextRun({ text: b.text, size: 20, font })] });
    }
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children: paragraphs }] }));
  download(blob, safeResumeFilename(name, "docx"));
}
