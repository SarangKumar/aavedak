"use client";

import Link from "next/link";
import { createRef, useMemo, useRef, type ReactNode, type RefObject } from "react";

import { Beam, BeamNode } from "@/components/ui/beam";

type StepId =
  | "onboarding"
  | "resume"
  | "dashboard"
  | "openings"
  | "cover"
  | "ats"
  | "refine"
  | "referrals"
  | "apply"
  | "track"
  | "followup";

type Step = {
  id: StepId;
  title: string;
  href: string;
  icon: ReactNode;
  /** Grid placement: 3 columns × 5 rows on phones, 5 stage columns on desktop (rows 2–4). */
  place: string;
  highlight?: boolean;
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const STEPS: Step[] = [
  {
    id: "onboarding",
    title: "Onboarding",
    href: "/onboarding",
    place: "col-start-1 row-start-1 lg:col-start-1 lg:row-start-2",
    icon: (
      <Icon>
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </Icon>
    ),
  },
  {
    id: "resume",
    title: "Upload resume",
    href: "/documents",
    place: "col-start-3 row-start-1 lg:col-start-1 lg:row-start-4",
    icon: (
      <Icon>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M12 17v-6M9.5 13.5 12 11l2.5 2.5" />
      </Icon>
    ),
  },
  {
    id: "dashboard",
    title: "Dashboard",
    href: "/dashboard",
    place: "col-start-1 row-start-2 lg:col-start-2 lg:row-start-2",
    icon: (
      <Icon>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </Icon>
    ),
  },
  {
    id: "openings",
    title: "Find openings",
    href: "/jobs",
    place: "col-start-2 row-start-2 lg:col-start-2 lg:row-start-3",
    highlight: true,
    icon: (
      <Icon>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.2-4.2" />
      </Icon>
    ),
  },
  {
    id: "cover",
    title: "Cover letter",
    href: "/documents",
    place: "col-start-1 row-start-3 lg:col-start-3 lg:row-start-2",
    icon: (
      <Icon>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </Icon>
    ),
  },
  {
    id: "ats",
    title: "ATS check",
    href: "/ats",
    place: "col-start-2 row-start-3 lg:col-start-3 lg:row-start-3",
    icon: (
      <Icon>
        <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
        <path d="m12 13 3.5-4" />
        <circle cx="12" cy="13" r="1" />
      </Icon>
    ),
  },
  {
    id: "refine",
    title: "Refine resume",
    href: "/documents",
    place: "col-start-3 row-start-3 lg:col-start-3 lg:row-start-4",
    icon: (
      <Icon>
        <path d="M12 20h8" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </Icon>
    ),
  },
  {
    id: "referrals",
    title: "Referrals",
    href: "/referrals",
    place: "col-start-1 row-start-4 lg:col-start-4 lg:row-start-2",
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.1" />
      </Icon>
    ),
  },
  {
    id: "apply",
    title: "Apply",
    href: "/jobs",
    place: "col-start-2 row-start-4 lg:col-start-4 lg:row-start-3",
    highlight: true,
    icon: (
      <Icon>
        <path d="M21 3 10 14" />
        <path d="m21 3-7 18-4-7-7-4z" />
      </Icon>
    ),
  },
  {
    id: "track",
    title: "Track",
    href: "/job-tracker",
    place: "col-start-2 row-start-5 lg:col-start-5 lg:row-start-3",
    icon: (
      <Icon>
        <rect x="3" y="4" width="5" height="16" rx="1.5" />
        <rect x="10" y="4" width="5" height="11" rx="1.5" />
        <rect x="17" y="4" width="4" height="7" rx="1.5" />
      </Icon>
    ),
  },
  {
    id: "followup",
    title: "Follow up",
    href: "/follow-ups",
    place: "col-start-3 row-start-5 lg:col-start-5 lg:row-start-2",
    icon: (
      <Icon>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
      </Icon>
    ),
  },
];

/** Beams in flow order; `delay` staggers the first pulses so the flow reads left to right. */
const EDGES: Array<{
  from: StepId;
  to: StepId;
  delay: number;
  curvature?: number;
  /** Loop-back edges (repeat a step) are dashed; forward edges dotted. */
  loop?: boolean;
}> = [
  // Onboarding sets up the dashboard, where new matches surface each day.
  { from: "onboarding", to: "dashboard", delay: 0 },
  { from: "dashboard", to: "openings", delay: 0.5 },
  { from: "resume", to: "openings", delay: 0.2 },
  { from: "openings", to: "cover", delay: 0.9 },
  { from: "openings", to: "ats", delay: 1 },
  { from: "openings", to: "referrals", delay: 1.1 },
  // ATS ⇄ refine: a loop, re-check until the score is where you want it.
  { from: "ats", to: "refine", delay: 1.8, curvature: 10 },
  { from: "refine", to: "ats", delay: 2.8, curvature: 10, loop: true },
  { from: "cover", to: "apply", delay: 1.9 },
  { from: "refine", to: "apply", delay: 2.4 },
  { from: "referrals", to: "apply", delay: 2 },
  { from: "apply", to: "track", delay: 2.9 },
  // Track ⇄ follow up: nudges until there is a reply.
  { from: "track", to: "followup", delay: 3.6, curvature: 10 },
  { from: "followup", to: "track", delay: 4.4, curvature: 10, loop: true },
];

const STAGES = ["Set up", "Discover", "Prepare", "Reach out & apply", "Follow through"];

/** Homepage "how it works": the job-search loop as a beam diagram of linked steps. */
export function HomeFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useMemo(
    () =>
      Object.fromEntries(STEPS.map((s) => [s.id, createRef<HTMLDivElement>()])) as Record<
        StepId,
        RefObject<HTMLDivElement | null>
      >,
    [],
  );

  return (
    <div
      ref={containerRef}
      className="relative grid grid-cols-3 gap-x-2 gap-y-7 lg:grid-cols-5 lg:grid-rows-[auto_repeat(3,minmax(0,1fr))] lg:gap-x-4 lg:gap-y-8"
    >
      {STAGES.map((stage, i) => (
        <p
          key={stage}
          className="text-muted-foreground row-start-1 hidden text-center font-mono text-[10px] font-semibold uppercase tracking-wider lg:block"
          style={{ gridColumnStart: i + 1 }}
        >
          <span className="text-primary">{String(i + 1).padStart(2, "0")}</span> {stage}
        </p>
      ))}

      {STEPS.map((step) => (
        <Link
          key={step.id}
          href={step.href}
          className={`group relative flex flex-col items-center gap-2 text-center ${step.place}`}
        >
          <BeamNode
            ref={nodeRefs[step.id]}
            highlight={step.highlight}
            className="group-hover:border-primary/60 group-hover:text-primary group-focus-visible:ring-ring/50 group-focus-visible:ring-2"
          >
            {step.icon}
          </BeamNode>
          {/* Opaque backing so beams pass under the title, not through it. */}
          <span className="bg-background/85 text-foreground group-hover:text-primary relative z-10 rounded-md px-1.5 py-0.5 text-[12px] font-semibold leading-tight backdrop-blur-[2px] transition-colors sm:text-[13px]">
            {step.title}
          </span>
        </Link>
      ))}

      {/* After the nodes, so their refs are attached when the beams first measure. The
          nodes (z-10) still paint above the beams. */}
      {EDGES.map((edge) => (
        <Beam
          key={`${edge.from}-${edge.to}`}
          containerRef={containerRef}
          fromRef={nodeRefs[edge.from]}
          toRef={nodeRefs[edge.to]}
          delay={edge.delay}
          curvature={edge.curvature}
          track={edge.loop ? "dashed" : "dotted"}
          shape="curve"
          pulse="dot"
          duration={2.6}
        />
      ))}
    </div>
  );
}
