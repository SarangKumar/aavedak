/**
 * Pagination / Layout top-bottom margin contract for Create resume.
 * Run:
 *   node --experimental-strip-types --import ./lib/register-alias.mjs ./lib/resume-creator-pagination.test.ts
 * (cwd: apps/web)
 */

import assert from "node:assert/strict";

import { createSampleDraft } from "./resume-creator-draft";
import { probeResumeCreatorPdfLayout } from "./resume-creator-pdf";
import { pageSizePt, resumeContentHeightPt, resumePageInsetsPt } from "./resume-creator-types";

const insets = resumePageInsetsPt({ marginXPt: 40, marginYPt: 72, headerFooterPt: 12 });
assert.equal(insets.top, 84);
assert.equal(insets.bottom, 84);
assert.equal(insets.left, 40);

const pageH = pageSizePt("a4").height;
const contentH = resumeContentHeightPt({ marginXPt: 40, marginYPt: 72, headerFooterPt: 12 }, pageH);
assert.equal(contentH, pageH - 84 * 2);

const draft = createSampleDraft();
draft.style = {
  ...draft.style,
  pageFormat: "a4",
  marginYPt: 72,
  headerFooterPt: 0,
  marginXPt: 40,
  bodyPt: 11,
  lineHeight: 1.25,
};

// Inflate experience so the PDF must paginate past page 1.
const longBullet =
  "Delivered measurable outcomes across platform reliability, developer experience, and customer-facing quality with clear ownership and documented trade-offs. ";
for (const entry of draft.content.experience) {
  entry.bullets = Array.from({ length: 14 }, (_, i) => `${longBullet} Item ${i + 1}.`);
}
draft.content.summary = Array.from({ length: 20 }, () => longBullet).join("");

const probe = probeResumeCreatorPdfLayout(draft);
assert.ok(probe.pageCount >= 2, `expected multi-page PDF, got ${probe.pageCount}`);
assert.equal(probe.top, 72);
assert.equal(probe.bottom, pageH - 72);

for (const t of probe.texts) {
  assert.ok(
    t.baseline <= probe.bottom + 0.05,
    `baseline ${t.baseline} past bottom ${probe.bottom} on page ${t.page}: ${t.text.slice(0, 40)}`,
  );
  assert.ok(
    t.baseline >= probe.top - 0.05,
    `baseline ${t.baseline} above top ${probe.top} on page ${t.page}`,
  );
}

const byPage = new Map<number, number[]>();
for (const t of probe.texts) {
  const arr = byPage.get(t.page) ?? [];
  arr.push(t.baseline);
  byPage.set(t.page, arr);
}
for (const [page, bases] of byPage) {
  const max = Math.max(...bases);
  const min = Math.min(...bases);
  assert.ok(
    max <= probe.bottom + 0.05,
    `page ${page} max baseline ${max} > bottom ${probe.bottom}`,
  );
  assert.ok(min >= probe.top - 1, `page ${page} min baseline ${min} < top ${probe.top}`);
  // Bottom Layout inset must remain empty (≈ marginY below last ink).
  const gap = probe.pageHeight - max;
  assert.ok(
    gap >= probe.top - 1,
    `page ${page} bottom gap ${gap.toFixed(1)}pt < expected margin ~${probe.top}pt`,
  );
}

console.log(
  `ok: resume-creator-pagination (${probe.pageCount} pages, ${probe.texts.length} text runs, marginY=72)`,
);
