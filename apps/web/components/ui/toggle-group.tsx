"use client";

import { cn } from "@/lib/utils";

/**
 * Multi-select toggle chips (local Vinyaas-style component — the registry has no toggle
 * group; see components/ui/.vinyaas). Pressed items get a primary border, not a fill, so the
 * label keeps full contrast. An empty selection means "no filter".
 */
export type ToggleGroupItem<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

export function ToggleGroup<T extends string>({
  items,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: {
  items: ToggleGroupItem<T>[];
  value: ReadonlySet<T>;
  onValueChange: (next: Set<T>) => void;
  className?: string;
  "aria-label": string;
}) {
  function toggle(item: T) {
    const next = new Set(value);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onValueChange(next);
  }

  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap gap-1", className)}>
      {items.map((item) => {
        const pressed = value.has(item.value);
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => toggle(item.value)}
            className={cn(
              "focus-visible:ring-ring inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
              pressed
                ? "border-primary text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="tabular-nums opacity-70">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
