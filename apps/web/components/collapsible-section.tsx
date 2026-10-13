"use client";

import { useId, useState, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function SectionChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn(
        "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
        open && "rotate-180",
      )}
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A card whose header toggles its body (the ATS step cards, shared with Admin).
 * Controlled with `open` + `onOpenChange`, or uncontrolled with `defaultOpen`.
 * `headerRight` sits outside the toggle button, so its actions never collapse the card.
 */
export function CollapsibleSection({
  step,
  title,
  summary,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  headerRight,
  children,
}: {
  step?: number;
  title: ReactNode;
  summary?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const autoId = useId();
  const panelId = step !== undefined ? `ats-step-${step}-panel` : `section-${autoId}-panel`;
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const open = openProp ?? innerOpen;
  function toggle() {
    if (openProp === undefined) setInnerOpen(!open);
    onOpenChange?.(!open);
  }
  return (
    <Card className="border-border/80 bg-card gap-0 rounded-xl border p-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="hover:bg-muted/30 flex min-w-0 flex-1 basis-56 items-center gap-2.5 rounded-lg px-1 py-1 text-left sm:gap-3"
        >
          {step !== undefined ? (
            <span className="border-border/80 bg-muted text-foreground flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-[12px] font-semibold tabular-nums">
              {step}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="text-foreground block text-[13px] font-semibold">{title}</span>
            {summary ? (
              <span className="text-muted-foreground mt-0.5 block text-pretty text-[11px]">
                {summary}
              </span>
            ) : null}
          </span>
          <SectionChevron open={open} />
        </button>
        {headerRight ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 pr-0.5">{headerRight}</div>
        ) : null}
      </div>
      {open ? (
        <div id={panelId} className="border-border/60 border-t px-4 py-3 sm:px-5">
          {children}
        </div>
      ) : null}
    </Card>
  );
}
