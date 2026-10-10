import type React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * The job card look from the Jobs page, shared by every list of jobs or applications
 * (Jobs, Referrals, Job tracker board, Dashboard): company initials, title, "company ·
 * location", then a row of small badges.
 */

export function companyInitials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Card frame for a clickable job / application (button, link, or draggable item). */
export function jobCardClassName({
  selected = false,
  className,
}: { selected?: boolean; className?: string } = {}): string {
  return cn(
    "bg-card flex w-full items-start gap-2.5 rounded-lg border px-3 py-3 text-left shadow-sm transition-colors",
    selected
      ? "border-primary/40 bg-primary/10"
      : "border-border/80 hover:border-border hover:bg-accent/40",
    className,
  );
}

/** Small badge sizing used inside the card's badge row. */
export const JOB_CARD_BADGE = "px-1.5 py-0 text-[10px]";

export function JobCardContent({
  company,
  title,
  subtitle,
  children,
  aside,
}: {
  /** Used for the avatar initials. */
  company: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Badge row under the subtitle. */
  children?: React.ReactNode;
  /** Right-hand slot (drag handle, score ring, link). */
  aside?: React.ReactNode;
}) {
  return (
    <>
      <Avatar className="mt-0.5 size-8 shrink-0 rounded-md">
        <AvatarFallback className="rounded-md text-[10px] font-semibold">
          {companyInitials(company)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate text-[13px] font-semibold">{title}</div>
        {subtitle ? <p className="text-muted-foreground truncate text-[12px]">{subtitle}</p> : null}
        {children ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{children}</div>
        ) : null}
      </div>
      {aside ? <div className="flex shrink-0 items-start">{aside}</div> : null}
    </>
  );
}
