"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  AnalysisDetails,
  modeHint,
  points,
  ScoringGuideContent,
} from "@/components/ats-analysis-panel";
import { ShellWidth } from "@/components/shell-width";
import { useAutosizeTextarea } from "@/hooks/use-autosize-textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  ATS_ENGINES,
  buildCombinations,
  getEngine,
  scoreTypeLabel,
  summarizeCombinations,
} from "@/lib/ats-engines/registry";
import type {
  AnalysisCombination,
  AtsBatchResultCell,
  AtsEngineId,
  EngineRunRequest,
} from "@/lib/ats-engines/types";
import { detectAtsMode } from "@/lib/ats-types";
import { cn } from "@/lib/utils";

type ResumeRow = {
  id: string;
  displayName: string;
  status: string;
  atsScore: number | null;
  byteSize: number;
  updatedAt: string;
  originalFilename?: string;
};

type AtsHubProps = {
  initialResumes: ResumeRow[];
  defaultRole?: string;
};

function cellKey(resumeId: string, engineId: string) {
  return `${resumeId}::${engineId}`;
}

/** Fixed locale so SSR and browser hydration match (undefined locale differs by environment). */
function formatUpdated(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function comboToPendingCell(c: AnalysisCombination): AtsBatchResultCell {
  const eng = getEngine(c.engineId);
  if (c.status === "ready") {
    return {
      resumeId: c.resumeId,
      engineId: c.engineId,
      status: "queued",
      mode: c.mode,
      scoreType: c.scoreType,
      scoreName: scoreTypeLabel(c.scoreType),
      profileVersion: eng?.profileVersion,
    };
  }
  return {
    resumeId: c.resumeId,
    engineId: c.engineId,
    status: c.status === "needs_input" ? "excluded" : "unsupported",
    mode: c.mode,
    scoreType: c.scoreType,
    scoreName: scoreTypeLabel(c.scoreType),
    error: c.reason,
    profileVersion: eng?.profileVersion,
  };
}

function StepChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn(
        "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
        open && "rotate-180",
      )}
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

function StepBlock({
  step,
  title,
  summary,
  open,
  onOpenChange,
  headerRight,
  children,
}: {
  step: number;
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const panelId = `ats-step-${step}-panel`;
  return (
    <section className="border-border/80 bg-card rounded-xl border">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onOpenChange(!open)}
          className="hover:bg-muted/30 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left sm:gap-3"
        >
          <span className="border-border/80 bg-muted text-foreground flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-[12px] font-semibold tabular-nums">
            {step}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-foreground block text-[13px] font-semibold">{title}</span>
            {summary ? (
              <span className="text-muted-foreground mt-0.5 block text-pretty text-[11px]">
                {summary}
              </span>
            ) : null}
          </span>
          <StepChevron open={open} />
        </button>
        {headerRight ? (
          <div className="flex shrink-0 items-center pr-0.5">{headerRight}</div>
        ) : null}
      </div>
      {open ? (
        <div id={panelId} className="border-border/60 border-t px-4 py-3 sm:px-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function RunAnalysisButton({
  canRun,
  running,
  readyCount,
  onRun,
  className,
}: {
  canRun: boolean;
  running: boolean;
  readyCount: number;
  onRun: () => void;
  className?: string;
}) {
  const label = running
    ? "Analyzing…"
    : `Run ${readyCount} analysis${readyCount === 1 ? "" : "es"}`;
  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={!canRun}
        onClick={(e) => {
          e.stopPropagation();
          onRun();
        }}
        className={cn("hidden sm:inline-flex", className)}
        aria-label={label}
      >
        {running ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="size-3.5" label="Running" />
            Analyzing…
          </span>
        ) : (
          label
        )}
      </Button>
      <Button
        type="button"
        size="icon-sm"
        disabled={!canRun}
        onClick={(e) => {
          e.stopPropagation();
          onRun();
        }}
        className={cn("sm:hidden", className)}
        aria-label={label}
        title={label}
      >
        {running ? (
          <Spinner className="size-3.5" label="Running" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
            <path
              d="M8 5.5v13l11-6.5L8 5.5Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </Button>
    </>
  );
}

function engineNames(ids: AtsEngineId[]) {
  return ids
    .map((id) => getEngine(id)?.name)
    .filter(Boolean)
    .join(", ");
}

export function AtsHub({ initialResumes, defaultRole = "Software Engineer" }: AtsHubProps) {
  const [selectedResumeIds, setSelectedResumeIds] = useState<Set<string>>(() => new Set());
  const [selectedEngineIds, setSelectedEngineIds] = useState<Set<AtsEngineId>>(
    () => new Set(["aavedak"]),
  );
  const [role, setRole] = useState(defaultRole);
  const [jdText, setJdText] = useState("");
  const [resumeQuery, setResumeQuery] = useState("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [completedCount, setCompletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [results, setResults] = useState<AtsBatchResultCell[]>([]);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [filterResumeId, setFilterResumeId] = useState<string>("all");
  const [filterEngineId, setFilterEngineId] = useState<string>("all");
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
  });
  const runTokenRef = useRef(0);

  function setStepOpen(step: number, open: boolean) {
    setOpenSteps((prev) => ({ ...prev, [step]: open }));
  }

  const { ref: jdTextareaRef, resize: resizeJdTextarea } = useAutosizeTextarea(jdText);

  const selectedResumes = useMemo(
    () => initialResumes.filter((r) => selectedResumeIds.has(r.id)),
    [initialResumes, selectedResumeIds],
  );

  const filteredResumes = useMemo(() => {
    const q = resumeQuery.trim().toLowerCase();
    if (!q) return initialResumes;
    return initialResumes.filter((r) => {
      const hay = `${r.displayName} ${r.originalFilename || ""} ${r.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [initialResumes, resumeQuery]);

  const engineRequests: EngineRunRequest[] = useMemo(
    () => [...selectedEngineIds].map((id) => ({ engineId: id })),
    [selectedEngineIds],
  );

  const combinations: AnalysisCombination[] = useMemo(
    () =>
      buildCombinations({
        resumeIds: [...selectedResumeIds],
        engines: engineRequests,
        shared: { role: role.trim(), jdText: jdText.trim() },
      }),
    [selectedResumeIds, engineRequests, role, jdText],
  );

  const comboSummary = useMemo(() => summarizeCombinations(combinations), [combinations]);

  const selectedEngineList = useMemo(
    () => ATS_ENGINES.filter((e) => selectedEngineIds.has(e.id)),
    [selectedEngineIds],
  );

  const titleRequiredEngines = useMemo(
    () => selectedEngineList.filter((e) => e.title === "required"),
    [selectedEngineList],
  );
  const titleOptionalEngines = useMemo(
    () => selectedEngineList.filter((e) => e.title === "optional"),
    [selectedEngineList],
  );
  const jdRequiredEngines = useMemo(
    () => selectedEngineList.filter((e) => e.jd === "required"),
    [selectedEngineList],
  );
  const jdOptionalEngines = useMemo(
    () => selectedEngineList.filter((e) => e.jd === "optional"),
    [selectedEngineList],
  );

  const previewMode = detectAtsMode(role, jdText);
  const canRun =
    selectedResumeIds.size > 0 &&
    selectedEngineIds.size > 0 &&
    comboSummary.readyCount > 0 &&
    !running;

  const showTable = selectedResumeIds.size > 0 && selectedEngineIds.size > 0;

  const resultMap = useMemo(() => {
    const m = new Map<string, AtsBatchResultCell>();
    for (const cell of results) m.set(cellKey(cell.resumeId, cell.engineId), cell);
    return m;
  }, [results]);

  const displayMap = useMemo(() => {
    const m = new Map<string, AtsBatchResultCell>();
    for (const c of combinations) {
      const key = cellKey(c.resumeId, c.engineId);
      const existing = resultMap.get(key);
      // Drop stale excluded/unsupported once the combination became ready (e.g. JD filled).
      const staleBlock =
        existing &&
        (existing.status === "excluded" || existing.status === "unsupported") &&
        c.status === "ready";
      if (existing && !staleBlock) {
        m.set(key, existing);
      } else if (c.status === "ready") {
        m.set(key, {
          resumeId: c.resumeId,
          engineId: c.engineId,
          status: "idle",
          mode: c.mode,
          scoreType: c.scoreType,
          scoreName: scoreTypeLabel(c.scoreType),
        });
      } else {
        m.set(key, comboToPendingCell(c));
      }
    }
    return m;
  }, [combinations, resultMap]);

  const detailCell = detailKey ? (displayMap.get(detailKey) ?? resultMap.get(detailKey)) : null;

  const tableEngines = useMemo(() => {
    const ids =
      filterEngineId === "all"
        ? [...selectedEngineIds]
        : selectedEngineIds.has(filterEngineId as AtsEngineId)
          ? [filterEngineId as AtsEngineId]
          : [...selectedEngineIds];
    return ids.map((id) => getEngine(id)!).filter(Boolean);
  }, [selectedEngineIds, filterEngineId]);

  const tableResumes = useMemo(() => {
    if (filterResumeId === "all") return selectedResumes;
    return selectedResumes.filter((r) => r.id === filterResumeId);
  }, [selectedResumes, filterResumeId]);

  function patchCell(cell: AtsBatchResultCell) {
    const key = cellKey(cell.resumeId, cell.engineId);
    setResults((prev) => {
      const idx = prev.findIndex((r) => cellKey(r.resumeId, r.engineId) === key);
      if (idx < 0) return [...prev, cell];
      const next = [...prev];
      next[idx] = cell;
      return next;
    });
  }

  function toggleResume(id: string) {
    if (running) return;
    setSelectedResumeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisibleResumes() {
    if (running) return;
    setSelectedResumeIds((prev) => {
      const next = new Set(prev);
      for (const r of filteredResumes) next.add(r.id);
      return next;
    });
  }

  function clearResumes() {
    if (running) return;
    setSelectedResumeIds(new Set());
  }

  function toggleEngine(id: AtsEngineId) {
    if (running) return;
    setSelectedEngineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runProgressive() {
    if (!canRun) return;
    const token = ++runTokenRef.current;
    setRunning(true);
    setError(null);
    setDetailKey(null);
    setCompletedCount(0);
    setFailedCount(0);

    const snapshot = combinations;
    const ready = snapshot.filter((c) => c.status === "ready");
    setResults(snapshot.map(comboToPendingCell));

    const resumeName = (id: string) =>
      selectedResumes.find((r) => r.id === id)?.displayName || id.slice(0, 8);

    let done = 0;
    let failed = 0;

    for (const combo of ready) {
      if (runTokenRef.current !== token) break;
      const eng = getEngine(combo.engineId)!;
      setProgressLabel(`${resumeName(combo.resumeId)} · ${eng.name}`);
      patchCell({
        resumeId: combo.resumeId,
        engineId: combo.engineId,
        status: "running",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        profileVersion: eng.profileVersion,
      });

      try {
        const res = await fetch("/api/ats/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeId: combo.resumeId,
            engineId: combo.engineId,
            mode: combo.mode,
            sharedRole: role.trim(),
            sharedJdText: jdText.trim(),
            forceExtract: true,
          }),
        });
        const data = (await res.json()) as { error?: string; result?: AtsBatchResultCell };
        if (runTokenRef.current !== token) break;
        if (!res.ok || !data.result) {
          failed += 1;
          patchCell({
            resumeId: combo.resumeId,
            engineId: combo.engineId,
            status: "error",
            mode: combo.mode,
            scoreType: combo.scoreType,
            scoreName: scoreTypeLabel(combo.scoreType),
            error: data.error || "Analysis failed.",
            profileVersion: eng.profileVersion,
          });
        } else {
          if (data.result.status === "done") done += 1;
          else if (data.result.status === "error") failed += 1;
          patchCell(data.result);
        }
      } catch (err) {
        if (runTokenRef.current !== token) break;
        failed += 1;
        patchCell({
          resumeId: combo.resumeId,
          engineId: combo.engineId,
          status: "error",
          mode: combo.mode,
          scoreType: combo.scoreType,
          scoreName: scoreTypeLabel(combo.scoreType),
          error: err instanceof Error ? err.message : "Analysis failed.",
          profileVersion: eng.profileVersion,
        });
      }
      setCompletedCount(done);
      setFailedCount(failed);
    }

    if (runTokenRef.current === token) {
      setProgressLabel("");
      setRunning(false);
      setCompletedCount(done);
      setFailedCount(failed);
    }
  }

  function renderCell(resumeId: string, engineId: AtsEngineId) {
    const key = cellKey(resumeId, engineId);
    const cell = displayMap.get(key);
    const active = detailKey === key;

    if (!cell || cell.status === "idle") {
      return <span className="text-muted-foreground text-[10px]">Ready</span>;
    }
    if (cell.status === "queued") {
      return <span className="text-muted-foreground text-[10px]">Queued</span>;
    }
    if (cell.status === "running") {
      return <span className="text-muted-foreground text-[10px]">Analyzing…</span>;
    }
    if (cell.status === "done" && cell.overallScore != null) {
      return (
        <button
          type="button"
          onClick={() => setDetailKey(active ? null : key)}
          className={cn(
            "inline-flex min-w-[3rem] cursor-pointer flex-col items-center rounded-md px-2 py-1 tabular-nums",
            active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted/40",
          )}
        >
          <span className="font-mono text-[13px] font-semibold">{points(cell.overallScore)}</span>
          <span className="text-muted-foreground max-w-[6rem] truncate text-[9px]">
            {cell.scoreLabel || "View"}
          </span>
        </button>
      );
    }
    if (cell.status === "error") {
      return (
        <span className="text-destructive text-[10px]" title={cell.error}>
          Failed
        </span>
      );
    }
    if (cell.status === "excluded") {
      return (
        <span className="text-[10px] text-amber-600 dark:text-amber-400" title={cell.error}>
          Needs input
        </span>
      );
    }
    if (cell.status === "unsupported") {
      return (
        <span className="text-muted-foreground text-[10px]" title={cell.error}>
          Unsupported
        </span>
      );
    }
    if (cell.status === "done") {
      return <span className="text-muted-foreground text-[10px]">No score</span>;
    }
    return <span className="text-muted-foreground text-[10px]">{cell.status}</span>;
  }

  return (
    <ShellWidth className="space-y-4 py-6 sm:space-y-5 sm:py-8">
      <header className="space-y-1.5">
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">ATS score</h1>
        <p className="text-muted-foreground max-w-2xl text-pretty text-[13px] leading-relaxed">
          Follow the steps below. Results fill one cell at a time — click a score for details.{" "}
          <Link href="/documents" className="text-primary underline underline-offset-2">
            Documents
          </Link>
        </p>
      </header>

      <div className="space-y-3 sm:space-y-4">
        <StepBlock
          step={1}
          title="Select engine"
          open={openSteps[1]!}
          onOpenChange={(o) => setStepOpen(1, o)}
          summary={
            selectedEngineIds.size === 0
              ? "Choose one or more scoring engines."
              : `${selectedEngineIds.size} selected · ${engineNames([...selectedEngineIds])}`
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {ATS_ENGINES.map((eng) => {
              const checked = selectedEngineIds.has(eng.id);
              return (
                <Card
                  key={eng.id}
                  size="sm"
                  className={cn(
                    "relative gap-2",
                    checked && "border-primary/40 bg-primary/5",
                    running && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <label
                      className={cn(
                        "flex min-w-0 flex-1 cursor-pointer items-start gap-2",
                        running && "pointer-events-none",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleEngine(eng.id)}
                        disabled={running}
                        className="mt-0.5"
                        aria-label={`Select ${eng.name}`}
                      />
                      <span className="min-w-0 space-y-1">
                        <span className="text-foreground flex flex-wrap items-center gap-1.5 text-[12px] font-medium">
                          {eng.name}
                          <Badge
                            variant={eng.kind === "native" ? "default" : "secondary"}
                            className="h-4 px-1.5 text-[9px] font-medium uppercase tracking-wide"
                          >
                            {eng.kind === "native" ? "Native" : "Ref"}
                          </Badge>
                        </span>
                        <span className="text-muted-foreground block text-[10px] leading-snug">
                          {eng.shortDescription}
                        </span>
                      </span>
                    </label>
                    <HoverCard>
                      <HoverCardTrigger
                        className="text-muted-foreground hover:text-foreground mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md"
                        aria-label={`How ${eng.name} scores`}
                        onClick={(e) => e.preventDefault()}
                      >
                        <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden>
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
                          <path
                            d="M12 11v5"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                          />
                          <circle cx="12" cy="8" r="0.9" fill="currentColor" />
                        </svg>
                      </HoverCardTrigger>
                      <HoverCardContent
                        side="bottom"
                        align="end"
                        className="w-64 text-[11px] leading-relaxed"
                      >
                        <p className="text-foreground mb-1 font-medium">{eng.name} scoring</p>
                        <p className="text-muted-foreground text-pretty">{eng.algoBlurb}</p>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                </Card>
              );
            })}
          </div>
        </StepBlock>

        <StepBlock
          step={2}
          title="Select resume"
          open={openSteps[2]!}
          onOpenChange={(o) => setStepOpen(2, o)}
          summary={
            selectedResumes.length === 0
              ? "Choose resumes to score."
              : `${selectedResumes.length} selected`
          }
        >
          {initialResumes.length === 0 ? (
            <p className="text-muted-foreground text-[12px]">
              No resumes uploaded.{" "}
              <Link href="/documents" className="text-primary underline underline-offset-2">
                Upload on Documents
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={resumeQuery}
                  disabled={running}
                  onChange={(e) => setResumeQuery(e.target.value)}
                  placeholder="Search resumes…"
                  className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px] disabled:opacity-60 sm:max-w-sm"
                  aria-label="Search resumes"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={running || filteredResumes.length === 0}
                    onClick={selectAllVisibleResumes}
                  >
                    Select{resumeQuery.trim() ? " visible" : " all"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={running}
                    onClick={clearResumes}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <ul className="divide-border/50 border-border/60 max-h-72 divide-y overflow-y-auto rounded-lg border">
                {filteredResumes.length === 0 ? (
                  <li className="text-muted-foreground px-3 py-3 text-[12px]">
                    No resumes match “{resumeQuery.trim()}”.
                  </li>
                ) : (
                  filteredResumes.map((r) => {
                    const checked = selectedResumeIds.has(r.id);
                    return (
                      <li key={r.id}>
                        <label
                          className={cn(
                            "hover:bg-muted/30 flex cursor-pointer items-start gap-2.5 px-3 py-2",
                            running && "pointer-events-none opacity-60",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={() => toggleResume(r.id)}
                            disabled={running}
                            className="mt-0.5"
                            aria-label={`Select ${r.displayName}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="text-foreground block truncate text-[12px] font-medium">
                              {r.displayName}
                            </span>
                            <span className="text-muted-foreground block truncate text-[10px]">
                              {r.originalFilename || r.status}
                              {r.updatedAt ? ` · ${formatUpdated(r.updatedAt)}` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          )}
        </StepBlock>

        <StepBlock
          step={3}
          title="Job content"
          open={openSteps[3]!}
          onOpenChange={(o) => setStepOpen(3, o)}
          summary={`Shared with selected engines. Preview mode: ${modeHint(previewMode)}.`}
        >
          <div className="space-y-3">
            <label className="block space-y-1 text-[12px]">
              <span className="text-foreground font-medium">Target role / title</span>
              <span className="text-muted-foreground block text-pretty text-[11px]">
                {selectedEngineList.length === 0
                  ? "Select an engine first."
                  : titleRequiredEngines.length > 0
                    ? `Required by ${engineNames(titleRequiredEngines.map((e) => e.id))}${
                        titleOptionalEngines.length
                          ? ` · optional for ${engineNames(titleOptionalEngines.map((e) => e.id))}`
                          : ""
                      }`
                    : titleOptionalEngines.length > 0
                      ? `Optional for ${engineNames(titleOptionalEngines.map((e) => e.id))}`
                      : "Not used by the selected engines."}
              </span>
              <input
                type="text"
                value={role}
                disabled={running}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Software Engineer, Cloud Engineer"
                className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px] disabled:opacity-60"
              />
            </label>
            <label className="block space-y-1 text-[12px]">
              <span className="text-foreground font-medium">Job description</span>
              <span className="text-muted-foreground block text-pretty text-[11px]">
                {selectedEngineList.length === 0
                  ? "Select an engine first."
                  : jdRequiredEngines.length > 0
                    ? `Required by ${engineNames(jdRequiredEngines.map((e) => e.id))}${
                        jdOptionalEngines.length
                          ? ` · optional for ${engineNames(jdOptionalEngines.map((e) => e.id))}`
                          : ""
                      }`
                    : jdOptionalEngines.length > 0
                      ? `Optional for ${engineNames(jdOptionalEngines.map((e) => e.id))}`
                      : "Not used by the selected engines."}
              </span>
              <textarea
                ref={jdTextareaRef}
                value={jdText}
                disabled={running}
                onChange={(e) => {
                  setJdText(e.target.value);
                  resizeJdTextarea();
                }}
                rows={6}
                placeholder="Paste the full job description here…"
                className="border-border bg-background text-foreground box-border h-auto max-h-[min(50vh,420px)] min-h-[9rem] w-full resize-y rounded-lg border px-3 py-2.5 font-sans text-[13px] leading-relaxed disabled:opacity-60"
              />
            </label>
          </div>
        </StepBlock>

        <StepBlock
          step={4}
          title="Review and run"
          open={openSteps[4]!}
          onOpenChange={(o) => setStepOpen(4, o)}
          summary={
            openSteps[4]
              ? "Confirm selection, then run analyses one cell at a time."
              : `${comboSummary.readyCount} ready · ${selectedResumeIds.size} resume${selectedResumeIds.size === 1 ? "" : "s"} · ${selectedEngineIds.size} engine${selectedEngineIds.size === 1 ? "" : "s"}`
          }
          headerRight={
            !openSteps[4] ? (
              <RunAnalysisButton
                canRun={canRun}
                running={running}
                readyCount={comboSummary.readyCount}
                onRun={() => void runProgressive()}
              />
            ) : null
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-foreground text-[12px] font-medium">Plan</p>
              <ul className="text-muted-foreground space-y-1.5 text-[12px]">
                <li>
                  <span className="text-foreground font-medium tabular-nums">
                    {selectedEngineIds.size}
                  </span>{" "}
                  engine{selectedEngineIds.size === 1 ? "" : "s"}
                  {selectedEngineList.length > 0
                    ? `: ${engineNames(selectedEngineList.map((e) => e.id))}`
                    : " — none selected"}
                </li>
                <li>
                  <span className="text-foreground font-medium tabular-nums">
                    {selectedResumeIds.size}
                  </span>{" "}
                  resume{selectedResumeIds.size === 1 ? "" : "s"}
                  {selectedResumes.length > 0
                    ? `: ${selectedResumes
                        .slice(0, 4)
                        .map((r) => r.displayName)
                        .join(
                          ", ",
                        )}${selectedResumes.length > 4 ? ` (+${selectedResumes.length - 4} more)` : ""}`
                    : " — none selected"}
                </li>
                <li>
                  Matrix:{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {selectedResumeIds.size}×{selectedEngineIds.size}
                  </span>{" "}
                  ={" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {comboSummary.total}
                  </span>{" "}
                  cells ·{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {comboSummary.readyCount}
                  </span>{" "}
                  ready to run
                  {comboSummary.needsCount > 0 ? ` · ${comboSummary.needsCount} need input` : ""}
                  {comboSummary.unsupportedCount > 0
                    ? ` · ${comboSummary.unsupportedCount} unsupported`
                    : ""}
                </li>
                <li>
                  Mode: <span className="text-foreground">{modeHint(previewMode)}</span>
                  {" · "}
                  Title:{" "}
                  <span className="text-foreground">{role.trim() ? role.trim() : "not set"}</span>
                  {" · "}
                  JD:{" "}
                  <span className="text-foreground">
                    {jdText.trim()
                      ? `${jdText.trim().length.toLocaleString()} characters`
                      : "not set"}
                  </span>
                </li>
              </ul>
            </div>

            {(titleRequiredEngines.length > 0 || jdRequiredEngines.length > 0) &&
            (!role.trim() || !jdText.trim()) ? (
              <div className="text-[11px]">
                <p className="mb-1 font-medium text-amber-600 dark:text-amber-400">
                  Missing job content
                </p>
                <ul className="text-muted-foreground space-y-0.5">
                  {titleRequiredEngines.length > 0 && !role.trim() ? (
                    <li>Title required by {engineNames(titleRequiredEngines.map((e) => e.id))}</li>
                  ) : null}
                  {jdRequiredEngines.length > 0 && !jdText.trim() ? (
                    <li>JD required by {engineNames(jdRequiredEngines.map((e) => e.id))}</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {comboSummary.needsCount > 0 ? (
              <div className="text-[11px]">
                <p className="mb-1 font-medium text-amber-600 dark:text-amber-400">
                  Needs attention
                </p>
                <ul className="text-muted-foreground space-y-0.5">
                  {[...new Map(comboSummary.needs.map((c) => [c.engineId, c])).values()].map(
                    (c) => (
                      <li key={c.engineId}>
                        {getEngine(c.engineId)?.name}: {c.reason}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ) : null}

            {comboSummary.unsupportedCount > 0 ? (
              <div className="text-[11px]">
                <p className="text-muted-foreground mb-1 font-medium">Unsupported for this mode</p>
                <ul className="text-muted-foreground space-y-0.5">
                  {[
                    ...new Map(
                      comboSummary.unsupported.map((c) => [c.engineId + c.reason, c]),
                    ).values(),
                  ]
                    .slice(0, 4)
                    .map((c) => (
                      <li key={c.engineId + (c.reason || "")}>
                        {getEngine(c.engineId)?.name}: {c.reason}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            <div className="border-border/50 flex flex-wrap items-center gap-3 border-t pt-3">
              <RunAnalysisButton
                canRun={canRun}
                running={running}
                readyCount={comboSummary.readyCount}
                onRun={() => void runProgressive()}
              />
              {running && progressLabel ? (
                <p className="text-muted-foreground text-[11px] tabular-nums">
                  {completedCount + failedCount}/{comboSummary.readyCount} · {progressLabel}
                </p>
              ) : null}
              {!running && (completedCount > 0 || failedCount > 0) ? (
                <p className="text-muted-foreground text-[11px]">
                  Last run: {completedCount} completed
                  {failedCount ? ` · ${failedCount} failed` : ""}
                </p>
              ) : null}
            </div>
            {error ? <p className="text-destructive text-[12px]">{error}</p> : null}
          </div>
        </StepBlock>

        <StepBlock
          step={5}
          title="Results"
          open={openSteps[5]!}
          onOpenChange={(o) => setStepOpen(5, o)}
          summary={
            showTable
              ? running
                ? "Cells update one at a time. Click a finished score for details."
                : "Table mirrors your selection. Ready cells fill when you run."
              : "Select at least one engine and one resume to build the table."
          }
        >
          {!showTable ? (
            <p className="text-muted-foreground text-[12px]">
              Complete steps 1 and 2 to see the comparison table here.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Select value={filterResumeId} onValueChange={setFilterResumeId}>
                  <SelectTrigger
                    className="border-border bg-background text-foreground h-8 w-auto min-w-[9rem] rounded-lg border px-2 text-[12px]"
                    aria-label="Filter by resume"
                  >
                    <SelectValue placeholder="All resumes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[12px]">
                      All resumes
                    </SelectItem>
                    {selectedResumes.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-[12px]">
                        {r.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterEngineId} onValueChange={setFilterEngineId}>
                  <SelectTrigger
                    className="border-border bg-background text-foreground h-8 w-auto min-w-[9rem] rounded-lg border px-2 text-[12px]"
                    aria-label="Filter by engine"
                  >
                    <SelectValue placeholder="All engines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[12px]">
                      All engines
                    </SelectItem>
                    {[...selectedEngineIds].map((id) => (
                      <SelectItem key={id} value={id} className="text-[12px]">
                        {getEngine(id)?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-border/60 hidden overflow-x-auto rounded-lg border md:block">
                <table className="w-full min-w-[36rem] border-collapse text-[12px]">
                  <thead>
                    <tr className="border-border/50 bg-muted/30 border-b">
                      <th className="text-muted-foreground sticky left-0 z-10 bg-[color:var(--card)] px-3 py-2.5 text-left font-medium">
                        Resume
                      </th>
                      {tableEngines.map((eng) => {
                        const sample = [...displayMap.values()].find(
                          (r) => r.engineId === eng.id && r.scoreType,
                        );
                        return (
                          <th
                            key={eng.id}
                            className="text-muted-foreground min-w-[7.5rem] px-2 py-2.5 text-center font-medium"
                          >
                            <span className="text-foreground block text-[11px]">{eng.name}</span>
                            <span className="mt-0.5 block text-[9px] font-normal">
                              {sample?.scoreType
                                ? scoreTypeLabel(sample.scoreType)
                                : scoreTypeLabel(eng.scoreTypes[0]!)}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {tableResumes.map((resume) => (
                      <tr key={resume.id} className="border-border/40 border-b last:border-b-0">
                        <td className="text-foreground sticky left-0 z-10 max-w-[11rem] truncate bg-[color:var(--card)] px-3 py-2.5 font-medium">
                          {resume.displayName}
                        </td>
                        {tableEngines.map((eng) => (
                          <td key={eng.id} className="px-2 py-2.5 text-center align-middle">
                            {renderCell(resume.id, eng.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 md:hidden">
                {tableResumes.map((resume) => (
                  <div key={resume.id} className="border-border/60 rounded-lg border p-3">
                    <p className="text-foreground mb-2 text-[12px] font-semibold">
                      {resume.displayName}
                    </p>
                    <ul className="space-y-2">
                      {tableEngines.map((eng) => (
                        <li
                          key={eng.id}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="text-muted-foreground min-w-0 truncate">{eng.name}</span>
                          <span className="shrink-0">{renderCell(resume.id, eng.id)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {detailCell?.analysis && !detailCell.analysis.error ? (
                <div className="border-border/60 rounded-xl border p-3 md:p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <p className="text-foreground text-pretty text-[12px] font-semibold">
                      Detail · {getEngine(detailCell.engineId)?.name} ·{" "}
                      {selectedResumes.find((r) => r.id === detailCell.resumeId)?.displayName}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      {detailCell.scoreName}
                      {detailCell.engineRuntime ? ` · ${detailCell.engineRuntime}` : ""}
                      {detailCell.profileVersion ? ` · v${detailCell.profileVersion}` : ""}
                    </p>
                  </div>
                  <AnalysisDetails analysis={detailCell.analysis} />
                </div>
              ) : detailCell?.error ? (
                <p className="text-destructive text-[12px]">{detailCell.error}</p>
              ) : null}
            </div>
          )}
        </StepBlock>
      </div>

      <div className="border-border/80 bg-card overflow-hidden rounded-xl border">
        <Accordion type="single" collapsible className="border-y-0">
          <AccordionItem value="scoring">
            <AccordionTrigger className="text-foreground px-4 text-[13px] font-semibold hover:no-underline md:px-5">
              How scoring works
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 px-1">
                <ScoringGuideContent />
                <p className="text-muted-foreground border-border/50 max-w-3xl text-pretty border-t pt-3 text-[11px] leading-relaxed">
                  Reference engines (Jobscan, Resume Worded, Teal, Rezi, SkillSyncer) are Aavedak
                  implementations inspired by publicly documented approaches. They are not
                  integrations with those vendors and do not claim exact proprietary parity. Scores
                  from different profiles are not calibrated against each other.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ShellWidth>
  );
}
