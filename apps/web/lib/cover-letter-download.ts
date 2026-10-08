/** Client-side cover letter downloads (PDF / DOCX). */

export type CoverLetterFooter = {
  portfolio?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  leetcode?: string;
  /** Absolute or site-relative URL to a resume PDF. */
  resume?: string;
};

export type CoverLetterDownloadOpts = {
  title: string;
  body: string;
  companyName?: string;
  role?: string;
  footer?: CoverLetterFooter;
};

export type FooterRowItem = {
  key: keyof CoverLetterFooter;
  label: string;
  href: string;
};

const FOOTER_ROW_KEYS: Array<{ key: keyof CoverLetterFooter; label: string }> = [
  { key: "email", label: "email" },
  { key: "github", label: "github" },
  { key: "linkedin", label: "linkedin" },
  { key: "portfolio", label: "portfolio" },
  { key: "leetcode", label: "leetcode" },
  { key: "resume", label: "resume" },
];

/** One-row footer items: email shows address; links show short labels. */
export function coverFooterRowItems(footer?: CoverLetterFooter): FooterRowItem[] {
  if (!footer) return [];
  const items: FooterRowItem[] = [];
  for (const { key, label } of FOOTER_ROW_KEYS) {
    const raw = footer[key]?.trim();
    if (!raw) continue;
    if (key === "email") {
      items.push({ key, label: raw, href: `mailto:${raw}` });
    } else {
      items.push({ key, label, href: raw });
    }
  }
  return items;
}

function safeFilename(title: string, ext: string) {
  const base = title
    .trim()
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "cover-letter"}.${ext}`;
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

function footerRowText(footer?: CoverLetterFooter): string {
  return coverFooterRowItems(footer)
    .map((i) => i.label)
    .join(" ⋅ ");
}

/** Layout metrics for a single A4 cover letter (pt). */
export type CoverLetterLayout = {
  exceedsOnePage: boolean;
  endY: number;
  pageHeight: number;
};

type JsPdfDoc = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  setFont: (name: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (...args: number[]) => void;
  setDrawColor: (...args: number[]) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  text: (text: string | string[], x: number, y: number) => void;
  textWithLink: (text: string, x: number, y: number, opts: { url: string }) => void;
  getTextWidth: (text: string) => number;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  save: (filename: string) => void;
};

function layoutCoverLetterOnDoc(doc: JsPdfDoc, opts: CoverLetterDownloadOpts): CoverLetterLayout {
  const margin = 54;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  let y = margin;
  let exceedsOnePage = false;

  const ensure = (need: number) => {
    if (y + need > bottom) exceedsOnePage = true;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const titleLines = doc.splitTextToSize(opts.title || "Cover letter", maxWidth);
  ensure(titleLines.length * 16);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 16 + 6;

  const meta: string[] = [];
  if (opts.companyName) meta.push(`Company: ${opts.companyName}`);
  if (opts.role) meta.push(`Role: ${opts.role}`);
  if (meta.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    for (const line of meta) {
      ensure(14);
      doc.text(line, margin, y);
      y += 14;
    }
    doc.setTextColor(0);
    y += 4;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const bodyLines = doc.splitTextToSize(opts.body || "", maxWidth);
  const lineHeight = 14.5;
  for (const line of bodyLines) {
    ensure(lineHeight);
    if (!exceedsOnePage) doc.text(line, margin, y);
    y += lineHeight;
  }

  const rowItems = coverFooterRowItems(opts.footer);
  if (rowItems.length) {
    const footerBlock = 28; // line + text near page bottom
    const footerY = bottom - 8;
    if (y + 12 > footerY - footerBlock) exceedsOnePage = true;
    if (!exceedsOnePage) {
      doc.setDrawColor(200);
      doc.line(margin, footerY - 14, pageWidth - margin, footerY - 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      let x = margin;
      rowItems.forEach((item, idx) => {
        const sep = idx === 0 ? "" : " ⋅ ";
        if (sep) {
          doc.setTextColor(140);
          doc.text(sep, x, footerY);
          x += doc.getTextWidth(sep);
        }
        doc.setTextColor(40, 80, 160);
        doc.textWithLink(item.label, x, footerY, { url: item.href });
        x += doc.getTextWidth(item.label);
      });
      doc.setTextColor(0);
    }
    y = Math.max(y, footerY);
  }

  return { exceedsOnePage, endY: y, pageHeight };
}

/** True when the rendered cover letter would need more than one A4 page. */
export async function coverLetterExceedsOneA4Page(opts: CoverLetterDownloadOpts): Promise<boolean> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" }) as unknown as JsPdfDoc;
  return layoutCoverLetterOnDoc(doc, opts).exceedsOnePage;
}

export async function downloadCoverLetterPdf(opts: CoverLetterDownloadOpts): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" }) as unknown as JsPdfDoc;
  const layout = layoutCoverLetterOnDoc(doc, opts);
  if (layout.exceedsOnePage) {
    throw new Error("Cover letter must fit on a single A4 page.");
  }
  doc.save(safeFilename(opts.title, "pdf"));
}

export async function downloadCoverLetterDocx(opts: CoverLetterDownloadOpts): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink } =
    await import("docx");
  const paragraphs: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: opts.title || "Cover letter", bold: true, font: "Arial" })],
    }),
  ];
  if (opts.companyName) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Company: ${opts.companyName}`,
            italics: true,
            size: 20,
            font: "Arial",
          }),
        ],
      }),
    );
  }
  if (opts.role) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Role: ${opts.role}`, italics: true, size: 20, font: "Arial" }),
        ],
      }),
    );
  }
  paragraphs.push(new Paragraph({ children: [] }));
  for (const block of (opts.body || "").split(/\n/)) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: block, size: 22, font: "Arial" })],
        spacing: { after: 120 },
      }),
    );
  }

  const rowItems = coverFooterRowItems(opts.footer);
  if (rowItems.length) {
    paragraphs.push(new Paragraph({ children: [] }));
    const children: Array<InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>> =
      [];
    rowItems.forEach((item, idx) => {
      if (idx > 0) {
        children.push(new TextRun({ text: " ⋅ ", size: 18, color: "888888", font: "Arial" }));
      }
      children.push(
        new ExternalHyperlink({
          children: [
            new TextRun({
              text: item.label,
              size: 18,
              color: "2563EB",
              font: "Arial",
              underline: {},
            }),
          ],
          link: item.href,
        }),
      );
    });
    paragraphs.push(new Paragraph({ children }));
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });
  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(blob, safeFilename(opts.title, "docx"));
}

/** @deprecated Prefer coverFooterRowItems — kept for callers that need plain text. */
export function footerRowPlainText(footer?: CoverLetterFooter): string {
  return footerRowText(footer);
}
