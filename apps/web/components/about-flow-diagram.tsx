"use client";

import { createRef, useMemo, useRef, type RefObject } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Beam, BeamNode } from "@/components/ui/beam";
import { FLOW_STAGES, type FlowStageId } from "@/lib/about-flow";
import { cn } from "@/lib/utils";

/** Stagger between consecutive beams' first pulses, so the flow starts in order. */
const STEP_SECONDS = 0.35;

/**
 * About page data-flow diagram: the ten stages a piece of data passes through, linked by
 * beams whose pulses start one after another so the flow reads in order. Beams measure on
 * the client only (no SVG in the server render), so hydration matches; the Vinyaas beam CSS
 * stops the pulses under prefers-reduced-motion.
 */
export function AboutFlowDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(
    () =>
      Object.fromEntries(FLOW_STAGES.map((s) => [s.id, createRef<HTMLDivElement>()])) as Record<
        FlowStageId,
        RefObject<HTMLDivElement | null>
      >,
    [],
  );

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Data flow: ${FLOW_STAGES.map((s, i) => `${i + 1}. ${s.label}`).join(", ")}.`}
      className="relative mx-auto grid w-full max-w-4xl grid-cols-1 gap-y-6 lg:grid-cols-5 lg:grid-rows-2 lg:gap-x-4 lg:gap-y-16"
    >
      {FLOW_STAGES.map((stage, i) => {
        const Icon = stage.icon === "brand" ? null : stage.icon;
        return (
          <div
            key={stage.id}
            className={cn(
              "col-start-1 flex items-center gap-3 lg:flex-col lg:gap-2 lg:text-center",
              stage.place,
            )}
          >
            <BeamNode ref={refs[stage.id]} highlight={stage.icon === "brand"} size="default">
              {Icon ? (
                <Icon aria-hidden strokeWidth={1.75} />
              ) : (
                <BrandMark alt="" width={24} height={24} className="size-5" />
              )}
            </BeamNode>
            {/* Opaque backing so beams pass under the label, not through it. */}
            <span className="bg-background/85 relative z-10 rounded-md px-1 py-0.5 text-[12px] leading-tight backdrop-blur-[2px] sm:text-[13px]">
              <span className="text-primary mr-1 font-mono text-[11px] font-semibold">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-foreground font-medium">{stage.label}</span>
            </span>
          </div>
        );
      })}

      {/* After the nodes, so their refs are attached when the beams first measure. */}
      {FLOW_STAGES.slice(1).map((stage, i) => (
        <Beam
          key={`${FLOW_STAGES[i].id}-${stage.id}`}
          containerRef={containerRef}
          fromRef={refs[FLOW_STAGES[i].id]}
          toRef={refs[stage.id]}
          shape="curve"
          pulse="dot"
          duration={2.6}
          delay={i * STEP_SECONDS}
        />
      ))}
    </div>
  );
}
