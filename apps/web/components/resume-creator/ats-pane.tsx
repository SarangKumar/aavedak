"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Lock, RefreshCw } from "lucide-react";

import { AnalysisDetails } from "@/components/ats-analysis-panel";
import { EngineLabel } from "@/components/ats-engine-badge";
import { AtsEnginePicker } from "@/components/ats-engine-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";
import { weightedFinalScore } from "@/lib/ats-engines/aggregate";
import type { AtsEngineId, AtsBatchResultCell } from "@/lib/ats-engines/types";
import { scoreVerdict } from "@/lib/ats-types";
import { draftToPlainText } from "@/lib/resume-creator-draft";
import type { ResumeCreatorDraft } from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";

function FieldHelp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <HoverCard>
      <HoverCardTrigger>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground inline-flex size-4 cursor-pointer items-center justify-center rounded-full border text-[10px] font-semibold leading-none"
        >
          ?
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-72">
        <p className="mb-1 text-sm font-medium">{label}</p>
        <div className="text-muted-foreground text-pretty text-xs">{children}</div>
      </HoverCardContent>
    </HoverCard>
  );
}

type Props = {
  draft: ResumeCreatorDraft;
  onDraftChange: (next: ResumeCreatorDraft) => void;
  signedIn: boolean;
  yearsExperience: number | null;
  className?: string;
};

const ALL_ENGINE_IDS = ATS_ENGINES.map((e) => e.id);

export function ResumeCreatorAtsPane({
  draft,
  onDraftChange,
  signedIn,
  yearsExperience,
  className,
}: Props) {
  const [selected, setSelected] = useState<Set<AtsEngineId>>(() => new Set(ALL_ENGINE_IDS));
  const [results, setResults] = useState<AtsBatchResultCell[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<AtsEngineId | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const plainText = useMemo(() => draftToPlainText(draft), [draft]);

  const runScore = useCallback(async () => {
    if (!signedIn) return;
    if (selected.size === 0) {
      setError("Select at least one ATS engine.");
      return;
    }
    if (plainText.trim().length < 40) {
      setResults([]);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setError(null);

    try {
      const res = await fetch("/api/ats/score-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          resumeText: plainText,
          role: draft.targetRole,
          jdText: draft.targetJd,
          yearsExperience,
          engines: [...selected].map((engineId) => ({ engineId })),
        }),
      });
      const data = (await res.json()) as { results?: AtsBatchResultCell[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Scoring failed.");
        setResults([]);
        return;
      }
      setResults(data.results ?? []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Scoring failed.");
    } finally {
      if (abortRef.current === ac) setRunning(false);
    }
  }, [signedIn, selected, plainText, draft.targetRole, draft.targetJd, yearsExperience]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const final = useMemo(() => {
    const entries = results
      .filter((r) => r.status === "done" && typeof r.overallScore === "number")
      .map((r) => ({ engineId: r.engineId, score: r.overallScore as number }));
    return weightedFinalScore(entries);
  }, [results]);

  const detail = detailId ? results.find((r) => r.engineId === detailId) : null;

  if (!signedIn) {
    return (
      <div className={cn("flex h-full min-h-0 flex-1 flex-col", className)}>
        <div className="mb-2 shrink-0 px-1">
          <p className="aavedak-section-title text-foreground">ATS check</p>
          <p className="aavedak-meta text-muted-foreground mt-0.5">
            Sign in to check this draft against ATS engines.
          </p>
        </div>
        <div className="border-border bg-card flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
          <Lock className="text-muted-foreground size-6" aria-hidden />
          <div className="space-y-1">
            <p className="text-foreground text-[13px] font-medium">Sign in to run ATS scores</p>
            <p className="text-muted-foreground max-w-xs text-[12px] leading-snug">
              Creating and downloading a PDF stays free without an account. Live scoring and saving
              the resume to your Documents need a signed-in session.
            </p>
          </div>
          <Link href="/sign-in?next=/resume-creator" className={buttonVariants({ size: "sm" })}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col", className)}>
      <div className="mb-3 shrink-0 space-y-2.5 px-1">
        <div className="min-w-0 space-y-0.5">
          <p className="aavedak-section-title text-foreground">ATS check</p>
          <p className="aavedak-meta text-muted-foreground">
            Pick engines, then run a check on this draft. Click a result for feedback.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => void runScore()}
          disabled={running || selected.size === 0}
          loading={running}
          loadingText="Checking…"
        >
          <RefreshCw className="size-3.5" />
          Check ATS
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-1">
        <div className="space-y-3 pb-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px] font-medium">Job title</span>
              <FieldHelp label="Why the job title helps">
                Engines that do role match use the title to check whether your summary and recent
                roles read as a fit for that job family. Leave it blank for a resume-only quality
                score.
              </FieldHelp>
            </div>
            <Input
              value={draft.targetRole}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  targetRole: e.target.value,
                  updatedAt: new Date().toISOString(),
                })
              }
              placeholder="e.g. Software Engineer"
              className="h-8 text-[12px]"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px] font-medium">Job description</span>
              <FieldHelp label="Why the job description helps">
                Paste the posting when you want a job-match score: engines look for required skills,
                keywords and responsibilities from the JD in your draft. Without a JD they score
                resume quality / role fit only.
              </FieldHelp>
            </div>
            <Textarea
              value={draft.targetJd}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  targetJd: e.target.value,
                  updatedAt: new Date().toISOString(),
                })
              }
              placeholder="Paste the JD to tune the draft for that posting."
              className="min-h-28 text-[12px] leading-relaxed"
            />
          </div>

          <div>
            <p className="text-muted-foreground mb-1.5 text-[11px] font-medium">Engines</p>
            <AtsEnginePicker selected={selected} onChange={setSelected} disabled={running} />
          </div>

          <div className="border-border bg-card rounded-lg border p-3">
            <div className="flex items-center gap-3">
              {final ? (
                <div className="min-w-0 space-y-0.5">
                  <p className="text-muted-foreground text-[11px] font-medium">Overall rating</p>
                  <p className="text-foreground text-[15px] font-semibold tracking-tight">
                    {scoreVerdict(final.score)}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    Weighted across engines that returned a score
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {running ? <Spinner className="size-4" /> : null}
                  <p className="text-muted-foreground text-[12px]">
                    {plainText.trim().length < 40
                      ? "Add more resume content to score."
                      : running
                        ? "Scoring…"
                        : "No scores yet — hit Check ATS when ready."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <ul className="space-y-1.5">
            {results.map((cell) => {
              const done = cell.status === "done" && typeof cell.overallScore === "number";
              return (
                <li key={cell.engineId}>
                  <button
                    type="button"
                    onClick={() => setDetailId(cell.engineId)}
                    className={cn(
                      "border-border hover:bg-muted/40 flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                      done && "cursor-pointer",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <EngineLabel engineId={cell.engineId} className="text-[12px]" wrap />
                    </div>
                    {done ? (
                      <span
                        className="text-foreground shrink-0 text-[12px] font-semibold"
                        title={`Score ${Math.round(cell.overallScore!)}`}
                      >
                        {scoreVerdict(cell.overallScore!)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">
                        {cell.error || cell.status || "—"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </ScrollArea>

      <Sheet
        open={detailId != null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {detailId
                ? (ATS_ENGINES.find((e) => e.id === detailId)?.name ?? detailId)
                : "Feedback"}
            </SheetTitle>
            <SheetDescription>
              {detail?.scoreName
                ? `${detail.scoreName}${
                    typeof detail.overallScore === "number"
                      ? ` · ${Math.round(detail.overallScore)}`
                      : ""
                  }`
                : "Engine feedback for this draft."}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 pr-2">
            {detail?.analysis ? (
              <AnalysisDetails analysis={detail.analysis} />
            ) : (
              <p className="text-muted-foreground text-[12px]">
                {detail?.error || "No detailed feedback for this engine."}
              </p>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
