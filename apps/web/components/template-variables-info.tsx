"use client";

import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_DUMMY_APPLICATION,
  dummyApplicationToVars,
  TEMPLATE_PREVIEW_VAR_DOCS,
} from "@/lib/template-preview";

/**
 * Info icon for templates with `{{variables}}`: hover shows a short hint, click opens the full
 * list with the example value of each placeholder. Shared by the referral email and cover letter
 * editors so both explain variables the same way.
 */
export function TemplateVariablesInfo() {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const vars = useMemo(() => dummyApplicationToVars(DEFAULT_DUMMY_APPLICATION), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group/info bg-foreground text-background relative inline-flex size-4 items-center justify-center rounded-full shadow-sm"
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
          className="border-border bg-popover text-popover-foreground pointer-events-none absolute right-0 top-[calc(100%+6px)] z-30 w-52 rounded-md border px-2 py-1.5 text-left text-[11px] font-normal leading-snug opacity-0 shadow-md transition-opacity group-hover/info:opacity-100 group-focus-visible/info:opacity-100"
        >
          Placeholders like {"{{company}}"} fill from the dummy application. Click for the full
          variable list.
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
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
            <Button size="sm" type="button" onClick={() => setOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
