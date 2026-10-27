"use client";

import { ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  EducationLayoutControls,
  ResumeCreatorStylePanel,
  SkillsLayoutControls,
} from "@/components/resume-creator/style-panel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DragDrop,
  DragDropHandle,
  DragDropItem,
  DragDropList,
} from "@/components/ui/drag-and-drop";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import {
  applyPreset,
  markStyleEdited,
  newCertificationEntry,
  newEducationEntry,
  newExperienceEntry,
  newProjectEntry,
  reorderSections,
  setSectionVisible,
} from "@/lib/resume-creator-draft";
import {
  STYLE_PRESETS,
  type ResumeCreatorDraft,
  type ResumeCreatorPresetId,
  type ResumeCreatorSectionId,
  type ResumeCreatorStyle,
} from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";
import Link from "next/link";

type SavedStyle = {
  id: string;
  name: string;
  description?: string;
  style: ResumeCreatorStyle;
  sections?: ResumeCreatorDraft["sections"];
};

type Props = {
  draft: ResumeCreatorDraft;
  onChange: (next: ResumeCreatorDraft) => void;
  signedIn: boolean;
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

export function ResumeCreatorLeftPane({ draft, onChange, signedIn, className }: Props) {
  const [openIds, setOpenIds] = useState<Set<ResumeCreatorSectionId>>(
    () => new Set(["contact", "summary", "experience"]),
  );
  const [savedStyles, setSavedStyles] = useState<SavedStyle[]>([]);
  const [savingStyle, setSavingStyle] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [styleName, setStyleName] = useState("");
  const [styleDescription, setStyleDescription] = useState("");
  const [styleMsg, setStyleMsg] = useState<string | null>(null);
  const [stylingOpen, setStylingOpen] = useState(true);

  const patch = useCallback(
    (partial: Partial<ResumeCreatorDraft>) =>
      onChange({ ...draft, ...partial, updatedAt: new Date().toISOString() }),
    [draft, onChange],
  );
  const patchContent = (partial: Partial<ResumeCreatorDraft["content"]>) =>
    patch({ content: { ...draft.content, ...partial } });

  const patchStyle = (partial: Partial<ResumeCreatorStyle>) => {
    const next = markStyleEdited({
      ...draft,
      style: { ...draft.style, ...partial },
    });
    onChange(next);
  };

  useEffect(() => {
    if (!signedIn) {
      setSavedStyles([]);
      return;
    }
    let cancelled = false;
    fetch("/api/resume-creator/styles")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { styles?: SavedStyle[] } | null) => {
        if (!cancelled && data?.styles) setSavedStyles(data.styles);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  function toggleOpen(id: ResumeCreatorSectionId) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveCurrentStyle() {
    if (!signedIn) return;
    const name = styleName.trim();
    if (!name) {
      setStyleMsg("Name is required.");
      return;
    }
    const description = styleDescription.trim().slice(0, 100);
    setSavingStyle(true);
    setStyleMsg(null);
    try {
      const res = await fetch("/api/resume-creator/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          style: draft.style,
          sections: draft.sections,
        }),
      });
      const data = (await res.json()) as { style?: SavedStyle; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save style.");
      if (data.style) {
        setSavedStyles((prev) => [data.style!, ...prev.filter((s) => s.id !== data.style!.id)]);
        onChange({
          ...draft,
          styleSource: { kind: "custom", id: data.style.id, name: data.style.name },
          updatedAt: new Date().toISOString(),
        });
        setStyleName("");
        setStyleDescription("");
        setSaveOpen(false);
        setStyleMsg(`Saved “${data.style.name}”.`);
      }
    } catch (err) {
      setStyleMsg(err instanceof Error ? err.message : "Could not save style.");
    } finally {
      setSavingStyle(false);
    }
  }

  async function removeSavedStyle(id: string) {
    if (!signedIn) return;
    await fetch(`/api/resume-creator/styles/${id}`, { method: "DELETE" });
    setSavedStyles((prev) => prev.filter((s) => s.id !== id));
  }

  const sectionIds = draft.sections.map((s) => s.id);
  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col", className)}>
      <div className="mb-2 shrink-0 px-1">
        <p className="aavedak-section-title text-foreground">Build</p>
        <p className="aavedak-meta text-muted-foreground mt-0.5">
          Presets fill the style fields. Draft stays on this device until you save the resume.
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-1">
        <div className="space-y-4 pb-4">
          {/* Built-in + user style configs as one compact card grid. */}
          <section className="@container space-y-2">
            <p className="text-foreground text-[12px] font-semibold">Style presets</p>
            <div className="@[18rem]:grid-cols-2 grid w-full auto-rows-fr grid-cols-1 gap-2">
              {(Object.keys(STYLE_PRESETS) as ResumeCreatorPresetId[]).map((id) => {
                const preset = STYLE_PRESETS[id];
                const selected = draft.styleSource.kind === "preset" && draft.styleSource.id === id;
                const tip = (
                  <div className="max-w-56 space-y-0.5">
                    <p className="text-[12px] font-medium">{preset.label}</p>
                    <p className="text-[11px] font-normal leading-snug opacity-90">
                      {preset.description}
                    </p>
                  </div>
                );
                return (
                  <Tooltip key={id} content={tip} side="top" delayDuration={250}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChange(applyPreset(draft, id))}
                      className={cn(
                        "border-border hover:bg-muted/40 flex h-full min-h-[4.25rem] w-full flex-col items-stretch gap-0.5 overflow-hidden rounded-md border px-2 py-1.5 text-left transition-colors",
                        selected && "border-primary bg-primary/5",
                      )}
                    >
                      <span className="flex w-full min-w-0 items-center gap-1.5">
                        <span className="text-foreground min-w-0 flex-1 truncate text-[12px] font-medium">
                          {preset.label}
                        </span>
                        <Badge
                          variant="secondary"
                          className="shrink-0 px-1.5 py-0 text-[9px] font-medium"
                        >
                          default
                        </Badge>
                      </span>
                      <span className="text-muted-foreground line-clamp-2 min-h-[2rem] w-full flex-1 text-[10px] font-normal leading-snug">
                        {preset.description}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
              {savedStyles.map((s) => {
                const selected =
                  draft.styleSource.kind === "custom" && draft.styleSource.id === s.id;
                const tip = (
                  <div className="max-w-56 space-y-0.5">
                    <p className="text-[12px] font-medium">{s.name}</p>
                    {s.description ? (
                      <p className="text-[11px] font-normal leading-snug opacity-90">
                        {s.description}
                      </p>
                    ) : null}
                  </div>
                );
                return (
                  <div key={s.id} className="relative h-full min-h-[4.25rem]">
                    <Tooltip content={tip} side="top" delayDuration={250}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          onChange({
                            ...draft,
                            styleSource: { kind: "custom", id: s.id, name: s.name },
                            style: { ...s.style },
                            ...(s.sections?.length
                              ? { sections: s.sections.map((sec) => ({ ...sec })) }
                              : {}),
                            updatedAt: new Date().toISOString(),
                          })
                        }
                        className={cn(
                          "border-border hover:bg-muted/40 flex h-full min-h-[4.25rem] w-full flex-col items-stretch gap-0.5 overflow-hidden rounded-md border px-2 py-1.5 pr-8 text-left transition-colors",
                          selected && "border-primary bg-primary/5",
                        )}
                      >
                        <span className="flex w-full min-w-0 items-center gap-1.5">
                          <span className="text-foreground min-w-0 flex-1 truncate text-[12px] font-medium">
                            {s.name}
                          </span>
                          <Badge
                            variant="default"
                            className="shrink-0 px-1.5 py-0 text-[9px] font-medium"
                          >
                            user defined
                          </Badge>
                        </span>
                        <span className="text-muted-foreground line-clamp-2 min-h-[2rem] w-full flex-1 text-[10px] font-normal leading-snug">
                          {s.description?.trim() || "User defined configuration"}
                        </span>
                      </button>
                    </Tooltip>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute right-1 top-1"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => void removeSavedStyle(s.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
            {draft.styleSource.kind === "edited" ? (
              <p className="text-muted-foreground text-[11px]">
                Style fields were edited — no longer matching a preset.
              </p>
            ) : draft.styleSource.kind === "custom" ? (
              <p className="text-muted-foreground text-[11px]">
                Using saved style “{draft.styleSource.name}”.
              </p>
            ) : null}
            {!signedIn ? (
              <p className="text-muted-foreground text-[11px]">
                <Link
                  href="/sign-in?next=/resume-creator"
                  className={cn(buttonVariants({ variant: "link", size: "xs" }), "h-auto px-0")}
                >
                  Sign in
                </Link>{" "}
                to save your own style configurations. Your draft is kept on this device either way.
              </p>
            ) : styleMsg ? (
              <p className="text-muted-foreground text-[11px]">{styleMsg}</p>
            ) : null}
          </section>

          <section className="border-border bg-card overflow-hidden rounded-md border">
            <div className="flex items-center gap-1 px-1.5 py-1.5">
              <span className="text-foreground min-w-0 flex-1 truncate px-1 text-[12px] font-medium">
                Styling
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-expanded={stylingOpen}
                aria-label={stylingOpen ? "Collapse Styling" : "Expand Styling"}
                onClick={() => setStylingOpen((v) => !v)}
              >
                <ChevronDown
                  className={cn("size-3.5 transition-transform", stylingOpen && "rotate-180")}
                />
              </Button>
            </div>
            {stylingOpen ? (
              <div className="border-border space-y-2 border-t px-2.5 py-2.5">
                <ResumeCreatorStylePanel style={draft.style} onChange={patchStyle} />
              </div>
            ) : null}
          </section>

          {signedIn ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  setStyleMsg(null);
                  setSaveOpen(true);
                }}
              >
                Save configuration
              </Button>
              <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                <DialogContent size="sm">
                  <DialogHeader>
                    <DialogTitle>Save configuration</DialogTitle>
                    <DialogDescription>
                      Name this style setup. Description is optional (max 100 characters). Saved
                      configs show a user defined badge.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-1">
                    <label className="block space-y-1">
                      <span className="text-muted-foreground text-[11px] font-medium">Name</span>
                      <Input
                        value={styleName}
                        onChange={(e) => setStyleName(e.target.value.slice(0, 80))}
                        placeholder="My interview style"
                        className="h-9 text-[13px]"
                        autoFocus
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-muted-foreground text-[11px] font-medium">
                        Description
                      </span>
                      <Textarea
                        maxRows={5}
                        value={styleDescription}
                        onChange={(e) => setStyleDescription(e.target.value.slice(0, 100))}
                        placeholder="Tight margins, 3-column skills…"
                        className="min-h-20 text-[13px]"
                        maxLength={100}
                      />
                      <span className="text-muted-foreground block text-right text-[10px] tabular-nums">
                        {styleDescription.length}/100
                      </span>
                    </label>
                    {styleMsg ? <p className="text-destructive text-[11px]">{styleMsg}</p> : null}
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSaveOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      loading={savingStyle}
                      loadingText="Saving…"
                      onClick={() => void saveCurrentStyle()}
                    >
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}

          <section className="space-y-2">
            <p className="text-foreground text-[12px] font-semibold">Sections</p>
            <p className="text-muted-foreground text-[11px]">
              Drag to reorder. Toggle visibility. Expand a row to edit its content.
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
                {draft.sections.map((section) => {
                  const open = openIds.has(section.id);
                  return (
                    <DragDropItem
                      key={section.id}
                      id={section.id}
                      className="border-border bg-card overflow-hidden rounded-md border"
                    >
                      <div className="flex items-center gap-1 px-1.5 py-1.5">
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-expanded={open}
                          aria-label={`${open ? "Collapse" : "Expand"} ${section.title}`}
                          onClick={() => toggleOpen(section.id)}
                        >
                          <ChevronDown
                            className={cn("size-3.5 transition-transform", open && "rotate-180")}
                          />
                        </Button>
                      </div>
                      {open ? (
                        <div className="border-border space-y-2 border-t px-2.5 py-2.5">
                          <SectionEditor
                            sectionId={section.id}
                            draft={draft}
                            patchContent={patchContent}
                            patchStyle={patchStyle}
                          />
                        </div>
                      ) : null}
                    </DragDropItem>
                  );
                })}
              </DragDropList>
            </DragDrop>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionEditor({
  sectionId,
  draft,
  patchContent,
  patchStyle,
}: {
  sectionId: ResumeCreatorSectionId;
  draft: ResumeCreatorDraft;
  patchContent: (partial: Partial<ResumeCreatorDraft["content"]>) => void;
  patchStyle: (partial: Partial<ResumeCreatorStyle>) => void;
}) {
  switch (sectionId) {
    case "contact":
      return (
        <div className="space-y-2">
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
          <Field label="Location">
            <Input
              value={draft.content.contact.location}
              onChange={(e) =>
                patchContent({
                  contact: { ...draft.content.contact, location: e.target.value },
                })
              }
              className="h-8 text-[12px]"
              placeholder="Bengaluru, India"
            />
          </Field>
          <p className="text-muted-foreground text-[10px] leading-snug">
            Links use a display title on the resume and the value for mailto / tel / URL.
          </p>
          {(
            [
              ["email", "Email", "Email", "alex@example.com"],
              ["phone", "Phone", "Phone", "+91 …"],
              ["linkedin", "LinkedIn", "LinkedIn", "linkedin.com/in/…"],
              ["github", "GitHub", "GitHub", "github.com/…"],
              ["portfolio", "Portfolio", "Portfolio", "yoursite.dev"],
            ] as const
          ).map(([key, fieldLabel, defaultTitle, placeholder]) => {
            const link = draft.content.contact[key];
            return (
              <div key={key} className="border-border space-y-1.5 rounded-md border p-2">
                <p className="text-foreground text-[11px] font-medium">{fieldLabel}</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <Field label="Title">
                    <Input
                      value={link.label}
                      onChange={(e) =>
                        patchContent({
                          contact: {
                            ...draft.content.contact,
                            [key]: { ...link, label: e.target.value },
                          },
                        })
                      }
                      className="h-8 text-[12px]"
                      placeholder={defaultTitle}
                    />
                  </Field>
                  <Field label="Value">
                    <Input
                      value={link.value}
                      onChange={(e) =>
                        patchContent({
                          contact: {
                            ...draft.content.contact,
                            [key]: { ...link, value: e.target.value },
                          },
                        })
                      }
                      className="h-8 text-[12px]"
                      placeholder={placeholder}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      );
    case "summary":
      return (
        <Textarea
          maxRows={5}
          value={draft.content.summary}
          onChange={(e) => patchContent({ summary: e.target.value })}
          className="min-h-24 text-[12px] leading-relaxed"
          placeholder="2–3 lines on what you do and the roles you want."
        />
      );
    case "skills":
      return (
        <div className="space-y-3">
          <Textarea
            maxRows={5}
            value={draft.content.skills}
            onChange={(e) => patchContent({ skills: e.target.value })}
            className="min-h-20 text-[12px] leading-relaxed"
            placeholder={"Languages: TypeScript, Python\nFrontend: React, Next.js"}
          />
          <div className="border-border space-y-2 rounded-md border p-2">
            <p className="text-foreground text-[11px] font-medium">Skills layout</p>
            <SkillsLayoutControls style={draft.style} onChange={patchStyle} />
          </div>
        </div>
      );
    case "experience":
      return (
        <div className="space-y-3">
          {draft.content.experience.map((entry, idx) => (
            <div key={entry.id} className="border-border space-y-2 rounded-md border p-2">
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
                {(
                  [
                    ["title", "Title"],
                    ["company", "Company"],
                    ["start", "Start"],
                    ["end", "End"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Input
                      value={entry[key]}
                      onChange={(e) => {
                        const experience = draft.content.experience.map((row) =>
                          row.id === entry.id ? { ...row, [key]: e.target.value } : row,
                        );
                        patchContent({ experience });
                      }}
                      className="h-8 text-[12px]"
                    />
                  </Field>
                ))}
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
                      maxRows={5}
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
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="mt-1 shrink-0"
                      disabled={entry.bullets.length <= 1}
                      aria-label="Remove bullet"
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
              patchContent({ experience: [...draft.content.experience, newExperienceEntry()] })
            }
          >
            <Plus className="size-3.5" />
            Add role
          </Button>
        </div>
      );
    case "education":
      return (
        <div className="space-y-3">
          <div className="border-border space-y-2 rounded-md border p-2">
            <p className="text-foreground text-[11px] font-medium">Education layout</p>
            <EducationLayoutControls style={draft.style} onChange={patchStyle} />
          </div>
          {draft.content.education.map((entry, idx) => (
            <div key={entry.id} className="border-border space-y-2 rounded-md border p-2">
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
              {(
                [
                  ["degree", "Degree"],
                  ["school", "School"],
                  ["location", "Location"],
                  ["details", "Details"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    value={entry[key]}
                    onChange={(e) => {
                      const education = draft.content.education.map((row) =>
                        row.id === entry.id ? { ...row, [key]: e.target.value } : row,
                      );
                      patchContent({ education });
                    }}
                    className="h-8 text-[12px]"
                  />
                </Field>
              ))}
              <div className="grid grid-cols-2 gap-2">
                {(["start", "end"] as const).map((key) => (
                  <Field key={key} label={key === "start" ? "Start" : "End"}>
                    <Input
                      value={entry[key]}
                      onChange={(e) => {
                        const education = draft.content.education.map((row) =>
                          row.id === entry.id ? { ...row, [key]: e.target.value } : row,
                        );
                        patchContent({ education });
                      }}
                      className="h-8 text-[12px]"
                    />
                  </Field>
                ))}
              </div>
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
        </div>
      );
    case "projects":
      return (
        <div className="space-y-3">
          {draft.content.projects.map((entry, idx) => (
            <div key={entry.id} className="border-border space-y-2 rounded-md border p-2">
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
                  maxRows={5}
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
                  <div key={bi} className="flex gap-1.5">
                    <Textarea
                      maxRows={5}
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
                      className="min-h-12 flex-1 text-[12px]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="mt-1 shrink-0"
                      disabled={entry.bullets.length <= 1}
                      aria-label="Remove bullet"
                      onClick={() => {
                        const bullets = entry.bullets.filter((_, i) => i !== bi);
                        const projects = draft.content.projects.map((row) =>
                          row.id === entry.id
                            ? { ...row, bullets: bullets.length ? bullets : [""] }
                            : row,
                        );
                        patchContent({ projects });
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
        </div>
      );
    case "certifications":
      return (
        <div className="space-y-2">
          {draft.content.certifications.map((entry) => (
            <div
              key={entry.id}
              className="border-border grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_5rem_auto]"
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
                    certifications: draft.content.certifications.filter((c) => c.id !== entry.id),
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
        </div>
      );
    default:
      return null;
  }
}
