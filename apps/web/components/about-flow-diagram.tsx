"use client";

import { Briefcase, Building2, type LucideIcon } from "lucide-react";
import { useRef } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Beam, BeamNode } from "@/components/ui/beam";
import { FEATURES } from "@/lib/features";
import { cn } from "@/lib/utils";

type FlowNode = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Literal grid placement (Tailwind needs whole class names): 4 across on phones, 3 columns on desktop. */
  place: string;
};

const SOURCES: FlowNode[] = [
  {
    id: "careers",
    label: "Company careers pages",
    icon: Building2,
    place: "col-start-1 row-start-1 lg:col-start-1 lg:row-start-1",
  },
  {
    id: "boards",
    label: "Job boards (fallback)",
    icon: Briefcase,
    place: "col-start-2 row-start-1 lg:col-start-1 lg:row-start-2",
  },
  {
    id: "people",
    label: "Company sites & GitHub",
    icon: FEATURES.people.icon,
    place: "col-start-3 row-start-1 lg:col-start-1 lg:row-start-3",
  },
  {
    id: "resume",
    label: "Your resume & profile",
    icon: FEATURES.resumes.icon,
    place: "col-start-4 row-start-1 lg:col-start-1 lg:row-start-4",
  },
];

const OUTPUTS: FlowNode[] = [
  {
    id: "jobs",
    label: "Matched jobs",
    icon: FEATURES.jobs.icon,
    place: "col-start-1 row-start-3 lg:col-start-3 lg:row-start-1",
  },
  {
    id: "improve",
    label: "ATS scores & improved resume",
    icon: FEATURES.improveResume.icon,
    place: "col-start-2 row-start-3 lg:col-start-3 lg:row-start-2",
  },
  {
    id: "referrals",
    label: "Referrals & emails",
    icon: FEATURES.referrals.icon,
    place: "col-start-3 row-start-3 lg:col-start-3 lg:row-start-3",
  },
  {
    id: "tracker",
    label: "Tracker & dashboard",
    icon: FEATURES.tracker.icon,
    place: "col-start-4 row-start-3 lg:col-start-3 lg:row-start-4",
  },
];

function Node({
  node,
  side,
  nodeRef,
}: {
  node: FlowNode;
  side: "source" | "output";
  nodeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const Icon = node.icon;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 text-center",
        side === "source"
          ? "lg:flex-row-reverse lg:justify-start lg:text-right"
          : "lg:flex-row lg:text-left",
        node.place,
      )}
    >
      <BeamNode ref={nodeRef} size="sm" className="lg:size-11 lg:[&_svg]:size-5">
        <Icon aria-hidden strokeWidth={1.75} />
      </BeamNode>
      {/* Opaque backing so beams pass under the label, not through it. */}
      <span className="bg-background/85 text-foreground relative z-10 rounded-md px-1 py-0.5 text-[11px] font-medium leading-tight backdrop-blur-[2px] sm:text-[12px] lg:text-[13px]">
        {node.label}
      </span>
    </div>
  );
}

/**
 * About page "How it works" diagram: what Aavedak reads (left / top) beams into Aavedak,
 * which beams out what you get (right / bottom). Beams measure on the client only, so the
 * server and first client render match (no SVG until mounted).
 */
export function AboutFlowDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const sourceRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];
  const outputRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Company careers pages, job boards as a fallback, company sites and GitHub, and your resume flow into Aavedak, which gives you matched jobs, ATS scores and an improved resume, referrals and emails, and a tracker and dashboard."
      className="relative mx-auto grid w-full max-w-3xl grid-cols-4 items-start gap-x-2 gap-y-14 lg:grid-cols-[1fr_auto_1fr] lg:grid-rows-4 lg:items-center lg:gap-x-24 lg:gap-y-6"
    >
      {SOURCES.map((node, i) => (
        <Node key={node.id} node={node} side="source" nodeRef={sourceRefs[i]} />
      ))}

      <div className="col-span-4 col-start-1 row-start-2 flex flex-col items-center gap-2 lg:col-span-1 lg:col-start-2 lg:row-span-4 lg:row-start-1">
        <BeamNode ref={centerRef} size="lg" highlight className="lg:size-20">
          <BrandMark alt="" width={40} height={40} className="size-7 lg:size-10" />
        </BeamNode>
        <span className="bg-background/85 text-foreground relative z-10 rounded-md px-1.5 py-0.5 text-[13px] font-semibold backdrop-blur-[2px]">
          Aavedak
        </span>
      </div>

      {OUTPUTS.map((node, i) => (
        <Node key={node.id} node={node} side="output" nodeRef={outputRefs[i]} />
      ))}

      {/* After the nodes, so their refs are attached when the beams first measure. */}
      {SOURCES.map((node, i) => (
        <Beam
          key={`in-${node.id}`}
          containerRef={containerRef}
          fromRef={sourceRefs[i]}
          toRef={centerRef}
          shape="curve"
          pulse="dot"
          duration={2.6}
          delay={i * 0.3}
        />
      ))}
      {OUTPUTS.map((node, i) => (
        <Beam
          key={`out-${node.id}`}
          containerRef={containerRef}
          fromRef={centerRef}
          toRef={outputRefs[i]}
          shape="curve"
          pulse="dot"
          duration={2.6}
          delay={1.3 + i * 0.3}
        />
      ))}
    </div>
  );
}
