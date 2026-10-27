"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { type ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  DragDrop,
  DragDropHandle,
  DragDropItem,
  DragDropList,
} from "@/components/ui/drag-and-drop";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  newCertificationEntry,
  newEducationEntry,
  newExperienceEntry,
  newProjectEntry,
  reorderSections,
  setSectionVisible,
} from "@/lib/resume-creator-draft";
import {
  RESUME_CREATOR_FONTS,
  RESUME_CREATOR_TEMPLATES,
  type ResumeCreatorDraft,
  type ResumeCreatorFontId,
  type ResumeCreatorSectionId,
  type ResumeCreatorTemplateId,
} from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";

type Props = {
  draft: ResumeCreatorDraft;
  onChange: (next: ResumeCreatorDraft) => void;
  className?: string;
};

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-muted-foreground text-[11px] font-medium">{label}</span>
      {children}
    </label>
  );
}

export function ResumeCreatorLeftPane({ draft, onChange, className }: Props) {
  const patch = (partial: Partial<ResumeCreatorDraft>) =>
    onChange({ ...draft, ...partial, updatedAt: new Date().toISOString() });
  const patchContent = (partial: Partial<ResumeCreatorDraft["content"]>) =>
    patch({ content: { ...draft.content, ...partial } });
  const patchTypography = (partial: Partial<ResumeCreatorDraft["typography"]>) =>
    patch({ typography: { ...draft.typography, ...partial } });

  const sectionIds = draft.sections.map((s) => s.id);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="mb-2 shrink-0 px-1">
        <p className="aavedak-section-title text-foreground">Build</p>
        <p className="aavedak-meta text-muted-foreground mt-0.5">
          Templates, type, and section content. Draft autosaves on this device.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-1">
        <div className="space-y-4 pb-4">
          <section className="space-y-2">
            <p className="text-foreground text-[12px] font-semibold">Template</p>
            <ToggleGroup
              aria-label="Resume template"
              variant="outline"
              size="sm"
              spacing={1}
              value={[draft.templateId]}
              onValueChange={(vals) => {
                const next = vals[0] as ResumeCreatorTemplateId | undefined;
                if (next) patch({ templateId: next });
              }}
              className="flex flex-wrap"
            >
              {(Object.keys(RESUME_CREATOR_TEMPLATES) as ResumeCreatorTemplateId[]).map((id) => (
                <ToggleGroupItem
                  key={id}
                  value={id}
                  className="h-auto flex-col items-start rounded-md px-2.5 py-1.5 text-left"
                >
                  <span className="text-[12px] font-medium">
                    {RESUME_CREATOR_TEMPLATES[id].label}
                  </span>
                  <span className="text-muted-foreground text-[10px] font-normal leading-snug">
                    {RESUME_CREATOR_TEMPLATES[id].description}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>

          <Accordion type="single" collapsible defaultValue="styling" className="border-y-0">
            <AccordionItem value="styling">
              <AccordionTrigger className="py-2 text-[12px] font-semibold">
                Styling
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                <Field label="Font family">
                  <Select
                    value={draft.typography.fontFamily}
                    onValueChange={(v) => patchTypography({ fontFamily: v as ResumeCreatorFontId })}
                  >
                    <SelectTrigger className="h-8 w-full text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(RESUME_CREATOR_FONTS) as ResumeCreatorFontId[]).map((id) => (
                        <SelectItem key={id} value={id}>
                          {RESUME_CREATOR_FONTS[id].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["headerPt", "Name / header", 12, 28],
                      ["sectionTitlePt", "Section title", 8, 18],
                      ["bodyPt", "Body", 7, 14],
                      ["footerPt", "Footer / meta", 6, 12],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <Field key={key} label={`${label} (${draft.typography[key]}pt)`}>
                      <Input
                        type="number"
                        min={min}
                        max={max}
                        step={0.5}
                        value={draft.typography[key]}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n)) return;
                          patchTypography({ [key]: Math.min(max, Math.max(min, n)) });
                        }}
                        className="h-8 text-[12px]"
                      />
                    </Field>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <section className="space-y-2">
            <p className="text-foreground text-[12px] font-semibold">Sections</p>
            <p className="text-muted-foreground text-[11px]">
              Drag to reorder. Toggle to show or hide on the PDF.
            </p>
            <DragDrop
              id="resume-creator-sections"
              items={sectionIds}
              onReorder={(items) => {
                const ids = (Array.isArray(items) ? items : []) as ResumeCreatorSectionId[];
                patch({ sections: reorderSections(draft.sections, ids) });
              }}
            >
              <DragDropList className="space-y-1.5">
                {draft.sections.map((section) => (
                  <DragDropItem
                    key={section.id}
                    id={section.id}
                    className="border-border bg-card flex items-center gap-1.5 rounded-md border px-1.5 py-1.5"
                  >
                    <DragDropHandle
                      className="text-muted-foreground hover:text-foreground size-7 shrink-0"
                      aria-label={`Drag ${section.title}`}
                    >
                      <GripVertical className="size-3.5" />
                    </DragDropHandle>
                    <span className="text-foreground min-w-0 flex-1 truncate text-[12px] font-medium">
                      {section.title}
                    </span>
                    <Switch
                      checked={section.visible}
                      onCheckedChange={(checked) =>
                        patch({
                          sections: setSectionVisible(draft.sections, section.id, checked),
                        })
                      }
                      aria-label={`${section.visible ? "Hide" : "Show"} ${section.title}`}
                    />
                  </DragDropItem>
                ))}
              </DragDropList>
            </DragDrop>
          </section>

          <Accordion
            type="multiple"
            defaultValue={["contact", "summary", "experience"]}
            className="border-y-0"
          >
            <AccordionItem value="contact">
              <AccordionTrigger className="py-2 text-[12px] font-semibold">
                Contact
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pb-3">
                <Field label="Full name">
                  <Input
                    value={draft.content.contact.fullName}
                    onChange={(e) =>
                      patchContent({
                        contact: { ...draft.content.contact, fullName: e.target.value },
                      })
                    }
                    className="h-8 text-[12px]"
                    placeholder="Alex Rivera"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["email", "Email", "alex@example.com"],
                      ["phone", "Phone", "+91 …"],
                      ["location", "Location", "Bengaluru, India"],
                      ["linkedin", "LinkedIn", "linkedin.com/in/…"],
                      ["github", "GitHub", "github.com/…"],
                      ["portfolio", "Portfolio", "yoursite.dev"],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <Field key={key} label={label}>
                      <Input
                        value={draft.content.contact[key]}
                        onChange={(e) =>
                          patchContent({
                            contact: { ...draft.content.contact, [key]: e.target.value },
                          })
                        }
                        className="h-8 text-[12px]"
                        placeholder={placeholder}
                      />
                    </Field>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="summary">
              <AccordionTrigger className="py-2 text-[12px] font-semibold">
                Summary
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <Textarea
                  value={draft.content.summary}
                  onChange={(e) => patchContent({ summary: e.target.value })}
                  className="min-h-24 text-[12px] leading-relaxed"
                  placeholder="2–3 lines on what you do and the roles you want."
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="experience">
              <AccordionTrigger className="py-2 text-[12px] font-semibold">
                Experience
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                {draft.content.experience.map((entry, idx) => (
                  <div key={entry.id} className="border-border space-y-2 rounded-md border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground text-[11px]">Role {idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove role"
                        disabled={draft.content.experience.length <= 1}
                        onClick={() =>
                          patchContent({
                            experience: draft.content.experience.filter((e) => e.id !== entry.id),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Field label="Title">
                        <Input
                          value={entry.title}
                          onChange={(e) => {
                            const experience = draft.content.experience.map((row) =>
                              row.id === entry.id ? { ...row, title: e.target.value } : row,
                            );
                            patchContent({ experience });
                          }}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="Company">
                        <Input
                          value={entry.company}
                          onChange={(e) => {
                            const experience = draft.content.experience.map((row) =>
                              row.id === entry.id ? { ...row, company: e.target.value } : row,
                            );
                            patchContent({ experience });
                          }}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="Start">
                        <Input
                          value={entry.start}
                          onChange={(e) => {
                            const experience = draft.content.experience.map((row) =>
                              row.id === entry.id ? { ...row, start: e.target.value } : row,
                            );
                            patchContent({ experience });
                          }}
                          className="h-8 text-[12px]"
                          placeholder="2024-01"
                        />
                      </Field>
                      <Field label="End">
                        <Input
                          value={entry.end}
                          onChange={(e) => {
                            const experience = draft.content.experience.map((row) =>
                              row.id === entry.id ? { ...row, end: e.target.value } : row,
                            );
                            patchContent({ experience });
                          }}
                          className="h-8 text-[12px]"
                          placeholder="Present"
                        />
                      </Field>
                    </div>
                    <Field label="Location">
                      <Input
                        value={entry.location}
                        onChange={(e) => {
                          const experience = draft.content.experience.map((row) =>
                            row.id === entry.id ? { ...row, location: e.target.value } : row,
                          );
                          patchContent({ experience });
                        }}
                        className="h-8 text-[12px]"
                      />
                    </Field>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-[11px]">Bullets</Label>
                      {entry.bullets.map((bullet, bi) => (
                        <div key={bi} className="flex gap-1.5">
                          <Textarea
                            value={bullet}
                            onChange={(e) => {
                              const bullets = entry.bullets.map((b, i) =>
                                i === bi ? e.target.value : b,
                              );
                              const experience = draft.content.experience.map((row) =>
                                row.id === entry.id ? { ...row, bullets } : row,
                              );
                              patchContent({ experience });
                            }}
                            className="min-h-14 flex-1 text-[12px]"
                            placeholder="What you shipped, with a metric when you can."
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="mt-1 shrink-0"
                            aria-label="Remove bullet"
                            disabled={entry.bullets.length <= 1}
                            onClick={() => {
                              const bullets = entry.bullets.filter((_, i) => i !== bi);
                              const experience = draft.content.experience.map((row) =>
                                row.id === entry.id
                                  ? { ...row, bullets: bullets.length ? bullets : [""] }
                                  : row,
                              );
                              patchContent({ experience });
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const experience = draft.content.experience.map((row) =>
                            row.id === entry.id ? { ...row, bullets: [...row.bullets, ""] } : row,
                          );
                          patchContent({ experience });
                        }}
                      >
                        <Plus className="size-3.5" />
                        Bullet
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    patchContent({
                      experience: [...draft.content.experience, newExperienceEntry()],
                    })
                  }
                >
                  <Plus className="size-3.5" />
                  Add role
                </Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="education">
              <AccordionTrigger className="py-2 text-[12px] font-semibold">
                Education
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                {draft.content.education.map((entry, idx) => (
                  <div key={entry.id} className="border-border space-y-2 rounded-md border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[11px]">School {idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={draft.content.education.length <= 1}
                        aria-label="Remove school"
                        onClick={() =>
                          patchContent({
                            education: draft.content.education.filter((e) => e.id !== entry.id),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <Field label="Degree">
                      <Input
                        value={entry.degree}
                        onChange={(e) => {
                          const education = draft.content.education.map((row) =>
                            row.id === entry.id ? { ...row, degree: e.target.value } : row,
                          );
                          patchContent({ education });
                        }}
                        className="h-8 text-[12px]"
                      />
                    </Field>
                    <Field label="School">
                      <Input
                        value={entry.school}
                        onChange={(e) => {
                          const education = draft.content.education.map((row) =>
                            row.id === entry.id ? { ...row, school: e.target.value } : row,
                          );
                          patchContent({ education });
                        }}
                        className="h-8 text-[12px]"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Start">
                        <Input
                          value={entry.start}
                          onChange={(e) => {
                            const education = draft.content.education.map((row) =>
                              row.id === entry.id ? { ...row, start: e.target.value } : row,
                            );
                            patchContent({ education });
                          }}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="End">
                        <Input
                          value={entry.end}
                          onChange={(e) => {
                            const education = draft.content.education.map((row) =>
                              row.id === entry.id ? { ...row, end: e.target.value } : row,
                            );
                            patchContent({ education });
                          }}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                    </div>
                    <Field label="Location">
                      <Input
                        value={entry.location}
                        onChange={(e) => {
                          const education = draft.content.education.map((row) =>
                            row.id === entry.id ? { ...row, location: e.target.value } : row,
                          );
                          patchContent({ education });
                        }}
                        className="h-8 text-[12px]"
                      />
                    </Field>
                    <Field label="Details">
                      <Input
                        value={entry.details}
                        onChange={(e) => {
                          const education = draft.content.education.map((row) =>
                            row.id === entry.id ? { ...row, details: e.target.value } : row,
                          );
                          patchContent({ education });
                        }}
                        className="h-8 text-[12px]"
                        placeholder="GPA, coursework, honours"
                      />
                    </Field>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    patchContent({ education: [...draft.content.education, newEducationEntry()] })
                  }
                >
                  <Plus className="size-3.5" />
                  Add school
                </Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="skills">
              <AccordionTrigger className="py-2 text-[12px] font-semibold">Skills</AccordionTrigger>
              <AccordionContent className="pb-3">
                <Textarea
                  value={draft.content.skills}
                  onChange={(e) => patchContent({ skills: e.target.value })}
                  className="min-h-20 text-[12px] leading-relaxed"
                  placeholder="Comma- or newline-separated: TypeScript, Python, …"
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="projects">
              <AccordionTrigger className="py-2 text-[12px] font-semibold">
                Projects
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                {draft.content.projects.map((entry, idx) => (
                  <div key={entry.id} className="border-border space-y-2 rounded-md border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[11px]">Project {idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove project"
                        onClick={() =>
                          patchContent({
                            projects: draft.content.projects.filter((p) => p.id !== entry.id),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <Field label="Name">
                      <Input
                        value={entry.name}
                        onChange={(e) => {
                          const projects = draft.content.projects.map((row) =>
                            row.id === entry.id ? { ...row, name: e.target.value } : row,
                          );
                          patchContent({ projects });
                        }}
                        className="h-8 text-[12px]"
                      />
                    </Field>
                    <Field label="Link">
                      <Input
                        value={entry.link}
                        onChange={(e) => {
                          const projects = draft.content.projects.map((row) =>
                            row.id === entry.id ? { ...row, link: e.target.value } : row,
                          );
                          patchContent({ projects });
                        }}
                        className="h-8 text-[12px]"
                      />
                    </Field>
                    <Field label="Description">
                      <Textarea
                        value={entry.description}
                        onChange={(e) => {
                          const projects = draft.content.projects.map((row) =>
                            row.id === entry.id ? { ...row, description: e.target.value } : row,
                          );
                          patchContent({ projects });
                        }}
                        className="min-h-14 text-[12px]"
                      />
                    </Field>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-[11px]">Bullets</Label>
                      {entry.bullets.map((bullet, bi) => (
                        <Textarea
                          key={bi}
                          value={bullet}
                          onChange={(e) => {
                            const bullets = entry.bullets.map((b, i) =>
                              i === bi ? e.target.value : b,
                            );
                            const projects = draft.content.projects.map((row) =>
                              row.id === entry.id ? { ...row, bullets } : row,
                            );
                            patchContent({ projects });
                          }}
                          className="min-h-12 text-[12px]"
                        />
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const projects = draft.content.projects.map((row) =>
                            row.id === entry.id ? { ...row, bullets: [...row.bullets, ""] } : row,
                          );
                          patchContent({ projects });
                        }}
                      >
                        <Plus className="size-3.5" />
                        Bullet
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    patchContent({ projects: [...draft.content.projects, newProjectEntry()] })
                  }
                >
                  <Plus className="size-3.5" />
                  Add project
                </Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="certifications">
              <AccordionTrigger className="py-2 text-[12px] font-semibold">
                Certifications
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                {draft.content.certifications.length === 0 ? (
                  <p className="text-muted-foreground text-[11px]">
                    Optional. Turn the section on above, then add entries.
                  </p>
                ) : null}
                {draft.content.certifications.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-border grid grid-cols-1 gap-2 rounded-md border p-2.5 sm:grid-cols-[1fr_1fr_5rem_auto]"
                  >
                    <Input
                      value={entry.name}
                      onChange={(e) => {
                        const certifications = draft.content.certifications.map((row) =>
                          row.id === entry.id ? { ...row, name: e.target.value } : row,
                        );
                        patchContent({ certifications });
                      }}
                      className="h-8 text-[12px]"
                      placeholder="Name"
                    />
                    <Input
                      value={entry.issuer}
                      onChange={(e) => {
                        const certifications = draft.content.certifications.map((row) =>
                          row.id === entry.id ? { ...row, issuer: e.target.value } : row,
                        );
                        patchContent({ certifications });
                      }}
                      className="h-8 text-[12px]"
                      placeholder="Issuer"
                    />
                    <Input
                      value={entry.year}
                      onChange={(e) => {
                        const certifications = draft.content.certifications.map((row) =>
                          row.id === entry.id ? { ...row, year: e.target.value } : row,
                        );
                        patchContent({ certifications });
                      }}
                      className="h-8 text-[12px]"
                      placeholder="Year"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove certification"
                      onClick={() =>
                        patchContent({
                          certifications: draft.content.certifications.filter(
                            (c) => c.id !== entry.id,
                          ),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() =>
                    patchContent({
                      certifications: [...draft.content.certifications, newCertificationEntry()],
                    })
                  }
                >
                  <Plus className="size-3.5" />
                  Add certification
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
}
