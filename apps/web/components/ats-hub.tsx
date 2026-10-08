"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { ShellWidth } from "@/components/shell-width";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AtsAnalysis, AtsMode, AtsScores } from "@/lib/ats-types";
import { detectAtsMode } from "@/lib/ats-types";
import { cn } from "@/lib/utils";

type ResumeRow = {
  id: string;
  displayName: string;
  status: string;
  atsScore: number | null;
  byteSize: number;
  updatedAt: string;
};

type AtsHubProps = {
  initialResumes: ResumeRow[];
  defaultRole?: string;
};

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

function points(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(score)))}`;
}

function modeHint(mode: AtsMode): string {
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
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="bg-muted/60 h-1.5 w-full overflow-hidden rounded-full">
      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
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
    return (
      <ul className="space-y-0.5">
        {analysis.atsIssues.length
          ? analysis.atsIssues.map((i) => <li key={i}>⚠ {i}</li>)
          : analysis.strengths.slice(0, 4).map((s) => <li key={s}>✓ {s}</li>)}
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

function AnalysisDetails({ analysis }: { analysis: AtsAnalysis }) {
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

  return (
    <div className="border-border/60 mt-3 space-y-4 border-t pt-3">
      <div className="text-center">
        <p className="text-foreground font-mono text-3xl font-semibold tabular-nums tracking-tight">
          {points(analysis.overallScore)}
          <span className="text-muted-foreground text-base font-medium"> / 100</span>
        </p>
        <p className="text-foreground mt-1 text-[13px] font-medium">{analysis.scoreLabel}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {analysis.scoreName}
          {analysis.targetTitle ? ` · ${analysis.targetTitle}` : ""}
        </p>
        <div className="mx-auto mt-2 max-w-xs">
          <ScoreBar value={analysis.overallScore} />
        </div>
        {analysis.blurb ? (
          <p className="text-muted-foreground mx-auto mt-2 max-w-md text-[10px] leading-relaxed">
            {analysis.blurb}
          </p>
        ) : null}
        {analysis.notes?.length ? (
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-[11px] leading-relaxed">
            {analysis.notes[0]}
          </p>
        ) : null}
      </div>

      <div>
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

      {analysis.strengths.length ? (
        <div>
          <p className="text-foreground mb-1.5 text-[12px] font-semibold">Strengths</p>
          <ul className="text-muted-foreground space-y-1 text-[12px]">
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
          <ul className="text-muted-foreground space-y-1 text-[12px]">
            {analysis.partialSkills.slice(0, 6).map((s) => (
              <li key={`p-${s.skill}`} className="flex justify-between gap-2">
                <span>{s.skill}</span>
                <span className="text-[10px] uppercase tracking-wide">Partial</span>
              </li>
            ))}
            {analysis.missingSkills.slice(0, 6).map((s) => (
              <li key={`m-${s.skill}`} className="flex justify-between gap-2">
                <span>{s.skill}</span>
                <span className="text-[10px] uppercase tracking-wide">Missing</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.improvements.length ? (
        <div>
          <p className="text-foreground mb-1.5 text-[12px] font-semibold">Improvements</p>
          <div className="space-y-2">
            {(["high", "medium", "low"] as const).map((priority) => {
              const items = analysis.improvements.filter((i) => i.priority === priority);
              if (!items.length) return null;
              return (
                <div key={priority}>
                  <p className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
                    {priority} impact
                  </p>
                  <ol className="text-muted-foreground list-decimal space-y-1 pl-4 text-[12px]">
                    {items.map((i) => (
                      <li key={i.text}>
                        {i.text}
                        <span className="mt-0.5 block text-[10px] opacity-80">{i.reason}</span>
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
          <ul className="text-muted-foreground space-y-1 text-[12px]">
            {analysis.atsIssues.map((i) => (
              <li key={i}>⚠ {i}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ScoringGuideContent() {
  return (
    <div className="space-y-3 text-[12px] leading-relaxed">
      <p className="text-muted-foreground">
        Scores are out of <span className="text-foreground font-medium">100</span> and calculated
        from structured signals — not a black-box “ATS oracle.” We do not claim this is the score
        used by Workday, Greenhouse, Taleo, or any proprietary scanner.
      </p>
      <ul className="text-muted-foreground list-disc space-y-1.5 pl-4">
        <li>
          <span className="text-foreground font-medium">Resume only</span> — Resume Quality Score
          (parseability, impact, structure, evidence).
        </li>
        <li>
          <span className="text-foreground font-medium">Role / title</span> — Role Match Score
          against a transparent role skill profile (core skills weighted higher).
        </li>
        <li>
          <span className="text-foreground font-medium">Role + JD</span> — ATS Match Score weighted
          toward required hard skills, experience, responsibilities, evidence, and title alignment.
          Missing categories are not penalized — weights redistribute.
        </li>
      </ul>
      <p className="text-muted-foreground text-[11px]">
        Hard skills and demonstrated evidence outweigh keyword lists. Repetition / stuffing does not
        raise the score. Improvements never ask you to invent experience you don’t have.
      </p>
    </div>
  );
}

export function AtsHub({ initialResumes, defaultRole = "" }: AtsHubProps) {
  const [jdText, setJdText] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [byId, setById] = useState<Record<string, AtsAnalysis | null>>({});
  const [scoring, setScoring] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoredOnce, setScoredOnce] = useState(false);
  const [engine, setEngine] = useState<"fastapi" | "fallback" | null>(null);
  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);

  const previewMode = detectAtsMode(role, jdText);

  async function runAnalyze() {
    if (initialResumes.length === 0) {
      setError("Upload a resume on Documents first.");
      return;
    }

    setScoring(true);
    setError(null);
    setScoredOnce(true);
    setById({});
    setEngine(null);
    setExpandedResumeId(null);

    const stages = [
      "Parsing resumes",
      "Extracting experience",
      "Analyzing skills",
      "Matching requirements",
      "Evaluating evidence",
      "Calculating scores",
    ];
    let stageIdx = 0;
    setStage(stages[0]!);
    const tick = window.setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stages.length - 1);
      setStage(stages[stageIdx]!);
    }, 700);

    try {
      const res = await fetch("/api/ats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText: jdText.trim(),
          role: role.trim(),
          scoreAll: true,
        }),
      });
      const data = (await res.json()) as {
        engine?: "fastapi" | "fallback";
        results?: AtsAnalysis[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Analysis failed.");

      const next: Record<string, AtsAnalysis | null> = {};
      for (const row of data.results ?? []) {
        next[row.resumeId] = row;
      }
      setById(next);
      setEngine(data.engine ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      window.clearInterval(tick);
      setStage(null);
      setScoring(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedResumeId((current) => (current === id ? null : id));
  }

  return (
    <ShellWidth className="space-y-5 py-6 sm:py-8">
      <header className="space-y-1.5">
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">ATS score</h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          Transparent ATS Match & Resume Quality analysis — hard skills, evidence, experience, and
          parseability. Not a claim of any vendor’s proprietary ATS score. Manage files on{" "}
          <Link href="/documents" className="text-primary underline underline-offset-2">
            Documents
          </Link>
          .
        </p>
      </header>

      <section className="border-border/80 bg-card space-y-3 rounded-xl border p-4">
        <label className="block space-y-1 text-[12px]">
          <span className="text-muted-foreground">Role / title (optional)</span>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Software Engineer, Cloud Engineer"
            className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px]"
          />
        </label>
        <label className="block space-y-1 text-[12px]">
          <span className="text-muted-foreground">Job description (optional)</span>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            rows={8}
            placeholder="Paste the JD for the strongest job-match analysis…"
            className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
          />
        </label>
        <p className="text-muted-foreground text-[11px]">
          Add a role or job description for a more targeted match.{" "}
          <span className="text-foreground/80">Mode: {modeHint(previewMode)}.</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => void runAnalyze()}
            disabled={scoring || initialResumes.length === 0}
          >
            {scoring ? "Analyzing…" : "Analyze resumes"}
          </Button>
          {engine ? (
            <span className="text-muted-foreground text-[11px]">
              Engine: {engine === "fastapi" ? "Python API" : "local fallback"}
            </span>
          ) : null}
          {scoring && stage ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
              <Spinner className="size-3.5" label="Analyzing" />
              {stage}
            </span>
          ) : null}
        </div>
        {error ? (
          <p className="text-destructive text-[13px]" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-foreground text-[13px] font-semibold">Your resumes</h2>
        {initialResumes.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            No resumes yet — upload one on Documents.
          </p>
        ) : (
          <ul className="space-y-2">
            {initialResumes.map((resume) => {
              const analysis = byId[resume.id];
              const open = expandedResumeId === resume.id;
              return (
                <li
                  key={resume.id}
                  className="border-border/80 bg-card rounded-xl border px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-[13px] font-medium">
                        {resume.displayName}
                      </p>
                      <p className="text-muted-foreground text-[11px]">{resume.status}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {scoring ? (
                        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
                          <Spinner className="size-3.5" label="Analyzing" />
                          Analyzing…
                        </span>
                      ) : scoredOnce && analysis && !analysis.error ? (
                        <div className="text-right">
                          <p className="text-primary font-mono text-[13px] font-semibold tabular-nums">
                            {points(analysis.overallScore)}
                            <span className="text-primary/70 text-[11px] font-medium"> / 100</span>
                          </p>
                          <p className="text-muted-foreground max-w-[9rem] truncate text-[10px]">
                            {analysis.scoreLabel}
                          </p>
                        </div>
                      ) : scoredOnce && analysis?.error ? (
                        <span className="text-destructive text-[11px]">Parse failed</span>
                      ) : scoredOnce ? (
                        <span className="text-muted-foreground text-[11px]">No score</span>
                      ) : resume.atsScore != null ? (
                        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                          Ready {points(resume.atsScore)}/100
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">Not analyzed</span>
                      )}
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={open ? "Collapse analysis" : "Expand analysis"}
                        disabled={!analysis || scoring}
                        onClick={() => toggleExpand(resume.id)}
                        className="border-border text-muted-foreground hover:text-foreground inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Chevron open={open} />
                      </button>
                    </div>
                  </div>

                  {open && analysis && !analysis.error ? (
                    <AnalysisDetails analysis={analysis} />
                  ) : null}
                  {open && analysis?.error ? (
                    <p className="text-destructive border-border/60 mt-3 border-t pt-3 text-[12px]">
                      {analysis.error}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="border-border/80 bg-card overflow-hidden rounded-xl border">
        <Accordion type="single" collapsible className="border-y-0">
          <AccordionItem value="scoring">
            <AccordionTrigger className="text-foreground px-4 text-[13px] font-semibold hover:no-underline">
              How scoring works
            </AccordionTrigger>
            <AccordionContent>
              <ScoringGuideContent />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ShellWidth>
  );
}
