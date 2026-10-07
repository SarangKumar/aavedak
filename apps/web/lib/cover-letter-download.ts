/** Client-side cover letter downloads (PDF / DOCX). */

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

export async function downloadCoverLetterPdf(opts: {
  title: string;
  body: string;
  companyName?: string;
}): Promise<void> {
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

  if (opts.companyName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(`Company: ${opts.companyName}`, margin, y);
    doc.setTextColor(0);
    y += 20;
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

  doc.save(safeFilename(opts.title, "pdf"));
}

export async function downloadCoverLetterDocx(opts: {
  title: string;
  body: string;
  companyName?: string;
}): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const paragraphs: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: opts.title || "Cover letter", bold: true })],
    }),
  ];
  if (opts.companyName) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `Company: ${opts.companyName}`, italics: true, size: 20 })],
      }),
    );
  }
  paragraphs.push(new Paragraph({ children: [] }));
  for (const block of (opts.body || "").split(/\n/)) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: block, size: 22 })],
        spacing: { after: 120 },
      }),
    );
  }
  const doc = new Document({
    sections: [{ children: paragraphs }],
  });
  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(blob, safeFilename(opts.title, "docx"));
}
