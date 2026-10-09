"use client";

import { useState, type ReactNode } from "react";

import { Progress } from "@/components/ui/progress";
import type { AtsAnalysis, AtsIssue, AtsMode, AtsScores } from "@/lib/ats-types";
import { normalizeAtsIssues } from "@/lib/ats-types";
import { cn } from "@/lib/utils";

function AtsIssueList({ issues, className }: { issues: AtsIssue[]; className?: string }) {
  const rows = normalizeAtsIssues(issues);
  if (!rows.length) return null;
  return (
    <ul className={cn("space-y-2", className)}>
      {rows.map((issue) => (
        <li key={issue.code + issue.title} className="flex gap-2">
          <span className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden>
            ⚠
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-foreground text-[12px] font-medium leading-snug">{issue.title}</p>
            {issue.detail && issue.detail !== issue.title ? (
              <p className="text-muted-foreground text-[11px] leading-relaxed">{issue.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const SCORE_ROWS: Array<{ key: keyof AtsScores; label: string }> = [
  { key: "atsCompatibility", label: "ATS Compatibility" },
  { key: "requiredSkills", label: "Required Skills" },
  { key: "preferredSkills", label: "Preferred Skills" },
  { key: "experienceMatch", label: "Experience Match" },
  { key: "responsibilityMatch", label: "Responsibility Match" },
  { key: "keywordCoverage", label: "Keyword Coverage" },
  { key: "evidenceQuality", label: "Evidence Quality" },
  { key: "jobTitleMatch", label: "Job Title Match" },
  { key: "resumeQuality", label: "Resume Quality" },
  { key: "technicalSkills", label: "Technical Skills" },
  { key: "experienceQuality", label: "Experience Quality" },
  { key: "structureFormatting", label: "Structure & Formatting" },
];

export function points(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(score)))}`;
}

export function modeHint(mode: AtsMode): string {
  if (mode === "resume_only") return "Resume quality analysis";
  if (mode === "role_match") return "Role match analysis";
  return "Job match analysis";
}

function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={cn(
        "size-4 shrink-0 transition-transform duration-200",
        open && "rotate-180",
        className,
      )}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScoreBar({ value }: { value: number }) {
  return <Progress value={Math.max(0, Math.min(100, value))} max={100} className="h-1.5" />;
}

function DimensionRow({
  label,
  value,
  detail,
  open,
  onToggle,
}: {
  label: string;
  value: number;
  detail?: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-border/50 border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-muted/30 flex w-full cursor-pointer items-center gap-3 px-0 py-2 text-left"
      >
        <span className="text-foreground min-w-0 flex-1 text-[12px] font-medium">{label}</span>
        <span className="text-foreground w-8 text-right font-mono text-[12px] tabular-nums">
          {points(value)}
        </span>
        <div className="w-24 shrink-0 sm:w-32">
          <ScoreBar value={value} />
        </div>
        <Chevron open={open} className="text-muted-foreground size-3.5" />
      </button>
      {open && detail ? (
        <div className="text-muted-foreground pb-2.5 pl-0 text-[11px] leading-relaxed">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function SkillLists({
  analysis,
  dimension,
}: {
  analysis: AtsAnalysis;
  dimension: keyof AtsScores;
}) {
  if (
    dimension === "requiredSkills" ||
    dimension === "preferredSkills" ||
    dimension === "keywordCoverage"
  ) {
    const matched = analysis.matchedSkills;
    const partial = analysis.partialSkills;
    const missing = analysis.missingSkills;
    return (
      <div className="space-y-2">
        {matched.length ? (
          <div>
            <p className="text-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
              Matched
            </p>
            <ul className="space-y-1">
              {matched.slice(0, 8).map((s) => (
                <li key={s.skill}>
                  ✓ {s.skill}
                  {s.evidence ? (
                    <span className="text-muted-foreground mt-0.5 block pl-3 italic">
                      “{s.evidence.slice(0, 120)}
                      {s.evidence.length > 120 ? "…" : ""}”
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {partial.length ? (
          <div>
            <p className="text-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
              Partial
            </p>
            <ul className="space-y-0.5">
              {partial.slice(0, 6).map((s) => (
                <li key={s.skill}>⚠ {s.skill}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {missing.length ? (
          <div>
            <p className="text-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
              Missing
            </p>
            <ul className="space-y-0.5">
              {missing.slice(0, 6).map((s) => (
                <li key={s.skill}>✗ {s.skill}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  if (dimension === "responsibilityMatch") {
    return (
      <ul className="space-y-1">
        {analysis.matchedResponsibilities.map((r) => (
          <li key={r.text}>✓ {r.text}</li>
        ))}
        {analysis.partialResponsibilities.map((r) => (
          <li key={r.text}>⚠ {r.text}</li>
        ))}
        {analysis.missingResponsibilities.map((r) => (
          <li key={r.text}>✗ {r.text}</li>
        ))}
        {!analysis.matchedResponsibilities.length &&
        !analysis.partialResponsibilities.length &&
        !analysis.missingResponsibilities.length ? (
          <li>No explicit responsibilities extracted from the JD.</li>
        ) : null}
      </ul>
    );
  }

  if (dimension === "atsCompatibility" || dimension === "structureFormatting") {
    if (analysis.atsIssues.length) {
      return <AtsIssueList issues={analysis.atsIssues} className="text-[12px]" />;
    }
    return (
      <ul className="space-y-0.5">
        {analysis.strengths.slice(0, 4).map((s) => (
          <li key={s}>✓ {s}</li>
        ))}
      </ul>
    );
  }

  return (
    <p>
      Part of the transparent weighted model for this analysis mode. See strengths and improvements
      below for actionable detail.
    </p>
  );
}

export function AnalysisDetails({ analysis }: { analysis: AtsAnalysis }) {
  const [openDim, setOpenDim] = useState<string | null>(null);
  const applicable = SCORE_ROWS.filter((row) => {
    const v = analysis.scores[row.key];
    return typeof v === "number";
  });

  // Resume-only: hide job-match rows even if somehow set
  const rows =
    analysis.mode === "resume_only"
      ? applicable.filter((r) =>
          [
            "atsCompatibility",
            "resumeQuality",
            "technicalSkills",
            "experienceQuality",
            "evidenceQuality",
            "structureFormatting",
          ].includes(r.key),
        )
      : applicable.filter(
          (r) => !["technicalSkills", "experienceQuality", "structureFormatting"].includes(r.key),
        );

  const hasInsights =
    analysis.strengths.length > 0 ||
    analysis.missingSkills.length > 0 ||
    analysis.partialSkills.length > 0 ||
    analysis.improvements.length > 0 ||
    analysis.atsIssues.length > 0;

  return (
    <div className="border-border/60 mt-3 space-y-4 border-t pt-3 md:space-y-5">
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-foreground text-[12px] font-semibold tracking-tight md:text-[13px]">
              {analysis.scoreLabel}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
              {analysis.scoreName}
              {analysis.targetTitle ? ` · ${analysis.targetTitle}` : ""}
            </p>
          </div>
          <p className="text-foreground shrink-0 font-mono text-[15px] font-semibold tabular-nums">
            {points(analysis.overallScore)}
            <span className="text-muted-foreground text-[11px] font-medium"> / 100</span>
          </p>
        </div>
        <ScoreBar value={analysis.overallScore} />
        {analysis.notes?.length ? (
          <p className="text-muted-foreground text-[11px] leading-relaxed">{analysis.notes[0]}</p>
        ) : null}
        {analysis.blurb ? (
          <p className="text-muted-foreground hidden text-[10px] leading-relaxed md:block">
            {analysis.blurb}
          </p>
        ) : null}
        {analysis.textChars != null ? (
          <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
            text {analysis.textChars} chars
            {analysis.textFingerprint ? ` · fp ${analysis.textFingerprint}` : ""}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          "space-y-4",
          hasInsights && "md:grid md:grid-cols-2 md:items-start md:gap-x-8 md:gap-y-5 md:space-y-0",
        )}
      >
        <div className="min-w-0">
          <p className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
            Breakdown
          </p>
          <div>
            {rows.map((row) => {
              const value = analysis.scores[row.key] as number;
              const open = openDim === row.key;
              return (
                <DimensionRow
                  key={row.key}
                  label={row.label}
                  value={value}
                  open={open}
                  onToggle={() => setOpenDim(open ? null : row.key)}
                  detail={open ? <SkillLists analysis={analysis} dimension={row.key} /> : null}
                />
              );
            })}
          </div>
        </div>

        {hasInsights ? (
          <div className="min-w-0 space-y-4 md:space-y-5">
            {analysis.strengths.length ? (
              <div>
                <p className="text-foreground mb-1.5 text-[12px] font-semibold">Strengths</p>
                <ul className="text-muted-foreground grid gap-1 text-[12px] sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                  {analysis.strengths.map((s) => (
                    <li key={s}>✓ {s}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.missingSkills.length || analysis.partialSkills.length ? (
              <div>
                <p className="text-foreground mb-1.5 text-[12px] font-semibold">
                  Missing / weak requirements
                </p>
                <ul className="text-muted-foreground grid gap-1 text-[12px] sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                  {analysis.partialSkills.slice(0, 6).map((s) => (
                    <li key={`p-${s.skill}`} className="flex justify-between gap-2">
                      <span className="truncate">{s.skill}</span>
                      <span className="text-[10px] uppercase tracking-wide">Partial</span>
                    </li>
                  ))}
                  {analysis.missingSkills.slice(0, 6).map((s) => (
                    <li key={`m-${s.skill}`} className="flex justify-between gap-2">
                      <span className="truncate">{s.skill}</span>
                      <span className="text-[10px] uppercase tracking-wide">Missing</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.improvements.length ? (
              <div>
                <p className="text-foreground mb-1.5 text-[12px] font-semibold">Improvements</p>
                <div className="space-y-2.5">
                  {(["high", "medium", "low"] as const).map((priority) => {
                    const items = analysis.improvements.filter((i) => i.priority === priority);
                    if (!items.length) return null;
                    return (
                      <div key={priority}>
                        <p className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
                          {priority} impact
                        </p>
                        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-4 text-[12px]">
                          {items.map((i) => (
                            <li key={i.text}>
                              {i.text}
                              <span className="mt-0.5 block text-[10px] opacity-80">
                                {i.reason}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {analysis.atsIssues.length ? (
              <div>
                <p className="text-foreground mb-1.5 text-[12px] font-semibold">ATS issues</p>
                <AtsIssueList issues={analysis.atsIssues} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ScoringGuideContent() {
  const modes = [
    {
      title: "Resume only",
      score: "Resume Quality Score",
      body: "Parseability, impact metrics, structure, and evidence — no job description required.",
    },
    {
      title: "Role / title",
      score: "Role Match Score",
      body: "Compared against a transparent role skill profile. Core skills are weighted higher than optional ones.",
    },
    {
      title: "Role + JD",
      score: "ATS Match Score",
      body: "Weighted toward required hard skills, experience, responsibilities, evidence, and title alignment. Missing categories redistribute weight — they are not zero-filled.",
    },
  ] as const;

  return (
    <div className="space-y-4 text-[12px] leading-relaxed md:space-y-5">
      <p className="text-muted-foreground max-w-3xl">
        Scores are out of <span className="text-foreground font-medium">100</span> and calculated
        from structured signals — not a black-box “ATS oracle.” We do not claim this is the score
        used by Workday, Greenhouse, Taleo, or any proprietary scanner.
      </p>
      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        {modes.map((mode) => (
          <div
            key={mode.title}
            className="border-border/70 bg-background/40 rounded-xl border px-3.5 py-3 md:min-h-[8.5rem]"
          >
            <p className="text-foreground text-[12px] font-semibold tracking-tight">{mode.title}</p>
            <p className="text-primary mt-1 text-[11px] font-medium">{mode.score}</p>
            <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">{mode.body}</p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-[11px] md:max-w-3xl">
        Hard skills and demonstrated evidence outweigh keyword lists. Repetition / stuffing does not
        raise the score. Improvements never ask you to invent experience you don’t have.
      </p>
    </div>
  );
}
