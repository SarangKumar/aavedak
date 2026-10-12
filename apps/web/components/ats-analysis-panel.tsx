"use client";

import { type ReactNode } from "react";

import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { metricHelp } from "@/lib/ats-metric-help";
import type {
  AtsAnalysis,
  AtsBreakdownRow,
  AtsFindingSeverity,
  AtsMode,
  AtsScores,
} from "@/lib/ats-types";
import { normalizeAtsIssues } from "@/lib/ats-types";
import { cn } from "@/lib/utils";

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

function ScoreBar({ value }: { value: number }) {
  return <Progress value={Math.max(0, Math.min(100, value))} max={100} className="h-1.5" />;
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

const SEVERITY_ORDER: AtsFindingSeverity[] = ["critical", "high", "medium", "low", "info"];
const SEVERITY_BADGE: Record<AtsFindingSeverity, string> = {
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

/** Metric label with a hover explanation when the glossary knows it. */
function MetricLabel({ label, className }: { label: string; className?: string }) {
  const help = metricHelp(label);
  const text = (
    <span
      className={cn(
        "min-w-0 truncate",
        help && "cursor-help underline decoration-dotted underline-offset-4",
        className,
      )}
      tabIndex={help ? 0 : undefined}
    >
      {label}
    </span>
  );
  if (!help) return text;
  return <Tooltip content={help}>{text}</Tooltip>;
}

function SeverityPill({ severity }: { severity: AtsFindingSeverity }) {
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

function Chip({
  tone,
  children,
}: {
  tone: "matched" | "partial" | "missing";
  children: ReactNode;
}) {
  const toneClass =
    tone === "matched"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "partial"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-border bg-muted/60 text-muted-foreground";
  const icon = tone === "matched" ? "✓" : tone === "partial" ? "~" : "✗";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        toneClass,
      )}
    >
      {icon} {children}
    </span>
  );
}

/** Strengths read best as a scannable row of pills, not a vertical checklist. */
function StrengthPills({ strengths }: { strengths: string[] }) {
  if (!strengths.length) return null;
  return (
    <Section title="Strengths">
      <div className="flex flex-wrap gap-1.5">
        {strengths.map((s) => (
          <Chip key={s} tone="matched">
            {s}
          </Chip>
        ))}
      </div>
    </Section>
  );
}

/** Breakdown rows, either the engine's own weighted rows or ones synthesized from `scores`. */
function buildBreakdown(analysis: AtsAnalysis): AtsBreakdownRow[] {
  if (analysis.breakdown?.length) return analysis.breakdown;
  const scores = analysis.scores ?? {};
  const applicable = SCORE_ROWS.filter((row) => typeof scores[row.key] === "number");
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
  return rows.map((r) => ({ key: r.key, label: r.label, score: scores[r.key] as number }));
}

type ReportCard = {
  id: string;
  severity: AtsFindingSeverity;
  title: string;
  detail: string;
  fix?: string;
};

/** Actionable cards, either the engine's own findings+fixes or ones synthesized from
 * improvements / ATS issues — so every engine shows the same card+pill shape. */
function buildCards(analysis: AtsAnalysis): ReportCard[] {
  if (analysis.findings?.length) {
    const fixFor = (id: string) =>
      (analysis.improvements ?? []).find((i) => i.findingId === id)?.text;
    return [...analysis.findings]
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
      .map((f) => ({
        id: f.id,
        severity: f.severity,
        title: f.title,
        detail: f.detail,
        fix: fixFor(f.id) ?? f.recommendation,
      }));
  }
  const out: ReportCard[] = [];
  (analysis.improvements ?? []).forEach((imp, i) => {
    out.push({ id: `imp-${i}`, severity: imp.priority, title: imp.text, detail: imp.reason });
  });
  normalizeAtsIssues(analysis.atsIssues ?? []).forEach((iss, i) => {
    out.push({ id: `issue-${i}`, severity: "medium", title: iss.title, detail: iss.detail });
  });
  return out.sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

/**
 * One report layout for every engine: breakdown, strengths, skills, cards-with-fixes,
 * responsibilities, metrics, then methodology. Native and reference engines don't carry
 * their own `breakdown`/`findings` arrays, so those are synthesized from `scores` /
 * `improvements` / `atsIssues` — the visual shape stays identical either way.
 */
export function AnalysisDetails({ analysis }: { analysis: AtsAnalysis }) {
  const breakdown = buildBreakdown(analysis);
  const cards = buildCards(analysis);
  const metrics = analysis.metrics ?? [];
  const categories = analysis.skillCategories ?? [];
  const limitations = analysis.limitations ?? [];
  const warnings = analysis.warnings ?? [];
  const notes = analysis.notes ?? [];
  const matched = (analysis.matchedSkills ?? []).map((s) => s.skill).filter(Boolean);
  const partial = (analysis.partialSkills ?? []).map((s) => s.skill).filter(Boolean);
  const missing = (analysis.missingSkills ?? []).map((s) => s.skill).filter(Boolean);
  const respMatched = analysis.matchedResponsibilities ?? [];
  const respPartial = analysis.partialResponsibilities ?? [];
  const respMissing = analysis.missingResponsibilities ?? [];

  const rowSecondary = (row: AtsBreakdownRow) => {
    if (row.maxPoints != null)
      return `${row.points != null ? `${row.points > 0 ? "+" : ""}${row.points}` : "—"} / ${row.maxPoints} pts`;
    if (row.weight != null)
      return `${pct(row.weight)}${row.contribution != null ? ` · +${row.contribution.toFixed(1)}` : ""}`;
    if (row.points != null) return `${row.points > 0 ? "+" : ""}${row.points} pts`;
    return "";
  };

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
      </div>

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
                <MetricLabel
                  label={row.label}
                  className={cn(
                    "flex-1 text-[13px]",
                    row.parent ? "text-muted-foreground" : "text-foreground font-medium",
                  )}
                />
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

      <StrengthPills strengths={analysis.strengths ?? []} />

      {matched.length || partial.length || missing.length ? (
        <Section
          title="Skills"
          aside={`${matched.length} matched · ${partial.length} partial · ${missing.length} missing`}
        >
          <div className="flex flex-wrap gap-1.5">
            {matched.map((s) => (
              <Chip key={`m-${s}`} tone="matched">
                {s}
              </Chip>
            ))}
            {partial.map((s) => (
              <Chip key={`p-${s}`} tone="partial">
                {s}
              </Chip>
            ))}
            {missing.map((s) => (
              <Chip key={`x-${s}`} tone="missing">
                {s}
              </Chip>
            ))}
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

      {respMatched.length || respPartial.length || respMissing.length ? (
        <Section title="Responsibilities">
          <ul className="space-y-1 text-[13px]">
            {respMatched.map((r) => (
              <li key={`rm-${r.text}`} className="flex gap-2">
                <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>
                  ✓
                </span>
                <span className="text-muted-foreground min-w-0">{r.text}</span>
              </li>
            ))}
            {respPartial.map((r) => (
              <li key={`rp-${r.text}`} className="flex gap-2">
                <span className="text-amber-600 dark:text-amber-400" aria-hidden>
                  ~
                </span>
                <span className="text-muted-foreground min-w-0">{r.text}</span>
              </li>
            ))}
            {respMissing.map((r) => (
              <li key={`rx-${r.text}`} className="flex gap-2">
                <span className="text-muted-foreground" aria-hidden>
                  ✗
                </span>
                <span className="text-muted-foreground min-w-0">{r.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {cards.length ? (
        <Section title="Improvements & fixes" aside={`${cards.length}`}>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {cards.map((c) => (
              <li key={c.id} className="border-border/50 rounded-lg border p-2.5">
                <div className="flex items-start gap-2">
                  <SeverityPill severity={c.severity} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-foreground text-[13px] font-medium leading-snug">
                      {c.title}
                    </p>
                    {c.detail ? (
                      <p className="text-muted-foreground text-[12px] leading-relaxed">
                        {c.detail}
                      </p>
                    ) : null}
                    {c.fix ? (
                      <p className="text-[12px] leading-relaxed">
                        <span className="text-foreground font-medium">Fix: </span>
                        <span className="text-muted-foreground">{c.fix}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
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
                <MetricLabel label={m.label} className="text-muted-foreground" />
                <span className="text-foreground shrink-0 font-mono tabular-nums">
                  {m.value}
                  {m.unit ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {limitations.length || notes.length || analysis.methodology ? (
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
            {notes.map((n) => (
              <p key={n}>· {n}</p>
            ))}
            {limitations.map((l) => (
              <p key={l}>· {l}</p>
            ))}
          </div>
        </details>
      ) : null}
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
