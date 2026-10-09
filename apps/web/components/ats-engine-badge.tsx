import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { engineBadge } from "@/lib/ats-engines/badges";
import { getEngine } from "@/lib/ats-engines/registry";
import { cellDisplay } from "@/lib/ats-engines/stages";
import type { AtsBatchResultCell, AtsEngineId } from "@/lib/ats-engines/types";
import { cn } from "@/lib/utils";

/** Engine identity: monogram + name, styled from the central ENGINE_BADGES map. */
export function EngineBadge({
  engineId,
  compact = false,
  className,
}: {
  engineId: AtsEngineId;
  /** Monogram only (name kept for screen readers and tooltip). */
  compact?: boolean;
  className?: string;
}) {
  const style = engineBadge(engineId);
  const name = getEngine(engineId)?.name ?? engineId;
  return (
    <Badge
      variant="outline"
      title={name}
      data-engine={engineId}
      className={cn(
        "h-5 max-w-full gap-1 px-1.5 text-[10px] font-medium",
        style.className,
        className,
      )}
    >
      <span aria-hidden className="font-mono text-[9px] font-semibold tracking-tight">
        {style.monogram}
      </span>
      {compact ? <span className="sr-only">{name}</span> : <span className="truncate">{name}</span>}
    </Badge>
  );
}

const TONE: Record<ReturnType<typeof cellDisplay>["tone"], string> = {
  muted: "text-muted-foreground",
  progress: "text-foreground",
  score: "text-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
};

/** Processing / outcome label — deliberately plain text, visually separate from engine badges. */
export function CellStatusLabel({ cell }: { cell: AtsBatchResultCell | undefined }) {
  const d = cellDisplay(cell);
  if (!d.label) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[10px]", TONE[d.tone])}
      title={d.title}
      role={d.tone === "progress" ? "status" : undefined}
      aria-live={d.tone === "progress" ? "polite" : undefined}
    >
      {d.tone === "progress" ? <Spinner className="size-3" /> : null}
      {d.label}
    </span>
  );
}
