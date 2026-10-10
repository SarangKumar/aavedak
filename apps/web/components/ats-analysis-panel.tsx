"use client";

import { useState, type ReactNode } from "react";

import { Progress } from "@/components/ui/progress";
import type { AtsAnalysis, AtsFinding, AtsIssue, AtsMode, AtsScores } from "@/lib/ats-types";
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
            <p className="text-foreground text-[13px] font-medium leading-snug">{issue.title}</p>
            {issue.detail && issue.detail !== issue.title ? (
              <p className="text-muted-foreground text-[12px] leading-relaxed">{issue.detail}</p>
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
        <span className="text-foreground min-w-0 flex-1 text-[13px] font-medium">{label}</span>
        <span className="text-foreground w-8 text-right font-mono text-[13px] tabular-nums">
          {points(value)}
        </span>
        <div className="w-24 shrink-0 sm:w-32">
          <ScoreBar value={value} />
        </div>
        <Chevron open={open} className="text-muted-foreground size-3.5" />
      </button>
      {open && detail ? (
        <div className="text-muted-foreground pb-2.5 pl-0 text-[12px] leading-relaxed">
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
    const matched = analysis.matchedSkills ?? [];
    const partial = analysis.partialSkills ?? [];
    const missing = analysis.missingSkills ?? [];
    return (
      <div className="space-y-2">
        {matched.length ? (
          <div>
            <p className="text-foreground mb-1 text-[11px] font-semibold uppercase tracking-wide">
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
            <p className="text-foreground mb-1 text-[11px] font-semibold uppercase tracking-wide">
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
            <p className="text-foreground mb-1 text-[11px] font-semibold uppercase tracking-wide">
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
    const matched = analysis.matchedResponsibilities ?? [];
    const partial = analysis.partialResponsibilities ?? [];
    const missing = analysis.missingResponsibilities ?? [];
    return (
      <ul className="space-y-1">
        {matched.map((r) => (
          <li key={r.text}>✓ {r.text}</li>
        ))}
        {partial.map((r) => (
          <li key={r.text}>⚠ {r.text}</li>
        ))}
        {missing.map((r) => (
          <li key={r.text}>✗ {r.text}</li>
        ))}
        {!matched.length && !partial.length && !missing.length ? (
          <li>No explicit responsibilities extracted from the JD.</li>
        ) : null}
      </ul>
    );
  }

  if (dimension === "atsCompatibility" || dimension === "structureFormatting") {
    const issues = analysis.atsIssues ?? [];
    if (issues.length) {
      return <AtsIssueList issues={issues} className="text-[13px]" />;
    }
    return (
      <ul className="space-y-0.5">
        {(analysis.strengths ?? []).slice(0, 4).map((s) => (
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

const SEVERITY_ORDER: AtsFinding["severity"][] = ["critical", "high", "medium", "low", "info"];
const SEVERITY_BADGE: Record<AtsFinding["severity"], string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-border bg-muted text-muted-foreground",
  info: "border-border bg-muted text-muted-foreground",
};

function pct(weight: number | undefined) {
  return weight == null ? "" : `${Math.round(weight * 1000) / 10}%`;
}

/** Titled section with a thin rule — one clear block per kind of detail. */
function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h4 className="text-foreground text-[11px] font-semibold uppercase tracking-wide">
          {title}
        </h4>
        {aside && <span className="text-muted-foreground text-[11px]">({aside})</span>}
      </div>
      {children}
    </section>
  );
}

/** Thin magnitude bar for a breakdown row (0–100). */
function MiniBar({ value }: { value: number }) {
  return (
    <div className="bg-border/60 h-1.5 w-full overflow-hidden rounded-full">
      <div
        className="bg-foreground/60 h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function SeverityPill({ severity }: { severity: AtsFinding["severity"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        SEVERITY_BADGE[severity],
      )}
    >
      {severity}
    </span>
  );
}

function Chip({ tone, children }: { tone: "matched" | "missing"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        tone === "matched"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {tone === "matched" ? "✓" : "✗"} {children}
    </span>
  );
}

/**
 * Engine-specific explainability, laid out as full-width rows: breakdown, strengths,
 * skills, findings-with-fixes, metrics, then methodology. Findings carry their own fix,
 * so the generic improvements list is not shown again for these engines.
 */
function EngineReport({ analysis }: { analysis: AtsAnalysis }) {
  const breakdown = analysis.breakdown ?? [];
  const metrics = analysis.metrics ?? [];
  const categories = analysis.skillCategories ?? [];
  const limitations = analysis.limitations ?? [];
  const warnings = analysis.warnings ?? [];
  const strengths = analysis.strengths ?? [];
  const matched = (analysis.matchedSkills ?? []).map((s) => s.skill).filter(Boolean);
  const missing = (analysis.missingSkills ?? []).map((s) => s.skill).filter(Boolean);
  const findings = [...(analysis.findings ?? [])].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const fixFor = (id: string) =>
    (analysis.improvements ?? []).find((i) => i.findingId === id)?.text;

  const rowSecondary = (row: NonNullable<AtsAnalysis["breakdown"]>[number]) => {
    if (row.maxPoints != null)
      return `${row.points != null ? `${row.points > 0 ? "+" : ""}${row.points}` : "—"} / ${row.maxPoints} pts`;
    if (row.weight != null)
      return `${pct(row.weight)}${row.contribution != null ? ` · +${row.contribution.toFixed(1)}` : ""}`;
    if (row.points != null) return `${row.points > 0 ? "+" : ""}${row.points} pts`;
    return "";
  };

  return (
    <div className="space-y-5">
      {warnings.length ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
          <ul className="space-y-0.5 text-[12px] text-amber-700 dark:text-amber-300">
            {warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {breakdown.length ? (
        <Section title="Score breakdown">
          <ul className="border-border/50 divide-border/40 divide-y overflow-hidden rounded-lg border">
            {breakdown.map((row) => (
              <li
                key={row.key}
                className={cn(
                  "flex items-center gap-3 px-3 py-2",
                  row.parent && "bg-muted/20 pl-6",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    row.parent ? "text-muted-foreground" : "text-foreground font-medium",
                  )}
                >
                  {row.label}
                </span>
                <div className="hidden w-24 shrink-0 sm:block">
                  {row.score != null ? <MiniBar value={row.score} /> : null}
                </div>
                <span className="text-foreground w-8 shrink-0 text-right font-mono text-[13px] tabular-nums">
                  {row.score != null ? points(row.score) : "—"}
                </span>
                <span className="text-muted-foreground w-24 shrink-0 text-right font-mono text-[11px] tabular-nums">
                  {rowSecondary(row)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {strengths.length ? (
        <Section title="Strengths">
          <ul className="space-y-1">
            {strengths.map((s) => (
              <li key={s} className="text-muted-foreground flex gap-2 text-[13px]">
                <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
                  ✓
                </span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {matched.length || missing.length ? (
        <Section title="Skills" aside={`${matched.length} matched · ${missing.length} missing`}>
          <div className="space-y-2">
            {matched.length ? (
              <div className="flex flex-wrap gap-1.5">
                {matched.map((s) => (
                  <Chip key={`m-${s}`} tone="matched">
                    {s}
                  </Chip>
                ))}
              </div>
            ) : null}
            {missing.length ? (
              <div className="flex flex-wrap gap-1.5">
                {missing.map((s) => (
                  <Chip key={`x-${s}`} tone="missing">
                    {s}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {categories.length ? (
        <Section title="By skill category">
          <ul className="border-border/50 divide-border/40 divide-y overflow-hidden rounded-lg border">
            {categories.map((c) => (
              <li key={c.category} className="space-y-1 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground text-[13px] font-medium">{c.category}</span>
                  <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                    {c.score}%
                  </span>
                </div>
                {c.matched.length || c.missing.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.matched.map((s) => (
                      <Chip key={`cm-${c.category}-${s}`} tone="matched">
                        {s}
                      </Chip>
                    ))}
                    {c.missing.map((s) => (
                      <Chip key={`cx-${c.category}-${s}`} tone="missing">
                        {s}
                      </Chip>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {findings.length ? (
        <Section title="Findings & fixes" aside={`${findings.length}`}>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {findings.map((f) => {
              const fix = fixFor(f.id) ?? f.recommendation;
              return (
                <li key={f.id} className="border-border/50 rounded-lg border p-2.5">
                  <div className="flex items-start gap-2">
                    <SeverityPill severity={f.severity} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-foreground text-[13px] font-medium leading-snug">
                        {f.title}
                      </p>
                      <p className="text-muted-foreground text-[12px] leading-relaxed">
                        {f.detail}
                      </p>
                      {fix ? (
                        <p className="text-[12px] leading-relaxed">
                          <span className="text-foreground font-medium">Fix: </span>
                          <span className="text-muted-foreground">{fix}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {metrics.length ? (
        <Section title="Signals">
          <ul className="border-border/50 divide-border/40 divide-y overflow-hidden rounded-lg border">
            {metrics.map((m) => (
              <li
                key={m.key}
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]"
              >
                <span className="text-muted-foreground min-w-0 truncate" title={m.label}>
                  {m.label}
                </span>
                <span className="text-foreground shrink-0 font-mono tabular-nums">
                  {m.value}
                  {m.unit ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {limitations.length || analysis.methodology ? (
        <details className="border-border/50 group rounded-lg border px-3 py-2">
          <summary className="text-muted-foreground cursor-pointer list-none text-[11px] font-medium">
            Methodology &amp; limitations
            <span
              className="ml-1 inline-block transition-transform group-open:rotate-90"
              aria-hidden
            >
              ›
            </span>
          </summary>
          <div className="text-muted-foreground mt-2 space-y-1 text-[11px] leading-relaxed">
            {analysis.methodology ? (
              <p>
                {analysis.methodology.id}@{analysis.methodology.version}
                {analysis.methodology.reference ? ` · ${analysis.methodology.reference}` : ""}
              </p>
            ) : null}
            {limitations.map((l) => (
              <p key={l}>· {l}</p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function AnalysisDetails({ analysis }: { analysis: AtsAnalysis }) {
  const [openDim, setOpenDim] = useState<string | null>(null);
  const scores = analysis.scores ?? {};
  const strengths = analysis.strengths ?? [];
  const missingSkills = analysis.missingSkills ?? [];
  const partialSkills = analysis.partialSkills ?? [];
  const improvements = analysis.improvements ?? [];
  const atsIssues = analysis.atsIssues ?? [];
  const applicable = SCORE_ROWS.filter((row) => {
    const v = scores[row.key];
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

  return (
    <div className="border-border/60 mt-3 space-y-4 border-t pt-3 md:space-y-5">
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-foreground text-[13px] font-semibold tracking-tight">
              {analysis.scoreLabel}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-[12px]">
              {analysis.scoreName}
              {analysis.targetTitle ? ` · ${analysis.targetTitle}` : ""}
            </p>
          </div>
          <p className="text-foreground shrink-0 font-mono text-[16px] font-semibold tabular-nums">
            {points(analysis.overallScore)}
            <span className="text-muted-foreground text-[12px] font-medium"> / 100</span>
          </p>
        </div>
        <ScoreBar value={analysis.overallScore} />
        {!analysis.breakdown?.length && analysis.notes?.length ? (
          <p className="text-muted-foreground text-[12px] leading-relaxed">{analysis.notes[0]}</p>
        ) : null}
      </div>

      {analysis.breakdown?.length ? (
        // Open-source engines: one clean, full-width, row-based report.
        <EngineReport analysis={analysis} />
      ) : (
        <div className="space-y-5">
          <Section title="Breakdown">
            <div>
              {rows.map((row) => {
                const value = scores[row.key] as number;
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
          </Section>

          {strengths.length ? (
            <Section title="Strengths">
              <ul className="space-y-1">
                {strengths.map((s) => (
                  <li key={s} className="text-muted-foreground flex gap-2 text-[13px]">
                    <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
                      ✓
                    </span>
                    <span className="min-w-0">{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {missingSkills.length || partialSkills.length ? (
            <Section title="Missing / weak requirements">
              <dl className="space-y-1.5 text-[13px]">
                {missingSkills.length ? (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-16 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide">
                      Missing
                    </dt>
                    <dd className="text-foreground min-w-0 flex-1">
                      {missingSkills.map((s) => s.skill).join(", ")}
                    </dd>
                  </div>
                ) : null}
                {partialSkills.length ? (
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      Partial
                    </dt>
                    <dd className="text-foreground min-w-0 flex-1">
                      {partialSkills.map((s) => s.skill).join(", ")}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Section>
          ) : null}

          {improvements.length ? (
            <Section title="Improvements">
              <div className="space-y-2.5">
                {(["high", "medium", "low"] as const).map((priority) => {
                  const items = improvements.filter((i) => i.priority === priority);
                  if (!items.length) return null;
                  return (
                    <div key={priority}>
                      <p className="text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-wide">
                        {priority} impact
                      </p>
                      <ol className="text-muted-foreground list-decimal space-y-1.5 pl-4 text-[13px]">
                        {items.map((i) => (
                          <li key={i.text}>
                            {i.text}
                            <span className="mt-0.5 block text-[11px] opacity-80">{i.reason}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {atsIssues.length ? (
            <Section title="ATS issues">
              <AtsIssueList issues={atsIssues} />
            </Section>
          ) : null}
        </div>
      )}
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
            className="border-border/70 bg-background/40 md:min-h-34 rounded-xl border px-3.5 py-3"
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
