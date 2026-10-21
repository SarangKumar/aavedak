"use client";

import { createRef, useMemo, useRef, type RefObject } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Beam, BeamNode } from "@/components/ui/beam";
import { getFlow } from "@/lib/about-flows";
import { cn } from "@/lib/utils";

/** Stagger between consecutive beams' first pulses, so each flow starts in order. */
const STEP_SECONDS = 0.3;

/**
 * One About-page flow as a beam diagram. Takes only the flow id (icons are components and
 * cannot cross the server/client boundary as props). Loops are dashed, skips and stops pulse
 * in a muted colour. Beams measure on the client only, so the server render and the first
 * client render match; the Vinyaas beam CSS stops the pulses under prefers-reduced-motion.
 */
export function AboutFlowDiagram({ flowId }: { flowId: string }) {
  const flow = getFlow(flowId);
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(
    () =>
      Object.fromEntries(
        (flow?.nodes ?? []).map((n) => [n.id, createRef<HTMLDivElement>()]),
      ) as Record<string, RefObject<HTMLDivElement | null>>,
    [flow],
  );
  if (!flow) return null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`${flow.title}: ${flow.shape}`}
      className={cn(
        "relative mx-auto grid w-full max-w-5xl items-start gap-x-3 gap-y-9 lg:gap-x-6 lg:gap-y-12",
        flow.grid,
      )}
    >
      {flow.nodes.map((node) => {
        const Icon = node.icon === "brand" ? null : node.icon;
        return (
          <div
            key={node.id}
            className={cn("flex flex-col items-center gap-2 text-center", node.place)}
          >
            <BeamNode
              ref={refs[node.id]}
              highlight={node.highlight}
              size="sm"
              className="lg:size-11 lg:[&_svg]:size-5"
            >
              {Icon ? (
                <Icon aria-hidden strokeWidth={1.75} />
              ) : (
                <BrandMark alt="" width={24} height={24} className="size-4 lg:size-5" />
              )}
            </BeamNode>
            {/* Opaque backing so beams pass under the label, not through it. */}
            <span className="bg-background/85 text-foreground relative z-10 max-w-[9rem] rounded-md px-1 py-0.5 text-[11px] font-medium leading-tight backdrop-blur-[2px] lg:text-[12px]">
              {node.label}
            </span>
          </div>
        );
      })}

      {/* After the nodes, so their refs are attached when the beams first measure. */}
      {flow.edges.map((edge, i) => (
        <Beam
          key={`${edge.from}-${edge.to}`}
          containerRef={containerRef}
          fromRef={refs[edge.from]}
          toRef={refs[edge.to]}
          shape="curve"
          pulse="dot"
          duration={2.6}
          delay={i * STEP_SECONDS}
          curvature={edge.curvature}
          track={edge.kind === "loop" ? "dashed" : "dotted"}
          arrow={edge.kind === "loop"}
          pulseColor={edge.kind === "branch" ? "var(--muted-foreground)" : undefined}
        />
      ))}
    </div>
  );
}
