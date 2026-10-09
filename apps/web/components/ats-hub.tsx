"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import { CellStatusLabel, EngineLabel } from "@/components/ats-engine-badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { AnalysisDetails, modeHint, ScoringGuideContent } from "@/components/ats-analysis-panel";
import { ShellWidth } from "@/components/shell-width";
import { useAutosizeTextarea } from "@/hooks/use-autosize-textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Modal } from "@/components/ui/modal";
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
import { readRunStream } from "@/lib/ats-engines/run-stream";
import { applyCellUpdate, cellDisplay, FAILURE_LABELS } from "@/lib/ats-engines/stages";
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
    failureKind: c.status === "needs_input" ? "missing_input" : "unsupported_mode",
    mode: c.mode,
    scoreType: c.scoreType,
    scoreName: scoreTypeLabel(c.scoreType),
    error: c.reason,
    profileVersion: eng?.profileVersion,
  };
}

function newRunId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    <Card className="border-border/80 bg-card gap-0 rounded-xl border p-0">
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
    </Card>
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
  // Local copy so resumes uploaded here appear immediately without a full page reload.
  const [resumes, setResumes] = useState<ResumeRow[]>(initialResumes);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedResumeIds, setSelectedResumeIds] = useState<Set<string>>(
    () => new Set(initialResumes.map((r) => r.id)),
  );
  const [selectedEngineIds, setSelectedEngineIds] = useState<Set<AtsEngineId>>(
    () => new Set(["aavedak"]),
  );
  const [role, setRole] = useState(defaultRole);
  const [jdText, setJdText] = useState("");
  const [resumeQuery, setResumeQuery] = useState("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [results, setResults] = useState<AtsBatchResultCell[]>([]);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [filterResumeId, setFilterResumeId] = useState<string>("all");
  const [filterEngineId, setFilterEngineId] = useState<string>("all");
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({
    1: true,
    2: false,
    3: true,
    4: false,
    5: true,
  });
  const runTokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Active run id per resume × engine — updates from any other run are stale. */
  const activeRunRef = useRef(new Map<string, string>());
  const [runPlanned, setRunPlanned] = useState(0);

  function setStepOpen(step: number, open: boolean) {
    setOpenSteps((prev) => ({ ...prev, [step]: open }));
  }

  const { ref: jdTextareaRef, resize: resizeJdTextarea } = useAutosizeTextarea(jdText);

  const selectedResumes = useMemo(
    () => resumes.filter((r) => selectedResumeIds.has(r.id)),
    [resumes, selectedResumeIds],
  );

  const filteredResumes = useMemo(() => {
    const q = resumeQuery.trim().toLowerCase();
    if (!q) return resumes;
    return resumes.filter((r) => {
      const hay = `${r.displayName} ${r.originalFilename || ""} ${r.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [resumes, resumeQuery]);

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

  const safeFilterResumeId =
    filterResumeId === "all" || selectedResumeIds.has(filterResumeId) ? filterResumeId : "all";
  const safeFilterEngineId =
    filterEngineId === "all" || selectedEngineIds.has(filterEngineId as AtsEngineId)
      ? filterEngineId
      : "all";

  const tableEngines = useMemo(() => {
    const ids =
      safeFilterEngineId === "all"
        ? [...selectedEngineIds]
        : selectedEngineIds.has(safeFilterEngineId as AtsEngineId)
          ? [safeFilterEngineId as AtsEngineId]
          : [...selectedEngineIds];
    return ids
      .map((id) => getEngine(id))
      .filter((eng): eng is NonNullable<typeof eng> => Boolean(eng));
  }, [selectedEngineIds, safeFilterEngineId]);

  const tableResumes = useMemo(() => {
    if (safeFilterResumeId === "all") return selectedResumes;
    return selectedResumes.filter((r) => r.id === safeFilterResumeId);
  }, [selectedResumes, safeFilterResumeId]);

  const runCounts = useMemo(() => {
    const ran = results.filter((r) => r.runId);
    return {
      processed: ran.filter((r) => ["done", "error", "cancelled"].includes(r.status)).length,
      completed: ran.filter((r) => r.status === "done").length,
      failed: ran.filter((r) => r.status === "error").length,
      cancelled: ran.filter((r) => r.status === "cancelled").length,
    };
  }, [results]);

  function patchCell(cell: AtsBatchResultCell) {
    const key = cellKey(cell.resumeId, cell.engineId);
    const activeRunId = activeRunRef.current.get(key);
    setResults((prev) => {
      const idx = prev.findIndex((r) => cellKey(r.resumeId, r.engineId) === key);
      if (idx < 0) return [...prev, cell];
      const merged = applyCellUpdate(prev[idx], cell, activeRunId);
      if (merged === prev[idx]) return prev;
      const next = [...prev];
      next[idx] = merged;
      return next;
    });
  }

  function toggleResume(id: string) {
    if (running) return;
    setDetailKey(null);
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

  function handleUploaded(row: ResumeRow) {
    setResumes((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);
    setSelectedResumeIds((prev) => new Set(prev).add(row.id));
    setUploadOpen(false);
  }

  function toggleEngine(id: AtsEngineId) {
    if (running) return;
    setDetailKey(null);
    setSelectedEngineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runCombos(list: AnalysisCombination[], fresh: boolean) {
    const ready = list.filter((c) => c.status === "ready");
    if (!ready.length) return;
    const token = ++runTokenRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setRunPlanned(ready.length);

    const runIds = new Map<string, string>();
    for (const c of ready) {
      const key = cellKey(c.resumeId, c.engineId);
      runIds.set(key, newRunId());
      activeRunRef.current.set(key, runIds.get(key)!);
    }
    const pending = (c: AnalysisCombination): AtsBatchResultCell => ({
      ...comboToPendingCell(c),
      runId: runIds.get(cellKey(c.resumeId, c.engineId)),
    });
    if (fresh) {
      setDetailKey(null);
      setResults(combinations.map(pending));
    } else {
      setResults((prev) => {
        const keys = new Set(ready.map((c) => cellKey(c.resumeId, c.engineId)));
        return [
          ...prev.filter((r) => !keys.has(cellKey(r.resumeId, r.engineId))),
          ...ready.map(pending),
        ];
      });
    }

    const resumeName = (id: string) =>
      selectedResumes.find((r) => r.id === id)?.displayName || id.slice(0, 8);
    // Extract each resume's PDF text once per run; later engines reuse the stored text.
    const extracted = new Set<string>();

    for (const combo of ready) {
      if (runTokenRef.current !== token) break;
      const eng = getEngine(combo.engineId)!;
      const runId = runIds.get(cellKey(combo.resumeId, combo.engineId))!;
      const base: AtsBatchResultCell = {
        resumeId: combo.resumeId,
        engineId: combo.engineId,
        status: "running",
        mode: combo.mode,
        scoreType: combo.scoreType,
        scoreName: scoreTypeLabel(combo.scoreType),
        profileVersion: eng.profileVersion,
        runId,
        seq: 0,
      };
      const fail = (error: string, failureKind: AtsBatchResultCell["failureKind"]) =>
        patchCell({
          ...base,
          status: "error",
          stage: "failed",
          failureKind,
          error,
          seq: undefined,
        });
      setProgressLabel(`${resumeName(combo.resumeId)} · ${eng.name}`);
      patchCell(base);
      const forceExtract = !extracted.has(combo.resumeId);
      extracted.add(combo.resumeId);

      try {
        const res = await fetch("/api/ats/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            resumeId: combo.resumeId,
            engineId: combo.engineId,
            mode: combo.mode,
            sharedRole: role.trim(),
            sharedJdText: jdText.trim(),
            forceExtract,
            stream: true,
            runId,
          }),
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (runTokenRef.current !== token) break;
          fail(data.error || "Analysis failed.", "analysis_failure");
          continue;
        }
        const final = await readRunStream(res.body, runId, (ev) =>
          patchCell({
            ...base,
            stage: ev.stage,
            stageMessage: ev.message,
            stageAt: ev.at,
            seq: ev.seq,
          }),
        );
        if (runTokenRef.current !== token) break;
        if (final) patchCell({ ...final, runId });
        else fail("The analysis stream ended without a result.", "analysis_failure");
      } catch (err) {
        if (controller.signal.aborted || runTokenRef.current !== token) break;
        fail(err instanceof Error ? err.message : "Analysis failed.", "analysis_failure");
      }
    }

    if (runTokenRef.current === token) {
      setProgressLabel("");
      setRunning(false);
    }
  }

  function runProgressive() {
    if (!canRun) return;
    void runCombos(combinations, true);
  }

  function retryCell(resumeId: string, engineId: AtsEngineId) {
    if (running) return;
    const combo = combinations.find((c) => c.resumeId === resumeId && c.engineId === engineId);
    if (combo) void runCombos([combo], false);
  }

  function cancelRun() {
    runTokenRef.current += 1;
    abortRef.current?.abort();
    setResults((prev) =>
      prev.map((c) =>
        c.status === "queued" || c.status === "running"
          ? { ...c, status: "cancelled", stage: "cancelled", error: "Cancelled before completion." }
          : c,
      ),
    );
    setProgressLabel("");
    setRunning(false);
  }

  function renderCell(resumeId: string, engineId: AtsEngineId) {
    const key = cellKey(resumeId, engineId);
    const cell = displayMap.get(key);
    const active = detailKey === key;

    // Every state renders inside the same fixed-height box so the score ring
    // appearing never changes row height.
    const box = (content: ReactNode) => (
      <div className="flex h-14 items-center justify-center">{content}</div>
    );

    if (cell?.status === "done" && cell.overallScore != null) {
      const warned = cell.stage === "completed_with_warnings";
      return box(
        <button
          type="button"
          onClick={() => setDetailKey(active ? null : key)}
          title={`${cell.scoreLabel || "View details"}${warned ? " · completed with warnings" : ""}`}
          aria-label={`${cell.overallScore} — ${cell.scoreLabel || "view details"}${warned ? ", completed with warnings" : ""}`}
          className={cn(
            "inline-flex cursor-pointer items-center justify-center rounded-full p-0.5",
            active ? "ring-primary/60 ring-2" : "hover:ring-muted-foreground/30 hover:ring-2",
            warned && !active && "ring-2 ring-amber-500/50",
          )}
        >
          <ScoreRing value={cell.overallScore} size={44} />
        </button>,
      );
    }
    if (cell?.status === "error") {
      return box(
        <button
          type="button"
          onClick={() => setDetailKey(active ? null : key)}
          className="hover:bg-muted/40 cursor-pointer rounded-md px-1.5 py-1"
          title={cell.error}
        >
          <CellStatusLabel cell={cell} />
        </button>,
      );
    }
    return box(<CellStatusLabel cell={cell} />);
  }

  return (
    <ShellWidth className="space-y-4 py-6 sm:space-y-5 sm:py-8">
      <header className="space-y-1.5">
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">ATS score</h1>
        <p className="text-muted-foreground max-w-2xl text-pretty text-[13px] leading-relaxed">
          Follow the steps below. Results fill one cell at a time — click a score for details.
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
                        <EngineLabel engineId={eng.id} />
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
                        {eng.referenceRepo ? (
                          <p className="text-muted-foreground mt-1.5 text-[10px]">
                            Adapted from {eng.referenceRepo}
                          </p>
                        ) : null}
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
              : `${selectedResumes.length}/${resumes.length} selected`
          }
        >
          {resumes.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-muted-foreground text-[12px]">No resumes yet.</p>
              <Button
                type="button"
                size="sm"
                disabled={running}
                onClick={() => setUploadOpen(true)}
              >
                Upload resume
              </Button>
            </div>
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
                <div className="flex flex-wrap gap-2 sm:ml-auto">
                  <Button
                    type="button"
                    size="sm"
                    disabled={running}
                    onClick={() => setUploadOpen(true)}
                  >
                    Upload resume
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
                onRun={runProgressive}
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
                onRun={runProgressive}
              />
              {running ? (
                <Button type="button" size="sm" variant="outline" onClick={cancelRun}>
                  Cancel
                </Button>
              ) : null}
              {running && progressLabel ? (
                <p className="text-muted-foreground text-[11px] tabular-nums">
                  {runCounts.processed}/{runPlanned} · {progressLabel}
                </p>
              ) : null}
              {!running && runCounts.processed > 0 ? (
                <p className="text-muted-foreground text-[11px]">
                  Last run: {runCounts.completed} completed
                  {runCounts.failed ? ` · ${runCounts.failed} failed` : ""}
                  {runCounts.cancelled ? ` · ${runCounts.cancelled} cancelled` : ""}
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
                <Select
                  value={safeFilterResumeId}
                  onValueChange={(v) => setFilterResumeId(v || "all")}
                >
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
                <Select
                  value={safeFilterEngineId}
                  onValueChange={(v) => setFilterEngineId(v || "all")}
                >
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
                    {[...selectedEngineIds].map((id) => {
                      const name = getEngine(id)?.name ?? id;
                      return (
                        <SelectItem key={id} value={id} className="text-[12px]">
                          {name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-border/60 overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[36rem] border-collapse text-[12px]">
                  <thead>
                    <tr className="border-border/50 bg-muted/30 border-b">
                      <th className="text-muted-foreground bg-card sticky left-0 z-10 px-3 py-2.5 text-left font-medium">
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
                            <EngineLabel engineId={eng.id} stacked className="mx-auto" />
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
                        <td className="text-foreground bg-card sticky left-0 z-10 max-w-[11rem] truncate px-3 py-2.5 font-medium">
                          {resume.displayName}
                        </td>
                        {tableEngines.map((eng) => (
                          <td key={eng.id} className="h-16 px-2 text-center align-middle">
                            {renderCell(resume.id, eng.id)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detailCell?.analysis && !detailCell.analysis.error ? (
                <div className="border-border/60 rounded-xl border p-3 md:p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <p className="text-foreground flex flex-wrap items-center gap-1.5 text-pretty text-[12px] font-semibold">
                      <EngineLabel engineId={detailCell.engineId} />
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
              ) : detailCell?.status === "error" ? (
                <div className="border-border/60 flex flex-wrap items-center gap-2 rounded-xl border p-3 text-[12px]">
                  <EngineLabel engineId={detailCell.engineId} />
                  <span className="text-destructive font-medium">
                    {detailCell.failureKind
                      ? FAILURE_LABELS[detailCell.failureKind]
                      : cellDisplay(detailCell).label}
                  </span>
                  <span className="text-muted-foreground min-w-0 flex-1">{detailCell.error}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={running}
                    onClick={() => retryCell(detailCell.resumeId, detailCell.engineId)}
                  >
                    Retry
                  </Button>
                </div>
              ) : detailCell?.error ? (
                <p className="text-destructive text-[12px]">{detailCell.error}</p>
              ) : null}
            </div>
          )}
        </StepBlock>
      </div>

      <Card className="border-border/80 bg-card gap-0 overflow-hidden rounded-xl border p-0">
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
                  integrations with those vendors and do not claim exact proprietary parity. OSS
                  engines (Open ATS, ATS Resume Checker, Resume Skills Extractor, Hybrid Resume
                  Analyzer) adapt formulas verified in those open-source projects&rsquo; code; each
                  report lists where it deviates. Score types differ (quality, readiness,
                  similarity, match) and are not calibrated against each other.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <UploadResumeModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        existingNames={resumes.map((r) => r.displayName)}
        onUploaded={handleUploaded}
      />
    </ShellWidth>
  );
}

function UploadResumeModal({
  open,
  onClose,
  existingNames,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  existingNames: string[];
  onUploaded: (row: ResumeRow) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [files, setFiles] = useState<FileUploadFile[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPdf = useMemo(() => files.find((f) => !f.error)?.file, [files]);

  function reset() {
    setDisplayName("");
    setFiles([]);
    setError(null);
    setPending(false);
  }

  async function upload() {
    setError(null);
    if (!selectedPdf) {
      setError("Choose a PDF resume to upload.");
      return;
    }
    const name = displayName.trim() || selectedPdf.name.replace(/\.pdf$/i, "");
    if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setError("A resume with this name already exists. Choose a different name.");
      return;
    }
    setPending(true);
    try {
      const body = new FormData();
      body.set("file", selectedPdf);
      body.set("displayName", name);
      body.set("makeActive", "true");
      const res = await fetch("/api/resumes", { method: "POST", body });
      const data = (await res.json()) as { resume?: ResumeRow; error?: string };
      if (!res.ok || !data.resume) throw new Error(data.error || "Upload failed.");
      onUploaded(data.resume);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) {
          reset();
          onClose();
        }
      }}
      title="Upload resume"
      description="Add a PDF resume to score. It is saved to your Documents."
      footer={
        <>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !selectedPdf}
            onClick={() => void upload()}
          >
            {pending ? <Spinner className="size-3.5" /> : null}
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1 text-[12px]">
          <span className="text-foreground font-medium">Name</span>
          <input
            type="text"
            value={displayName}
            disabled={pending}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={
              selectedPdf ? selectedPdf.name.replace(/\.pdf$/i, "") : "e.g. Primary Resume"
            }
            maxLength={120}
            className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px] disabled:opacity-60"
          />
          <span className="text-muted-foreground block text-[11px]">
            Defaults to the file name. Must be unique.
          </span>
        </label>
        <FileUpload
          accept="application/pdf,.pdf"
          multiple={false}
          maxSize={10 * 1024 * 1024}
          files={files}
          onFilesChange={setFiles}
          disabled={pending}
        >
          <FileUploadDropzone className="min-h-32 rounded-lg text-[13px]">
            Drop a PDF resume here, or browse
          </FileUploadDropzone>
          <FileUploadList />
        </FileUpload>
        {error ? <p className="text-destructive text-[12px]">{error}</p> : null}
      </div>
    </Modal>
  );
}
