import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { getEngine } from "@/lib/ats-engines/registry";
import { cellDisplay } from "@/lib/ats-engines/stages";
import type { AtsBatchResultCell, AtsEngineId } from "@/lib/ats-engines/types";
import { cn } from "@/lib/utils";

const KIND: Record<string, { label: string; variant: BadgeVariant }> = {
  native: { label: "Native", variant: "engineNative" },
  open_source: { label: "OSS", variant: "engineOss" },
  reference: { label: "Ref", variant: "engineRef" },
};

/** Small Native / OSS / Ref tag — the only badge; engines are identified by name. */
export function EngineKindBadge({
  engineId,
  className,
}: {
  engineId: AtsEngineId;
  className?: string;
}) {
  const kind = KIND[getEngine(engineId)?.kind ?? "reference"] ?? KIND.reference;
  return (
    <Badge
      variant={kind.variant}
      className={cn("h-4 px-1.5 text-[9px] font-medium uppercase tracking-wide", className)}
    >
      {kind.label}
    </Badge>
  );
}

/** Engine name plus its kind tag — used in the selector, results table and detail view. */
export function EngineLabel({
  engineId,
  className,
  stacked = false,
}: {
  engineId: AtsEngineId;
  className?: string;
  /** Name above, tag below (for narrow table columns). */
  stacked?: boolean;
}) {
  const name = getEngine(engineId)?.name ?? engineId;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 gap-1",
        stacked ? "flex-col items-center" : "flex-wrap items-center gap-1.5",
        className,
      )}
    >
      <span className="text-foreground truncate text-[11px] font-medium">{name}</span>
      <EngineKindBadge engineId={engineId} />
    </span>
  );
}

const TONE: Record<ReturnType<typeof cellDisplay>["tone"], string> = {
  muted: "text-muted-foreground",
  progress: "text-foreground",
  score: "text-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
};

/** Processing / outcome label — plain text, kept separate from the engine name/tag. */
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
      {d.tone === "progress" ? <Spinner className="size-3" label="" /> : null}
      {d.label}
    </span>
  );
}
