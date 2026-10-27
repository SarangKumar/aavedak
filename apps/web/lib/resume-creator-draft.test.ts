import assert from "node:assert/strict";

import {
  applyPreset,
  createEmptyDraft,
  createSampleDraft,
  draftToPlainText,
  markStyleEdited,
  normalizeDraft,
  normalizeStyle,
  reorderSections,
  setSectionVisible,
  suggestedDisplayName,
} from "./resume-creator-draft";
import { STYLE_PRESETS } from "./resume-creator-types";

const empty = createEmptyDraft();
assert.equal(empty.version, 2);
assert.equal(empty.styleSource.kind, "preset");
assert.equal(empty.style.bodyPt, STYLE_PRESETS.classic.style.bodyPt);
assert.ok(empty.sections.some((s) => s.id === "contact" && s.visible));
assert.ok(empty.sections.some((s) => s.id === "certifications" && !s.visible));

const sample = createSampleDraft();
assert.ok(sample.content.contact.fullName.includes("Alex"));
const text = draftToPlainText(sample);
assert.ok(text.includes("Alex Rivera"));
assert.ok(text.includes("EXPERIENCE"));
assert.ok(text.includes("TypeScript"));

const modern = applyPreset(sample, "modern");
assert.equal(modern.styleSource.kind, "preset");
assert.equal(modern.styleSource.kind === "preset" && modern.styleSource.id, "modern");
assert.equal(modern.style.bodyPt, STYLE_PRESETS.modern.style.bodyPt);
assert.equal(modern.style.marginXPt, STYLE_PRESETS.modern.style.marginXPt);
assert.equal(modern.style.sectionGapPt, STYLE_PRESETS.modern.style.sectionGapPt);
assert.equal(modern.style.lineHeight, STYLE_PRESETS.modern.style.lineHeight);

const edited = markStyleEdited({ ...modern, style: { ...modern.style, bodyPt: 11 } });
assert.equal(edited.styleSource.kind, "edited");
assert.equal(edited.style.bodyPt, 11);

const reordered = reorderSections(sample.sections, [
  "summary",
  "contact",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
]);
assert.equal(reordered[0]?.id, "summary");
assert.equal(reordered[1]?.id, "contact");
assert.equal(reordered.length, sample.sections.length);

const hidden = setSectionVisible(sample.sections, "projects", false);
assert.equal(hidden.find((s) => s.id === "projects")?.visible, false);
const withoutProjects = draftToPlainText({ ...sample, sections: hidden });
assert.ok(!withoutProjects.toUpperCase().includes("PROJECTS"));

// v1 migration
const fromV1 = normalizeDraft({
  version: 1,
  templateId: "executive",
  typography: { fontFamily: "times", headerPt: 22, bodyPt: 9 },
  sections: [{ id: "experience", title: "Work", visible: true }],
  content: {
    contact: { fullName: "Sam Example", email: "sam@example.com" },
    summary: "Hello",
    skills: "Go, Rust",
  },
  targetRole: "Backend Engineer",
});
assert.equal(fromV1.version, 2);
assert.equal(fromV1.styleSource.kind, "preset");
assert.ok(fromV1.styleSource.kind === "preset" && fromV1.styleSource.id === "executive");
assert.equal(fromV1.style.primaryFont, "times");
assert.equal(fromV1.style.secondaryFont, "times");
assert.equal(fromV1.style.headerPt, 22);
assert.equal(fromV1.style.bodyPt, 9);
assert.equal(fromV1.style.headerWeight, STYLE_PRESETS.executive.style.headerWeight);
// Preset margins carried over when v1 had none.
assert.equal(fromV1.style.marginXPt, STYLE_PRESETS.executive.style.marginXPt);
assert.equal(fromV1.content.contact.fullName, "Sam Example");
assert.equal(fromV1.targetRole, "Backend Engineer");
assert.ok(fromV1.sections.some((s) => s.id === "contact"));
assert.equal(fromV1.sections.find((s) => s.id === "experience")?.title, "Work");

assert.equal(suggestedDisplayName(fromV1).startsWith("Sam Example"), true);
assert.ok(suggestedDisplayName(fromV1).includes("Backend Engineer"));

assert.deepEqual(normalizeDraft(null).styleSource, { kind: "preset", id: "classic" });
assert.equal(normalizeStyle({ bodyPt: 99 }).bodyPt, 14); // clamped
assert.equal(normalizeStyle({ lineHeight: 0.5 }).lineHeight, 1.0);
assert.equal(normalizeStyle({ primaryFont: "verdana" }).primaryFont, "verdana");
assert.equal(normalizeStyle({ headerWeight: "semibold" }).headerWeight, "semibold");
assert.equal(normalizeStyle({ marginYPt: -5 }).marginYPt, 0);
assert.equal(normalizeStyle({ pageFormat: "letter" }).pageFormat, "letter");
assert.equal(normalizeStyle({ skillsLayout: "columns", skillsColumns: 5 }).skillsColumns, 5);
assert.equal(normalizeStyle({ educationShowBy: "institution" }).educationShowBy, "institution");
assert.equal(normalizeStyle({ dateFormat: "numeric" }).dateFormat, "numeric");
assert.equal(normalizeStyle({ headerAlign: "center" }).headerAlign, "center");

// Section reorder must drive ATS/plain-text (and preview/PDF) order.
const reorderedSample = {
  ...sample,
  sections: reorderSections(sample.sections, [
    "skills",
    "experience",
    "education",
    "summary",
    "contact",
    "projects",
    "certifications",
  ]),
};
const reorderedText = draftToPlainText(reorderedSample);
const skillsAt = reorderedText.indexOf("SKILLS");
const experienceAt = reorderedText.indexOf("EXPERIENCE");
assert.ok(skillsAt >= 0 && experienceAt >= 0);
assert.ok(skillsAt < experienceAt, "reordered sections should appear in new order in plain text");

console.log("resume-creator-draft tests: ok");
