"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Board-only view: fills the viewport above the site header/footer and locks page scroll.
 * Used by the `/…/board` routes (Jobs, Referrals, Outreach).
 */
export function FullscreenBoard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className={cn(
        "bg-background fixed inset-0 z-[60] flex flex-col gap-3 overflow-hidden p-3 sm:p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Top-right expand / collapse control for a board. */
export function BoardToggleLink({
  expanded,
  href,
  label = "board",
}: {
  /** True on the full-screen board route (shows Collapse). */
  expanded: boolean;
  href: string;
  label?: string;
}) {
  const text = expanded ? `Collapse ${label}` : `Expand ${label} to full screen`;
  return (
    // Full-screen boards are a desktop affordance; the control is hidden on small screens.
    // The wrapper (not the link) is hidden so the tooltip's own wrapper leaves no gap.
    <span className="hidden md:inline-flex">
      <Tooltip
        content={expanded ? "Collapse" : "Expand to full screen"}
        className="z-70 text-[12px]"
      >
        <Link
          href={href}
          className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          aria-label={text}
        >
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </Link>
      </Tooltip>
    </span>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
      <path
        d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
      <path
        d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
