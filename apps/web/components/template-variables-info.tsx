"use client";

import { Fragment, useId, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEMO_MAIL_KEYS, TEMPLATE_VAR_DOCS } from "@/lib/template-preview";

export type TemplateVariablesMode = "cover" | "mail";

/**
 * Info icon for templates with `{{variables}}`: hover shows a short hint, click opens the full
 * list with each variable's source and the value it resolves to right now. Shared by the mail
 * template and cover letter editors.
 */
export function TemplateVariablesInfo({
  mode,
  vars,
}: {
  mode: TemplateVariablesMode;
  /** Resolved values by canonical key (empty / missing = not available). */
  vars: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const docs = TEMPLATE_VAR_DOCS.filter(
    (doc) => mode === "mail" || (doc.key !== "person_name" && doc.key !== "person_email"),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group/info bg-foreground text-background relative inline-flex size-4 cursor-pointer items-center justify-center rounded-full shadow-sm"
        aria-label="Template variable meanings"
        aria-describedby={tooltipId}
        title="Variable meanings"
      >
        <span className="text-[10px] font-bold leading-none" aria-hidden>
          i
        </span>
        <span
          id={tooltipId}
          role="tooltip"
          className="border-border bg-popover text-popover-foreground pointer-events-none absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-md border px-2 py-1.5 text-left text-[11px] font-normal leading-snug opacity-0 shadow-md transition-opacity group-hover/info:opacity-100 group-focus-visible/info:opacity-100"
        >
          {mode === "cover"
            ? "Placeholders like {{company}} fill from your profile and the selected job. Click for the list."
            : "Your details fill from your profile; job and recipient use demo values until you send. Click for the list."}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Template variables</DialogTitle>
            <DialogDescription>
              {mode === "cover"
                ? "Each placeholder resolves to a real value from your profile and the selected job or custom company. Missing ones are highlighted in the preview and left out of the PDF."
                : "Your own details resolve from your profile. Job, company and recipient show demo values in the preview and resolve to the real application and person when the email is sent."}
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {docs.map((doc) => {
              const value = vars[doc.key]?.trim();
              const demo = mode === "mail" && DEMO_MAIL_KEYS.has(doc.key);
              return (
                <li
                  key={doc.key}
                  className="border-border/70 bg-muted/30 rounded-xl border px-3 py-2"
                >
                  <p className="text-foreground font-mono text-[12px] font-semibold">
                    {`{{${doc.key}}}`}
                    <span className="text-muted-foreground ml-2 font-sans text-[11px] font-medium">
                      {doc.label}
                    </span>
                    {doc.aliases.length ? (
                      <span className="text-muted-foreground ml-2 font-sans text-[10px]">
                        also {doc.aliases.map((a) => `{{${a}}}`).join(", ")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                    {doc.source}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                    {value ? (
                      <span className="text-foreground/90 break-all">→ {value}</span>
                    ) : (
                      <span className="text-destructive">→ missing</span>
                    )}
                    {demo ? (
                      <Badge variant="outline" className="font-sans text-[9px]">
                        demo value
                      </Badge>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>

          <DialogFooter>
            <Button size="sm" type="button" onClick={() => setOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Text with unresolved `{{variables}}` highlighted (preview only; never in output). */
export function HighlightedTemplateText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded-sm bg-amber-200 px-0.5 text-black ring-1 ring-amber-500/60"
        title="Missing value — fill it in"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** Labels of missing variables, for "Missing: …" notes. */
export function missingVarLabels(keys: string[]): string[] {
  return keys.map((key) => TEMPLATE_VAR_DOCS.find((d) => d.key === key)?.label ?? key);
}
