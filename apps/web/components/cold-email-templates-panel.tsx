"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_DUMMY_APPLICATION,
  DEFAULT_FOLLOWUP_SUBJECT,
  DEFAULT_TEMPLATE_SUBJECT,
  TEMPLATE_PREVIEW_VAR_DOCS,
  dummyApplicationToVars,
  renderTemplatePreview,
  type DummyApplication,
} from "@/lib/template-preview";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export type TemplateKindDto = "outreach" | "cover" | "followup" | "other";

function defaultSubjectForKind(kind: TemplateKindDto): string {
  if (kind === "followup") return DEFAULT_FOLLOWUP_SUBJECT;
  return DEFAULT_TEMPLATE_SUBJECT;
}

export type ColdEmailTemplateDto = {
  id: string;
  title: string;
  subject: string;
  body: string;
  kind: TemplateKindDto;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type Props = {
  templates: ColdEmailTemplateDto[];
  onTemplatesChange: (next: ColdEmailTemplateDto[]) => void;
  /** When set, only edit this kind and hide the kind selector. */
  lockedKind?: TemplateKindDto;
  listTitle?: string;
  newButtonLabel?: string;
  /** Ignored — dummy strip always uses example.com placeholders. Kept for call-site compat. */
  fromEmail?: string;
  /** Ignored — dummy strip always uses example.com placeholders. Kept for call-site compat. */
  userName?: string;
  className?: string;
};

function normalizeTemplate(
  tpl: Partial<ColdEmailTemplateDto> &
    Pick<ColdEmailTemplateDto, "id" | "title" | "body" | "kind" | "status">,
  fallback?: ColdEmailTemplateDto,
): ColdEmailTemplateDto {
  const now = new Date().toISOString();
  return {
    id: tpl.id,
    title: tpl.title,
    subject: typeof tpl.subject === "string" ? tpl.subject : (fallback?.subject ?? ""),
    body: tpl.body,
    kind: tpl.kind,
    status: tpl.status,
    createdAt: tpl.createdAt ?? fallback?.createdAt ?? now,
    updatedAt: tpl.updatedAt ?? now,
  };
}

function emptyDraft(kind: TemplateKindDto = "outreach") {
  return {
    id: null as string | null,
    title: kind === "followup" ? "Follow-up — gentle nudge" : "Referral ask",
    subject: defaultSubjectForKind(kind),
    body: "",
    kind,
  };
}

export function ColdEmailTemplatesPanel({
  templates,
  onTemplatesChange,
  lockedKind,
  listTitle = "Your templates",
  newButtonLabel = "New blank template",
  className,
}: Props) {
  const defaultKind = lockedKind ?? "outreach";
  const [draft, setDraft] = useState(() => emptyDraft(defaultKind));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Dummy strip always uses example.com placeholders (props kept for call-site compat).
  const dummy: DummyApplication = DEFAULT_DUMMY_APPLICATION;

  const vars = useMemo(() => dummyApplicationToVars(dummy), [dummy]);
  const previewSubject = renderTemplatePreview(draft.subject || "", vars);
  const previewBody = renderTemplatePreview(draft.body || "", vars);

  function startNew() {
    setDraft(emptyDraft(defaultKind));
    setError(null);
    queueMicrotask(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      titleRef.current?.focus();
    });
  }

  function loadTemplate(tpl: ColdEmailTemplateDto) {
    setDraft({
      id: tpl.id,
      title: tpl.title,
      subject: tpl.subject?.trim() ? tpl.subject : defaultSubjectForKind(tpl.kind),
      body: tpl.body,
      kind: tpl.kind,
    });
    setError(null);
  }

  async function save() {
    if (!draft.title.trim()) {
      setError("Template title is required.");
      return;
    }
    if (!draft.body.trim()) {
      setError("Template body is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (draft.id) {
        const res = await fetch(`/api/templates/${draft.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title.trim(),
            subject: draft.subject,
            body: draft.body,
            kind: lockedKind ?? draft.kind,
          }),
        });
        const data = (await res.json()) as { template?: ColdEmailTemplateDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Could not update template.");
        if (data.template) {
          const prev = templates.find((x) => x.id === data.template!.id);
          const updated = normalizeTemplate(data.template, prev);
          onTemplatesChange(templates.map((x) => (x.id === updated.id ? updated : x)));
          setDraft((d) => ({
            ...d,
            id: updated.id,
            title: updated.title,
            subject: updated.subject || d.subject,
            body: updated.body,
            kind: updated.kind,
          }));
        }
      } else {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title.trim(),
            subject: draft.subject,
            body: draft.body,
            kind: lockedKind ?? draft.kind,
          }),
        });
        const data = (await res.json()) as { template?: ColdEmailTemplateDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Could not create template.");
        if (data.template) {
          const created = normalizeTemplate(data.template);
          onTemplatesChange([created, ...templates]);
          setDraft((d) => ({
            ...d,
            id: created.id,
            title: created.title,
            subject: created.subject || d.subject,
            body: created.body,
            kind: created.kind,
          }));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save template.");
    } finally {
      setPending(false);
    }
  }

  async function archive(id: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not archive template.");
      const next = templates.filter((t) => t.id !== id);
      onTemplatesChange(next);
      if (draft.id === id) startNew();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive template.");
    } finally {
      setPending(false);
    }
  }

  const field =
    "border-border bg-background text-foreground h-8 w-full rounded-lg border px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

  return (
    <div className={cn("space-y-3", className)}>
      {/* 1) Dummy application strip */}
      <Card className="border-border/80 bg-card flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2.5 shadow-sm">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="text-foreground text-[12px] font-semibold tracking-tight">
              Dummy application
            </p>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Preview substitutes placeholders from this sample job + person.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Chip label="Company" value={dummy.company} />
            <Chip label="Role" value={dummy.role} />
            <Chip label="Location" value={dummy.location} />
            <Chip label="Person" value={dummy.personName} />
            <Chip label="Person email" value={dummy.personEmail} />
            <Chip label="From" value={dummy.fromEmail} />
            <Chip label="You" value={dummy.userName} />
          </div>
        </div>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* 2) Create/edit | live preview — equal height columns; preview fills remainder */}
      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <Card
          ref={editorRef}
          className="border-border/80 bg-card flex h-full min-h-[16rem] flex-col gap-2 rounded-xl border p-3 shadow-sm"
        >
          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="text-foreground text-[12px] font-semibold tracking-tight">
              {draft.id ? "Edit template" : "New template"}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {draft.id ? (
                <Button
                  variant="link"
                  size="xs"
                  type="button"
                  onClick={startNew}
                  title="Clear the editor and start a new blank template"
                >
                  New blank
                </Button>
              ) : null}
              <button
                type="button"
                onClick={() => setInfoOpen(true)}
                className="group/info bg-foreground text-background relative inline-flex size-4 items-center justify-center rounded-full shadow-sm"
                aria-label="Template variable meanings"
                aria-describedby="template-vars-tooltip"
                title="Variable meanings"
              >
                <span className="text-[10px] font-bold leading-none" aria-hidden>
                  i
                </span>
                <span
                  id="template-vars-tooltip"
                  role="tooltip"
                  className="border-border bg-popover text-popover-foreground pointer-events-none absolute right-0 top-[calc(100%+6px)] z-30 w-52 rounded-md border px-2 py-1.5 text-left text-[11px] font-normal leading-snug opacity-0 shadow-md transition-opacity group-hover/info:opacity-100 group-focus-visible/info:opacity-100"
                >
                  Placeholders like {"{{company}}"} fill from the dummy application. Click for the
                  full variable list.
                </span>
              </button>
            </div>
          </div>
          <Input
            ref={titleRef}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Title (e.g. Referral ask — Acme)"
            className="shrink-0"
          />
          {lockedKind ? null : (
            <Select
              value={draft.kind}
              onValueChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  kind: (v as TemplateKindDto) || "outreach",
                }))
              }
            >
              <SelectTrigger className={cn(field, "shrink-0 px-2")}>
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent className="z-[280]">
                <SelectItem value="outreach">Referral email</SelectItem>
                <SelectItem value="followup">Follow-up email</SelectItem>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          )}
          <label className="block shrink-0 space-y-1">
            <span className="text-muted-foreground text-[11px] font-medium">Subject</span>
            <Input
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
              placeholder={defaultSubjectForKind(draft.kind)}
            />
          </label>
          <label className="flex min-h-0 flex-1 flex-col space-y-1">
            <span className="text-muted-foreground shrink-0 text-[11px] font-medium">Body</span>
            <Textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder="Hi {{person_name}}, …"
              rows={14}
              className="min-h-[16rem] flex-1 resize-y overflow-y-auto py-2 font-mono text-[11px] leading-relaxed"
            />
          </label>
          <Button
            type="button"
            size="sm"
            loading={pending}
            onClick={() => void save()}
            className="h-8 shrink-0 self-start"
          >
            {draft.id ? "Update template" : "Create template"}
          </Button>
        </Card>

        <Card className="border-border/80 bg-card flex h-full min-h-[16rem] flex-col gap-0 overflow-hidden rounded-xl border p-3 shadow-sm">
          <p className="text-foreground shrink-0 text-[12px] font-semibold tracking-tight">
            Live preview
          </p>
          <p className="text-muted-foreground mb-2 shrink-0 text-[11px]">
            Updates as you type subject and body.
          </p>
          <ScrollArea className="border-border/70 bg-background/50 min-h-0 flex-1 rounded-xl border p-3">
            <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
              Subject
            </p>
            <p className="text-foreground mt-0.5 text-[12px] font-medium">
              {previewSubject || "(empty subject)"}
            </p>
            <p className="text-muted-foreground mt-3 text-[10px] font-medium uppercase tracking-wide">
              Body
            </p>
            <pre className="text-foreground/90 mt-0.5 whitespace-pre-wrap font-sans text-[12px] leading-relaxed">
              {previewBody || "(empty body)"}
            </pre>
          </ScrollArea>
        </Card>
      </div>

      {/* 3) Your templates list — flat like Your resumes */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
            {listTitle} ({templates.length})
          </h2>
          <Button
            variant="outline"
            size="xs"
            type="button"
            onClick={startNew}
            title="Create a new blank template in the editor above"
          >
            {newButtonLabel}
          </Button>
        </div>
        {templates.length === 0 ? (
          <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-[13px]">
            No templates yet — create one above.
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="space-y-2">
              {templates.map((tpl) => {
                const selected = draft.id === tpl.id;
                return (
                  <li
                    key={tpl.id}
                    className={cn(
                      "border-border/80 bg-card flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
                      selected && "border-primary/40 bg-primary/10",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => loadTemplate(tpl)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-foreground truncate text-[13px] font-medium">
                        {tpl.title}
                        <span className="text-muted-foreground ml-2 text-[10px] font-semibold uppercase tracking-wide">
                          {tpl.kind}
                        </span>
                      </p>
                      <p className="text-muted-foreground line-clamp-1 text-[11px]">
                        {tpl.body || "Empty body"}
                      </p>
                    </button>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => loadTemplate(tpl)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={pending}
                        onClick={() => void archive(tpl.id)}
                      >
                        Archive
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </div>

      <Dialog
        open={infoOpen}
        onOpenChange={(next) => {
          if (!next) (() => setInfoOpen(false))();
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Template variables</DialogTitle>
            <DialogDescription>
              Placeholders are replaced from the dummy application strip when previewing.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {TEMPLATE_PREVIEW_VAR_DOCS.map((doc) => (
              <li
                key={doc.key}
                className="border-border/70 bg-muted/30 rounded-xl border px-3 py-2"
              >
                <p className="text-foreground font-mono text-[12px] font-semibold">
                  {`{{${doc.key}}}`}
                  <span className="text-muted-foreground ml-2 font-sans text-[11px] font-medium">
                    {doc.label}
                  </span>
                </p>
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                  {doc.description}
                </p>
                <p className="text-foreground/90 mt-1 font-mono text-[11px]">
                  → {vars[doc.key] || "(empty)"}
                </p>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button size="sm" type="button" onClick={() => setInfoOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="border-border/70 bg-background/60 text-muted-foreground inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[10px]">
      <span className="font-medium">{label}</span>
      <span className="text-foreground truncate">{value}</span>
    </span>
  );
}
