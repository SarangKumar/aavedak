import {
  Archive,
  Bookmark,
  CircleX,
  ClipboardCheck,
  Ghost,
  Hourglass,
  MessagesSquare,
  NotebookPen,
  Send,
  Trophy,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/application-status";

export const STATUS_ICONS: Record<ApplicationStatus, LucideIcon> = {
  bookmarked: Bookmark,
  preparing: NotebookPen,
  applied: Send,
  under_review: Hourglass,
  assessment: ClipboardCheck,
  interview: MessagesSquare,
  offer: Trophy,
  rejected: CircleX,
  withdrawn: Undo2,
  ghosted: Ghost,
  archived: Archive,
};

/** Application status chip: status icon + label. Inverted (foreground fill) by default. */
export function StatusBadge({
  status,
  variant = "inverted",
  className,
}: {
  status: ApplicationStatus;
  variant?: BadgeVariant;
  className?: string;
}) {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge variant={variant} className={className}>
      <Icon aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** Just the status icon (inherits colour and size from the surrounding text). */
export function StatusIcon({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  const Icon = STATUS_ICONS[status];
  return <Icon aria-hidden className={cn("size-3.5 shrink-0", className)} />;
}

/** Icon + plain label, for menus and toggle chips where a filled badge is too heavy. */
export function StatusLabel({
  status,
  className,
  suffix,
}: {
  status: ApplicationStatus;
  className?: string;
  suffix?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <StatusIcon status={status} />
      {STATUS_LABELS[status]}
      {suffix}
    </span>
  );
}
