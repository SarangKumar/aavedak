"use client";

import { EngineLabel } from "@/components/ats-engine-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";
import type { AtsEngineId } from "@/lib/ats-engines/types";
import { cn } from "@/lib/utils";

// Order mirrors the Final score's group order (lib/ats-engines/aggregate.ts).
const ENGINE_KINDS = ["native", "reference", "platform", "open_source"] as const;
type EngineKind = (typeof ENGINE_KINDS)[number];
const KIND_LABELS: Record<EngineKind, string> = {
  native: "Native",
  reference: "Reference",
  platform: "ATS platforms",
  open_source: "Open Source",
};
const ENGINE_IDS_BY_KIND: Record<EngineKind, AtsEngineId[]> = ENGINE_KINDS.reduce(
  (acc, kind) => {
    acc[kind] = ATS_ENGINES.filter((e) => e.kind === kind).map((e) => e.id);
    return acc;
  },
  {} as Record<EngineKind, AtsEngineId[]>,
);

/** The ATS engine picker (kind toggles + one card per engine), shared by the ATS and Improve pages. */
export function AtsEnginePicker({
  selected,
  onChange,
  disabled = false,
}: {
  selected: Set<AtsEngineId>;
  onChange: (next: Set<AtsEngineId>) => void;
  disabled?: boolean;
}) {
  const activeKinds = ENGINE_KINDS.filter((k) =>
    ENGINE_IDS_BY_KIND[k].every((id) => selected.has(id)),
  );
  function setKinds(kinds: string[]) {
    onChange(new Set(kinds.flatMap((k) => ENGINE_IDS_BY_KIND[k as EngineKind] ?? [])));
  }
  function toggle(id: AtsEngineId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }
  return (
    <>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-muted-foreground text-[11px] font-medium">Kind</span>
        <ToggleGroup
          aria-label="Select engines by kind"
          variant="outline"
          size="sm"
          spacing={1}
          multiple
          value={activeKinds}
          onValueChange={setKinds}
          disabled={disabled}
        >
          {ENGINE_KINDS.map((kind) => (
            <ToggleGroupItem
              key={kind}
              value={kind}
              className="h-7 rounded-full px-2.5 text-[11px]"
            >
              {KIND_LABELS[kind]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {/* Container query, not viewport: this picker also sits in the Jobs detail pane, whose width
          the user drags, so the card grid has to follow its own box rather than the screen. At the
          ATS and Improve pages' full width that still resolves to three columns. */}
      <div className="@container">
        <div className="@md:grid-cols-2 @2xl:grid-cols-3 grid grid-cols-1 gap-2">
          {ATS_ENGINES.map((eng) => {
            const checked = selected.has(eng.id);
            return (
              <Card
                key={eng.id}
                size="sm"
                className={cn(
                  "relative gap-2",
                  checked && "border-primary/40 bg-primary/5",
                  disabled && "opacity-60",
                )}
              >
                <div className="flex items-start gap-2">
                  <label
                    className={cn(
                      "flex min-w-0 flex-1 cursor-pointer flex-col gap-1",
                      disabled && "pointer-events-none",
                    )}
                  >
                    {/* Checkbox and title share one row so their centres line up. */}
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onChange={() => toggle(eng.id)}
                        disabled={disabled}
                        aria-label={`Select ${eng.name}`}
                      />
                      <EngineLabel engineId={eng.id} wrap />
                    </span>
                    <span className="text-muted-foreground block pl-6 text-[10px] leading-snug">
                      {eng.shortDescription}
                    </span>
                  </label>
                  <HoverCard>
                    <HoverCardTrigger>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-foreground mt-0.5 size-6 min-h-6 min-w-6 shrink-0"
                        aria-label={`How ${eng.name} scores`}
                        onClick={(e) => e.preventDefault()}
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden>
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
                          <path
                            d="M12 11v5"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                          />
                          <circle cx="12" cy="8" r="0.9" fill="currentColor" />
                        </svg>
                      </Button>
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="bottom"
                      align="end"
                      className="w-64 text-[11px] leading-relaxed"
                    >
                      <p className="text-foreground mb-1 font-medium">{eng.name} scoring</p>
                      <p className="text-muted-foreground text-pretty">{eng.algoBlurb}</p>
                      {eng.referenceRepo ? (
                        <p className="text-muted-foreground mt-1.5 text-[10px]">
                          Adapted from {eng.referenceRepo}
                        </p>
                      ) : null}
                    </HoverCardContent>
                  </HoverCard>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
