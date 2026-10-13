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
