"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { EngineLabel } from "@/components/ats-engine-badge";
import { AtsEnginePicker } from "@/components/ats-engine-picker";
import { AtsScoreMatrix } from "@/components/ats-score-matrix";
import { CollapsibleSection } from "@/components/collapsible-section";
import { FeatureHeading, FeatureIcon } from "@/components/feature-heading";
import { ResumePreviewDialog } from "@/components/resume-preview";
import { ShellWidth } from "@/components/shell-width";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScoreRing } from "@/components/ui/score-ring";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { FinalScoreEntry } from "@/lib/ats-engines/aggregate";
import { ATS_ENGINES, getEngine } from "@/lib/ats-engines/registry";
import type { AtsEngineId } from "@/lib/ats-engines/types";
import { takeImprovePrefill, type ImprovePrefill } from "@/lib/improve-prefill";
import { downloadResumeDocx, downloadResumePdf, resumePdfBlob } from "@/lib/resume-download";
import type {
  AlignmentItem,
  EngineScore,
  ImproveChange,
  ImproveResult,
} from "@/lib/resume-improver-types";
import { cn } from "@/lib/utils";

type ResumeRow = { id: string; displayName: string; status: string };

type Request = {
  resumeId: string;
  role: string;
  jdText: string;
  yearsExperience: number | null;
  engines: string[];
};

const KIND_LABEL: Record<ImproveChange["kind"], string> = {
  bullet: "Bullet wording",
  skills: "Skills grouping",
  bullet_order: "Bullet order",
  section_order: "Section order",
  date_format: "Date format",
  separators: "Contact separators",
};

// Row ids for the before/after score table.
const BEFORE_ROW = "before";
const AFTER_ROW = "after";

function okScore(s: EngineScore | undefined): number | null {
  return s && s.ok && typeof s.score === "number" ? s.score : null;
}

function finalEntries(scores: Record<string, EngineScore>): FinalScoreEntry[] {
  return Object.entries(scores)
    .map(([engineId, s]) => ({ engineId: engineId as AtsEngineId, score: okScore(s) }))
    .filter((e): e is FinalScoreEntry => e.score !== null);
}

function Delta({ before, after }: { before: number | null; after: number | null }) {
  if (before === null || after === null) return null;
  const d = after - before;
  return (
    <span
      className={cn(
        "text-[10px] font-medium tabular-nums",
        d > 0 && "text-green-700 dark:text-green-500",
        d < 0 && "text-destructive",
        d === 0 && "text-muted-foreground",
      )}
    >
      {d > 0 ? `+${d}` : d}
    </span>
  );
}

/** Measured effect of one change on each engine, biggest first; zero effects are left out. */
function ImpactLine({ impact }: { impact: Record<string, number> | undefined }) {
  if (!impact) return null;
  const moved = Object.entries(impact)
    .filter(([, d]) => d !== 0)
    .sort((a, b) => b[1] - a[1]);
  if (moved.length === 0) {
    return <span className="text-muted-foreground block text-[11px]">No effect on the scores</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {moved.map(([engineId, d]) => (
        <span
          key={engineId}
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
            d > 0
              ? "border-green-600/30 text-green-700 dark:text-green-500"
              : "border-destructive/30 text-destructive",
          )}
        >
          {d > 0 ? `+${d}` : d} {getEngine(engineId)?.name ?? engineId}
        </span>
      ))}
    </span>
  );
}

function ChangeRow({
  change,
  checked,
  disabled,
  impact,
  onToggle,
}: {
  change: ImproveChange;
  checked: boolean;
  disabled: boolean;
  impact: Record<string, number> | undefined;
  onToggle: (v: boolean) => void;
}) {
  const net = impact ? Object.values(impact).reduce((a, b) => a + b, 0) : 0;
  const id = `chg-${change.id}`;
  return (
    <li className="flex gap-3 rounded-lg border p-3">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5"
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-1.5 text-[13px]">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{KIND_LABEL[change.kind]}</Badge>
          <span className="text-muted-foreground text-[12px]">{change.reason}</span>
        </span>
        <ImpactLine impact={impact} />
        {net < 0 ? (
          <span className="text-muted-foreground block text-[11px]">
            Left unticked: it lowers the scores overall. Tick it if you prefer the wording.
          </span>
        ) : null}
        {change.kind === "bullet" ? (
          <>
            <span className="text-muted-foreground block line-through decoration-1">
              {change.before[0]}
            </span>
            <span className="text-foreground block">{change.after[0]}</span>
          </>
        ) : (
          <span className="grid gap-2 sm:grid-cols-2">
            <span className="text-muted-foreground block whitespace-pre-line">
              {change.before.join("\n")}
            </span>
            <span className="text-foreground block whitespace-pre-line">
              {change.after.join("\n")}
            </span>
          </span>
        )}
      </label>
    </li>
  );
}

function SkillChips({
  items,
  variant,
}: {
  items: AlignmentItem[];
  variant: "inverted" | "secondary" | "outline";
}) {
  if (items.length === 0) return <p className="text-muted-foreground text-[12px]">None.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Badge key={i.skill} variant={variant} title={i.evidence[0]?.text}>
          {i.label}
          {i.importance === "required" ? <span className="opacity-70">· required</span> : null}
        </Badge>
      ))}
    </div>
  );
}

export function ResumeImprover({
  defaultRole,
  defaultYearsExperience,
}: {
  defaultRole: string;
  defaultYearsExperience: number | null;
}) {
  const [resumes, setResumes] = useState<ResumeRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [years, setYears] = useState(
    defaultYearsExperience === null ? "" : String(defaultYearsExperience),
  );
  const [jdText, setJdText] = useState("");
  const [prefilledJob, setPrefilledJob] = useState<ImprovePrefill["job"] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImproveResult | null>(null);
  // The exact inputs the current result was computed with; toggles re-score with these unchanged.
  const [request, setRequest] = useState<Request | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [previewResume, setPreviewResume] = useState<ResumeRow | null>(null);
  // Per-change score effects are measured on the first run only; toggles keep showing them.
  const [impacts, setImpacts] = useState<Record<string, Record<string, number>>>({});
  const runSeq = useRef(0);
  // Every engine by default, as on the ATS page; the user can deselect.
  const [selectedEngines, setSelectedEngines] = useState<Set<AtsEngineId>>(
    () => new Set(ATS_ENGINES.map((e) => e.id)),
  );

  // A job opened from the Jobs page fills in its title and description (read once).
  useEffect(() => {
    const prefill = takeImprovePrefill();
    if (!prefill) return;
    if (prefill.role.trim()) setRole(prefill.role);
    setJdText(prefill.jdText);
    setPrefilledJob(prefill.job);
  }, []);

  useEffect(() => {
    fetch("/api/resumes")
      .then(async (res) => {
        const data = (await res.json()) as { resumes?: ResumeRow[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Failed to load resumes.");
        const list = data.resumes ?? [];
        setResumes(list);
        // Start from the active resume when there is one.
        const active = list.find((r) => r.status === "active");
        if (active) setResumeId((current) => current || active.id);
      })
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load resumes."),
      );
  }, []);

  async function run(req: Request, accepted: string[] | null) {
    const seq = ++runSeq.current;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/resume-improver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, accepted }),
      });
      const data = (await res.json()) as ImproveResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "Improve failed.");
      if (seq !== runSeq.current) return;
      if (accepted === null) {
        setImpacts(
          Object.fromEntries(
            data.changes
              .filter((c) => c.impact)
              .map((c) => [c.id, c.impact as Record<string, number>]),
          ),
        );
      }
      setResult(data);
      setRequest(req);
      setSavedId(null);
    } catch (err) {
      if (seq === runSeq.current) setError(err instanceof Error ? err.message : "Improve failed.");
    } finally {
      if (seq === runSeq.current) setRunning(false);
    }
  }

  function start() {
    const y = years.trim() === "" ? null : Number(years);
    const req: Request = {
      resumeId,
      role: role.trim(),
      jdText,
      yearsExperience: y !== null && Number.isFinite(y) ? y : null,
      engines: ATS_ENGINES.filter((e) => selectedEngines.has(e.id)).map((e) => e.id),
    };
    const name = resumes?.find((r) => r.id === resumeId)?.displayName ?? "Resume";
    setSaveName(`${name} – improved for ${req.role}`.slice(0, 120));
    void run(req, null);
  }

  function toggle(changeId: string, on: boolean) {
    if (!result || !request) return;
    const accepted = result.changes
      .filter((c) => (c.id === changeId ? on : c.accepted))
      .map((c) => c.id);
    void run(request, accepted);
  }

  const scores = result?.scores;
  const acceptedCount = result?.changes.filter((c) => c.accepted).length ?? 0;
  const sourceResume = resumes?.find((r) => r.id === request?.resumeId) ?? null;

  const scoreRows = useMemo(
    () => [
      {
        id: BEFORE_ROW,
        displayName: sourceResume ? `Original · ${sourceResume.displayName}` : "Original",
        status: "",
      },
      { id: AFTER_ROW, displayName: "Improved", status: "" },
    ],
    [sourceResume],
  );

  async function save() {
    if (!result || !request || !scores) return;
    setSaving(true);
    try {
      const pdf = await resumePdfBlob(result.revised);
      const form = new FormData();
      form.append("file", new File([pdf], "improved-resume.pdf", { type: "application/pdf" }));
      form.append(
        "meta",
        JSON.stringify({
          sourceResumeId: request.resumeId,
          displayName: saveName.trim(),
          revisedText: result.revisedText,
          role: request.role,
          jdText: request.jdText,
          yearsExperience: request.yearsExperience,
          snapshot: scores.snapshot,
          beforeScores: scores.before,
          afterScores: scores.after,
          changes: result.changes,
        }),
      );
      const res = await fetch("/api/resume-improver/save", { method: "POST", body: form });
      const data = (await res.json()) as { resume?: { id: string }; error?: string };
      if (!res.ok || !data.resume) throw new Error(data.error || "Save failed.");
      setSavedId(data.resume.id);
      toast.add({ title: "Saved as a new inactive resume", type: "success" });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : "Save failed.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function renderScoreCell(rowId: string, engineId: AtsEngineId) {
    const box = (content: React.ReactNode, title?: string) => (
      <div className="relative flex h-12 items-center justify-center" title={title}>
        {content}
      </div>
    );
    if (!scores) return box(null);
    const before = scores.before[engineId];
    const cell = rowId === BEFORE_ROW ? before : scores.after[engineId];
    if (cell && !cell.ok) {
      return box(
        <span className="text-muted-foreground px-1 text-[10px] leading-tight">Skipped</span>,
        cell.message,
      );
    }
    const value = okScore(cell);
    if (value === null) return box(<span className="text-muted-foreground text-[11px]">—</span>);
    return box(
      <>
        <ScoreRing value={value} size="xs" />
        {rowId === AFTER_ROW ? (
          // Pinned just right of the ring (xs ring = 2rem) so the ring stays centred in both rows.
          <span className="absolute left-[calc(50%+1.2rem)] top-1/2 -translate-y-1/2">
            <Delta before={okScore(before)} after={value} />
          </span>
        ) : null}
      </>,
      cell && cell.ok ? `${cell.engineVersion ?? ""} · ${(cell.mode ?? "").replace("_", " ")}` : "",
    );
  }

  const canRun = Boolean(resumeId && role.trim()) && selectedEngines.size > 0 && !running;
  const selectedResume = resumes?.find((r) => r.id === resumeId) ?? null;
  const snapshotEngines = (scores?.snapshot.engines ?? []).filter((id) => getEngine(id));

  return (
    <ShellWidth className="space-y-4 py-6 sm:space-y-5 sm:py-8">
      <header className="space-y-1.5">
        <FeatureHeading feature="improveResume" />
        <p className="text-muted-foreground max-w-2xl text-pretty text-[13px] leading-relaxed">
          Rewords weak bullets, groups your skills and orders things for the role. It never adds
          skills, numbers, employers or dates you didn&apos;t write — gaps are listed for you to
          fill in honestly. Both versions are scored with the same engines and inputs.
        </p>
      </header>

      {prefilledJob ? (
        <Card
          size="sm"
          className="border-primary/30 bg-primary/5 flex-row flex-wrap items-center gap-2 text-[12px]"
        >
          <span className="text-foreground min-w-0 flex-1">
            Loaded from Jobs:{" "}
            <span className="font-medium">
              {prefilledJob.title}
              {prefilledJob.company ? ` · ${prefilledJob.company}` : ""}
            </span>{" "}
            — job title and description are filled in below.
          </span>
          {prefilledJob.url ? (
            <a
              href={prefilledJob.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary shrink-0 font-medium hover:underline"
            >
              Original post ↗
            </a>
          ) : null}
          <Button type="button" size="xs" variant="ghost" onClick={() => setPrefilledJob(null)}>
            Dismiss
          </Button>
        </Card>
      ) : null}

      <CollapsibleSection
        step={1}
        title="Resume and target job"
        defaultOpen
        summary={
          selectedResume ? (
            <span>
              {selectedResume.displayName} · {role.trim() || "no title"}
            </span>
          ) : undefined
        }
      >
        <fieldset disabled={running} className="space-y-4 disabled:opacity-60">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_9rem] md:items-end">
            <div className="min-w-0 space-y-1.5">
              <Label>Reference resume</Label>
              {loadError ? (
                <p className="text-destructive text-[12px]">{loadError}</p>
              ) : resumes && resumes.length === 0 ? (
                <p className="text-muted-foreground text-[12px]">
                  No resumes yet.{" "}
                  <Link
                    href="/documents?tab=resumes&upload=1"
                    className="text-primary hover:underline"
                  >
                    Upload one
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Combobox
                      value={resumeId || undefined}
                      onValueChange={(v) => setResumeId(v ?? "")}
                      disabled={!resumes || running}
                    >
                      <ComboboxTrigger
                        placeholder={resumes ? "Pick a resume" : "Loading…"}
                        aria-label="Reference resume"
                        className="h-9 w-full text-[13px]"
                      />
                      <ComboboxContent
                        searchPlaceholder="Search resumes…"
                        emptyMessage="No matching resume."
                      >
                        {(resumes ?? []).map((r) => (
                          <ComboboxItem key={r.id} value={r.id}>
                            {r.status === "active" ? `${r.displayName} (active)` : r.displayName}
                          </ComboboxItem>
                        ))}
                      </ComboboxContent>
                    </Combobox>
                  </div>
                  {selectedResume ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewResume(selectedResume)}
                    >
                      Preview
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-role">Role</Label>
              <Input
                id="imp-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Backend Engineer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-years">Years of experience</Label>
              <Input
                id="imp-years"
                type="number"
                min={0}
                max={60}
                step={0.5}
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>
          </div>
          <p className="text-muted-foreground -mt-2 text-[11px]">
            Years of experience starts from your profile
            {defaultYearsExperience === null ? " (not set there)" : ""}; changing it here affects
            only this run.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="imp-jd">Job description (optional)</Label>
            <Textarea
              id="imp-jd"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={5}
              maxRows={16}
              placeholder="Paste it to align with the posting's requirements. Without it, the role's usual skills are used."
              className="min-h-28 font-sans text-[13px] leading-relaxed"
            />
          </div>
        </fieldset>
      </CollapsibleSection>

      <CollapsibleSection
        step={2}
        title="Engines to improve for (optional)"
        summary={
          <span>
            {selectedEngines.size === ATS_ENGINES.length
              ? `All ${ATS_ENGINES.length} engines`
              : `${selectedEngines.size} of ${ATS_ENGINES.length} engines`}{" "}
            · each change is measured on these, and one that lowers their scores starts unticked
          </span>
        }
        headerRight={
          <>
            {running && result ? (
              <span className="text-muted-foreground text-[12px]">Re-scoring…</span>
            ) : null}
            <Button
              type="button"
              onClick={start}
              disabled={!canRun}
              title={
                !resumeId
                  ? "Pick a resume first"
                  : !role.trim()
                    ? "Enter a role first"
                    : selectedEngines.size === 0
                      ? "Select at least one engine"
                      : undefined
              }
            >
              {running ? (
                <Spinner />
              ) : (
                <FeatureIcon feature="improveResume" className="text-current" />
              )}
              {result ? "Improve again" : "Improve resume"}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground mb-3 text-[12px]">
          The resume is improved for the engines you pick: every candidate change is scored on them,
          changes that keep or raise their scores are applied, and ones that would lower them are
          listed unticked. The before/after table scores the same engines.
        </p>
        <AtsEnginePicker
          selected={selectedEngines}
          onChange={setSelectedEngines}
          disabled={running}
        />
      </CollapsibleSection>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {result && request ? (
        <>
          {result.documentProblems.length > 0 ? (
            <Alert>
              <AlertTitle>Original kept</AlertTitle>
              <AlertDescription>
                Applying these changes would alter a fact on your resume, so nothing was changed:{" "}
                {result.documentProblems.join("; ")}.
              </AlertDescription>
            </Alert>
          ) : result.structureConfidence === "low" ? (
            <Alert>
              <AlertTitle>Limited changes</AlertTitle>
              <AlertDescription>
                Couldn&apos;t find clear sections or bullets in this PDF&apos;s text, so few changes
                were possible.
              </AlertDescription>
            </Alert>
          ) : null}

          <CollapsibleSection
            title="Changes"
            defaultOpen
            summary={
              <span>
                {acceptedCount} of {result.changes.length} applied
              </span>
            }
          >
            {result.changes.length === 0 ? (
              <p className="text-muted-foreground text-[13px]">
                No safe changes found — the wording and order already follow the rules.
              </p>
            ) : (
              <ul className="space-y-2">
                {result.changes.map((c) => (
                  <ChangeRow
                    key={c.id}
                    change={c}
                    checked={c.accepted}
                    disabled={running}
                    impact={impacts[c.id]}
                    onToggle={(v) => toggle(c.id, v)}
                  />
                ))}
              </ul>
            )}
            {result.dropped.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-foreground text-[12px] font-medium">
                  Left out to keep your facts intact
                </p>
                <p className="text-muted-foreground text-[11px]">
                  After all changes are applied, the whole resume is checked again: your name and
                  contact lines, job titles, numbers, dates and skills must stay exactly as you
                  wrote them, and it can&apos;t grow more than 5%. These changes broke that check in
                  combination with the others, so they weren&apos;t applied.
                </p>
                <ul className="space-y-1">
                  {result.dropped.map((d) => (
                    <li key={d.id} className="text-[12px]">
                      <span className="text-foreground">{KIND_LABEL[d.kind]}</span>
                      <span className="text-muted-foreground"> — {d.reasons.join("; ")}</span>
                      {d.before[0] ? (
                        <span className="text-muted-foreground block truncate">
                          “{d.before[0]}”
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.rejected.length > 0 ? (
              <p className="text-muted-foreground mt-3 text-[11px]">
                {result.rejected.length} candidate change{result.rejected.length === 1 ? "" : "s"}{" "}
                skipped because they would have changed a fact.
              </p>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection
            title="Remaining gaps"
            defaultOpen
            summary={<span>{result.alignment.missing.length} missing</span>}
          >
            <div className="space-y-4 text-[13px]">
              <p className="text-muted-foreground text-[12px]">
                {result.alignment.source === "jd"
                  ? "Requirements found in the job description."
                  : `Usual skills for ${result.rolePack.label}${result.rolePack.matched ? "" : " (no specific guidance for this title — generic rules used)"}.`}{" "}
                Missing items are not added: only list them if you really have the experience.
              </p>
              <div className="space-y-1.5">
                <p className="font-medium">Shown in your experience</p>
                <SkillChips items={result.alignment.supported} variant="inverted" />
              </div>
              <div className="space-y-1.5">
                <p className="font-medium">Only in your skills list</p>
                <p className="text-muted-foreground text-[12px]">
                  A bullet showing where you used these makes them count more.
                </p>
                <SkillChips items={result.alignment.skillsOnly} variant="secondary" />
              </div>
              <div className="space-y-1.5">
                <p className="font-medium">Not on your resume</p>
                <SkillChips items={result.alignment.missing} variant="outline" />
              </div>
              {result.suggestions.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="font-medium">Only you can fix these</p>
                  <ul className="space-y-1.5">
                    {result.suggestions.slice(0, 12).map((s, i) => (
                      <li key={`${s.lineId}-${s.kind}-${i}`} className="text-[12px]">
                        <span className="text-foreground">{s.message}</span>
                        {s.text ? (
                          <span className="text-muted-foreground block truncate">“{s.text}”</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Revised resume" defaultOpen>
            <Card size="sm" className="max-h-112 overflow-auto">
              <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed">
                {result.revisedText}
              </pre>
            </Card>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="flex min-w-64 flex-1 items-end gap-2 sm:max-w-md">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="imp-save-name">Save as</Label>
                  <Input
                    id="imp-save-name"
                    value={saveName}
                    maxLength={120}
                    onChange={(e) => setSaveName(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void save()}
                  disabled={saving || running || !saveName.trim() || Boolean(savedId)}
                >
                  {saving ? <Spinner /> : null}
                  {savedId ? "Saved" : "Save as new resume"}
                </Button>
              </div>
            </div>
            <p className="text-muted-foreground mt-2 text-[11px]">
              Plain single-column layout. Saved as a new inactive resume linked to the original; the
              original is not changed.
              {savedId ? (
                <>
                  {" "}
                  <Link href="/documents?tab=resumes" className="text-primary hover:underline">
                    View in Documents
                  </Link>
                  .
                </>
              ) : null}
            </p>
          </CollapsibleSection>

          {scores ? (
            <CollapsibleSection title="ATS scores" defaultOpen>
              <div className="space-y-2">
                <AtsScoreMatrix
                  engines={snapshotEngines.map((id) => ({
                    id: id as AtsEngineId,
                    header: (
                      <EngineLabel engineId={id as AtsEngineId} stacked className="mx-auto" />
                    ),
                  }))}
                  resumes={scoreRows}
                  renderCell={renderScoreCell}
                  finalScores={(rowId) =>
                    finalEntries(rowId === BEFORE_ROW ? scores.before : scores.after)
                  }
                  renderRowActions={(row) =>
                    row.id === BEFORE_ROW ? (
                      <a
                        href={`/api/resumes/${request.resumeId}/file`}
                        download
                        className={buttonVariants({ variant: "outline", size: "xs" })}
                      >
                        PDF
                      </a>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => void downloadResumePdf(result.revised, saveName)}
                        >
                          PDF
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => void downloadResumeDocx(result.revised, saveName)}
                        >
                          DOCX
                        </Button>
                      </>
                    )
                  }
                />
                <p className="text-muted-foreground text-[11px]">
                  Identical request for both versions: role “{scores.snapshot.role}” · years{" "}
                  {scores.snapshot.yearsExperience ?? "not set"} ·{" "}
                  {request.jdText.trim() ? `JD #${scores.snapshot.jdHash}` : "no JD"} · improver v
                  {result.improverVersion}. Only the resume text differs. Scores can stay the same
                  or drop — they are shown as computed.
                  {request.jdText.trim() ? "" : " Engines that need a job description are skipped."}
                </p>
              </div>
            </CollapsibleSection>
          ) : null}
        </>
      ) : null}

      <ResumePreviewDialog resume={previewResume} onClose={() => setPreviewResume(null)} />
    </ShellWidth>
  );
}
