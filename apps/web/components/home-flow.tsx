"use client";

import Link from "next/link";
import { createRef, useMemo, useRef, type RefObject } from "react";

import { Beam, BeamNode } from "@/components/ui/beam";
import { FEATURES, type FeatureKey } from "@/lib/features";

type StepId =
  | "onboarding"
  | "resume"
  | "create"
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
  feature: FeatureKey;
  /** Grid placement: 3 columns × 5 rows on phones, 5 stage columns on desktop (rows 2–4). */
  place: string;
  highlight?: boolean;
};

function StepIcon({ feature }: { feature: FeatureKey }) {
  const Icon = FEATURES[feature].icon;
  return <Icon aria-hidden strokeWidth={1.75} />;
}

const STEPS: Step[] = [
  {
    id: "onboarding",
    feature: "onboarding",
    title: "Onboarding",
    href: "/onboarding",
    place: "col-start-1 row-start-1 lg:col-start-1 lg:row-start-2",
  },
  {
    id: "resume",
    feature: "uploadResume",
    title: FEATURES.uploadResume.label,
    href: FEATURES.uploadResume.href,
    place: "col-start-3 row-start-1 lg:col-start-1 lg:row-start-4",
  },
  {
    id: "create",
    feature: "createResume",
    title: FEATURES.createResume.label,
    href: FEATURES.createResume.href,
    place: "col-start-3 row-start-2 lg:col-start-1 lg:row-start-3",
  },
  {
    id: "dashboard",
    feature: "dashboard",
    title: "Dashboard",
    href: "/dashboard",
    place: "col-start-1 row-start-2 lg:col-start-2 lg:row-start-2",
  },
  {
    id: "openings",
    feature: "jobs",
    title: "Find openings",
    href: "/jobs",
    place: "col-start-2 row-start-2 lg:col-start-2 lg:row-start-3",
    highlight: true,
  },
  {
    id: "cover",
    feature: "coverLetters",
    title: FEATURES.coverLetters.label,
    href: FEATURES.coverLetters.href,
    place: "col-start-1 row-start-3 lg:col-start-3 lg:row-start-2",
  },
  {
    id: "ats",
    feature: "resumeScore",
    title: FEATURES.resumeScore.label,
    href: FEATURES.resumeScore.href,
    place: "col-start-2 row-start-3 lg:col-start-3 lg:row-start-3",
  },
  {
    id: "refine",
    feature: "improveResume",
    title: FEATURES.improveResume.label,
    href: FEATURES.improveResume.href,
    place: "col-start-3 row-start-3 lg:col-start-3 lg:row-start-4",
  },
  {
    id: "referrals",
    feature: "referrals",
    title: "Referrals",
    href: "/referrals",
    place: "col-start-1 row-start-4 lg:col-start-4 lg:row-start-2",
  },
  {
    id: "apply",
    feature: "apply",
    title: "Apply",
    href: "/jobs",
    place: "col-start-2 row-start-4 lg:col-start-4 lg:row-start-3",
    highlight: true,
  },
  {
    id: "track",
    feature: "tracker",
    title: "Track",
    href: "/job-tracker",
    place: "col-start-2 row-start-5 lg:col-start-5 lg:row-start-3",
  },
  {
    id: "followup",
    feature: "followUps",
    title: "Follow up",
    href: "/follow-ups",
    place: "col-start-3 row-start-5 lg:col-start-5 lg:row-start-2",
  },
];

/** Beams in flow order; `delay` staggers the first pulses so the flow reads left to right. */
const EDGES: Array<{
  from: StepId;
  to: StepId;
  delay: number;
  curvature?: number;
}> = [
  // Onboarding sets up the dashboard, where new matches surface each day.
  { from: "onboarding", to: "dashboard", delay: 0 },
  { from: "dashboard", to: "openings", delay: 0.5 },
  { from: "resume", to: "openings", delay: 0.2 },
  { from: "create", to: "openings", delay: 0.3 },
  { from: "create", to: "ats", delay: 1.05 },
  { from: "openings", to: "cover", delay: 0.9 },
  { from: "openings", to: "ats", delay: 1 },
  { from: "openings", to: "referrals", delay: 1.1 },
  // ATS ⇄ refine: a loop, re-check until the score is where you want it.
  { from: "ats", to: "refine", delay: 1.8, curvature: 10 },
  { from: "refine", to: "ats", delay: 2.8, curvature: 10 },
  { from: "cover", to: "apply", delay: 1.9 },
  { from: "refine", to: "apply", delay: 2.4 },
  { from: "referrals", to: "apply", delay: 2 },
  { from: "apply", to: "track", delay: 2.9 },
  // Track ⇄ follow up: nudges until there is a reply.
  { from: "track", to: "followup", delay: 3.6, curvature: 10 },
  { from: "followup", to: "track", delay: 4.4, curvature: 10 },
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
            <StepIcon feature={step.feature} />
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
          track="dotted"
          shape="curve"
          pulse="dot"
          duration={2.6}
        />
      ))}
    </div>
  );
}
