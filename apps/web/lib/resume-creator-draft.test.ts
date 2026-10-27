import assert from "node:assert/strict";

import {
  createEmptyDraft,
  createSampleDraft,
  draftToPlainText,
  normalizeDraft,
  reorderSections,
  setSectionVisible,
  suggestedDisplayName,
} from "./resume-creator-draft";

const empty = createEmptyDraft();
assert.equal(empty.version, 1);
assert.equal(empty.templateId, "classic");
assert.ok(empty.sections.some((s) => s.id === "contact" && s.visible));
assert.ok(empty.sections.some((s) => s.id === "certifications" && !s.visible));

const sample = createSampleDraft();
assert.ok(sample.content.contact.fullName.includes("Alex"));
const text = draftToPlainText(sample);
assert.ok(text.includes("Alex Rivera"));
assert.ok(text.includes("EXPERIENCE") || text.includes("Experience".toUpperCase()));
assert.ok(text.includes("TypeScript"));

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
const withoutProjects = draftToPlainText({
  ...sample,
  sections: hidden,
});
assert.ok(!withoutProjects.toUpperCase().includes("PROJECTS"));

const normalized = normalizeDraft({
  version: 1,
  templateId: "modern",
  typography: { fontFamily: "georgia", headerPt: 20, bodyPt: 9 },
  sections: [{ id: "experience", title: "Work", visible: true }],
  content: {
    contact: { fullName: "Sam Example", email: "sam@example.com" },
    summary: "Hello",
    skills: "Go, Rust",
  },
  targetRole: "Backend Engineer",
});
assert.equal(normalized.templateId, "modern");
assert.equal(normalized.typography.fontFamily, "georgia");
assert.equal(normalized.typography.headerPt, 20);
assert.equal(normalized.content.contact.fullName, "Sam Example");
assert.equal(normalized.targetRole, "Backend Engineer");
// Missing sections are filled back in.
assert.ok(normalized.sections.some((s) => s.id === "contact"));
assert.equal(normalized.sections.find((s) => s.id === "experience")?.title, "Work");

assert.equal(suggestedDisplayName(normalized).startsWith("Sam Example"), true);
assert.ok(suggestedDisplayName(normalized).includes("Backend Engineer"));

assert.deepEqual(normalizeDraft(null).templateId, "classic");
assert.deepEqual(normalizeDraft("nope").sections.length, createEmptyDraft().sections.length);

console.log("resume-creator-draft tests: ok");
