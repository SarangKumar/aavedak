/** Client-side cover letter downloads (PDF / DOCX). */

export type CoverLetterFooter = {
  portfolio?: string;
  email?: string;
  linkedin?: string;
  github?: string;
};

export type CoverLetterDownloadOpts = {
  title: string;
  body: string;
  companyName?: string;
  role?: string;
  footer?: CoverLetterFooter;
};

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

function footerLines(footer?: CoverLetterFooter): string[] {
  if (!footer) return [];
  const lines: string[] = [];
  if (footer.email?.trim()) lines.push(footer.email.trim());
  if (footer.portfolio?.trim()) lines.push(footer.portfolio.trim());
  if (footer.linkedin?.trim()) lines.push(footer.linkedin.trim());
  if (footer.github?.trim()) lines.push(footer.github.trim());
  return lines;
}

export async function downloadCoverLetterPdf(opts: CoverLetterDownloadOpts): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 54;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(opts.title || "Cover letter", maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 18 + 6;

  const meta: string[] = [];
  if (opts.companyName) meta.push(`Company: ${opts.companyName}`);
  if (opts.role) meta.push(`Role: ${opts.role}`);
  if (meta.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    for (const line of meta) {
      doc.text(line, margin, y);
      y += 16;
    }
    doc.setTextColor(0);
    y += 4;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const bodyLines = doc.splitTextToSize(opts.body || "", maxWidth);
  const lineHeight = 15;
  const pageHeight = doc.internal.pageSize.getHeight();
  for (const line of bodyLines) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  const foot = footerLines(opts.footer);
  if (foot.length) {
    y += 18;
    if (y + foot.length * 14 > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    for (const line of foot) {
      if (y + 14 > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 14;
    }
    doc.setTextColor(0);
  }

  doc.save(safeFilename(opts.title, "pdf"));
}

export async function downloadCoverLetterDocx(opts: CoverLetterDownloadOpts): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
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

  const foot = footerLines(opts.footer);
  if (foot.length) {
    paragraphs.push(new Paragraph({ children: [] }));
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: "—", size: 20, color: "888888", font: "Arial" })],
      }),
    );
    for (const line of foot) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 18, color: "555555", font: "Arial" })],
          spacing: { after: 40 },
        }),
      );
    }
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });
  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(blob, safeFilename(opts.title, "docx"));
}
