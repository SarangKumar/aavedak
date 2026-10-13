"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { EngineLabel } from "@/components/ats-engine-badge";
import { CollapsibleSection } from "@/components/collapsible-section";
import { ShellWidth } from "@/components/shell-width";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { weightedFinalScore } from "@/lib/ats-engines/aggregate";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";
import type { AtsEngineId } from "@/lib/ats-engines/types";
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
};

function okScore(s: EngineScore | undefined): number | null {
  return s && s.ok && typeof s.score === "number" ? s.score : null;
}

function finalOf(scores: Record<string, EngineScore>) {
  return weightedFinalScore(
    Object.entries(scores)
      .map(([engineId, s]) => ({ engineId: engineId as AtsEngineId, score: okScore(s) }))
      .filter((e): e is { engineId: AtsEngineId; score: number } => e.score !== null),
  );
}

function Delta({ before, after }: { before: number | null; after: number | null }) {
  if (before === null || after === null) return <span className="text-muted-foreground">—</span>;
  const d = after - before;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        d > 0 && "text-green-700 dark:text-green-500",
        d < 0 && "text-destructive",
        d === 0 && "text-muted-foreground",
      )}
    >
      {d > 0 ? `+${d}` : d}
    </span>
  );
}

function ChangeRow({
  change,
  checked,
  disabled,
  onToggle,
}: {
  change: ImproveChange;
  checked: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
}) {
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
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImproveResult | null>(null);
  // The exact inputs the current result was computed with; toggles re-score with these unchanged.
  const [request, setRequest] = useState<Request | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const runSeq = useRef(0);
  // Every engine by default; the user can deselect.
  const [selectedEngines, setSelectedEngines] = useState<Set<string>>(
    () => new Set(ATS_ENGINES.map((e) => e.id)),
  );

  useEffect(() => {
    fetch("/api/resumes")
      .then(async (res) => {
        const data = (await res.json()) as { resumes?: ResumeRow[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Failed to load resumes.");
        const list = data.resumes ?? [];
        setResumes(list);
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
  const finals = useMemo(
    () => (scores ? { before: finalOf(scores.before), after: finalOf(scores.after) } : null),
    [scores],
  );
  const acceptedCount = result?.changes.filter((c) => c.accepted).length ?? 0;

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

  const canRun = Boolean(resumeId && role.trim()) && selectedEngines.size > 0 && !running;

  return (
    <ShellWidth className="space-y-4 py-6 sm:space-y-5 sm:py-8">
      <header className="space-y-1.5">
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Improve resume</h1>
        <p className="text-muted-foreground max-w-2xl text-pretty text-[13px] leading-relaxed">
          Rewords weak bullets, groups your skills and orders things for the role. It never adds
          skills, numbers, employers or dates you didn&apos;t write — gaps are listed for you to
          fill in honestly. Both versions are scored with the same engines and inputs.
        </p>
      </header>

      <CollapsibleSection step={1} title="Choose a resume" defaultOpen>
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="imp-resume">Resume to improve</Label>
          {loadError ? (
            <p className="text-destructive text-[12px]">{loadError}</p>
          ) : resumes && resumes.length === 0 ? (
            <p className="text-muted-foreground text-[12px]">
              No resumes yet.{" "}
              <Link href="/documents?tab=resumes&upload=1" className="text-primary hover:underline">
                Upload one
              </Link>
              .
            </p>
          ) : (
            <Select value={resumeId} onValueChange={setResumeId} disabled={!resumes || running}>
              <SelectTrigger id="imp-resume" className="w-full">
                <SelectValue placeholder={resumes ? "Pick a resume" : "Loading…"} />
              </SelectTrigger>
              <SelectContent>
                {(resumes ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.displayName}
                    {r.status === "active" ? " (active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        step={2}
        title="Target job and engines"
        open={Boolean(resumeId)}
        summary={resumeId ? undefined : <span>Choose a resume first</span>}
      >
        <fieldset disabled={!resumeId || running} className="space-y-4 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1.5">
              <Label htmlFor="imp-role">Job title</Label>
              <Input
                id="imp-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Backend Engineer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="imp-years">Years exp.</Label>
              <Input
                id="imp-years"
                type="number"
                min={0}
                max={60}
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>
          </div>
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
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label>Engines</Label>
              <span className="text-muted-foreground text-[11px]">
                {selectedEngines.size} of {ATS_ENGINES.length} selected
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() =>
                  setSelectedEngines(
                    selectedEngines.size === ATS_ENGINES.length
                      ? new Set()
                      : new Set(ATS_ENGINES.map((e) => e.id)),
                  )
                }
              >
                {selectedEngines.size === ATS_ENGINES.length ? "Clear" : "Select all"}
              </Button>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {ATS_ENGINES.map((eng) => (
                <label
                  key={eng.id}
                  className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5"
                >
                  <Checkbox
                    checked={selectedEngines.has(eng.id)}
                    onChange={(e) => {
                      const next = new Set(selectedEngines);
                      if (e.target.checked) next.add(eng.id);
                      else next.delete(eng.id);
                      setSelectedEngines(next);
                    }}
                    aria-label={`Score with ${eng.name}`}
                  />
                  <EngineLabel engineId={eng.id} />
                  {eng.jd === "required" ? (
                    <span className="text-muted-foreground ml-auto text-[10px]">needs JD</span>
                  ) : null}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={start} disabled={!canRun}>
            {running ? <Spinner /> : null}
            {result ? "Run again" : "Improve"}
          </Button>
          {running && result ? (
            <span className="text-muted-foreground text-[12px]">Re-scoring…</span>
          ) : null}
        </div>
        {error ? (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CollapsibleSection>

      {result && request ? (
        <>
          {result.structureConfidence === "low" || result.documentProblems.length > 0 ? (
            <Alert>
              <AlertTitle>Limited changes</AlertTitle>
              <AlertDescription>
                {result.documentProblems.length > 0
                  ? "The combined changes failed a safety check, so the original was kept."
                  : "Couldn't find clear sections or bullets in this PDF's text, so few changes were possible."}
              </AlertDescription>
            </Alert>
          ) : null}

          <CollapsibleSection
            title="Scores"
            defaultOpen
            summary={
              finals?.before && finals.after ? (
                <span>
                  Final {finals.before.score} → {finals.after.score}
                </span>
              ) : undefined
            }
          >
            {scores ? (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-lg border">
                  <Table className="text-[12px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Engine</TableHead>
                        <TableHead className="text-right">Before</TableHead>
                        <TableHead className="text-right">After</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                        <TableHead>Version · mode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scores.snapshot.engines.map((id) => {
                        const b = scores.before[id];
                        const a = scores.after[id];
                        return (
                          <TableRow key={id}>
                            <TableCell>
                              <EngineLabel engineId={id as AtsEngineId} />
                            </TableCell>
                            {b && !b.ok ? (
                              <TableCell colSpan={3} className="text-muted-foreground text-right">
                                {b.message}
                              </TableCell>
                            ) : (
                              <>
                                <TableCell className="text-right tabular-nums">
                                  {okScore(b) ?? "—"}
                                </TableCell>
                                <TableCell className="text-right font-medium tabular-nums">
                                  {okScore(a) ?? "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Delta before={okScore(b)} after={okScore(a)} />
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-muted-foreground">
                              {b && b.ok
                                ? `${b.engineVersion ?? "—"} · ${(b.mode ?? scores.snapshot.mode).replace("_", " ")}`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">Final weighted score</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {finals?.before?.score ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {finals?.after?.score ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Delta
                            before={finals?.before?.score ?? null}
                            after={finals?.after?.score ?? null}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          weights from the ATS page
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Identical request for both versions: role “{scores.snapshot.role}” · years{" "}
                  {scores.snapshot.yearsExperience ?? "not set"} ·{" "}
                  {request.jdText.trim() ? `JD #${scores.snapshot.jdHash}` : "no JD"} · improver v
                  {result.improverVersion}. Only the resume text differs. Scores can stay the same
                  or drop — they are shown as computed.
                  {request.jdText.trim()
                    ? ""
                    : " Jobscan and SkillSyncer need a job description, so they're skipped."}
                </p>
              </div>
            ) : null}
          </CollapsibleSection>

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
                    onToggle={(v) => toggle(c.id, v)}
                  />
                ))}
              </ul>
            )}
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void downloadResumePdf(result.revised, saveName)}
              >
                Download PDF
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void downloadResumeDocx(result.revised, saveName)}
              >
                Download DOCX
              </Button>
              <div className="ml-auto flex min-w-64 flex-1 items-end gap-2 sm:flex-none">
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
        </>
      ) : null}
    </ShellWidth>
  );
}
