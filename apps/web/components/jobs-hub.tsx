"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CompanySelect } from "@/components/company-select";
import { EngineKindBadge } from "@/components/ats-engine-badge";
import { BoardToggleLink, FullscreenBoard } from "@/components/fullscreen-board";
import { PersonVote, personInitials, type VoteSummaryDto } from "@/components/person-vote";
import { ShellWidth } from "@/components/shell-width";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ResizeHandle } from "@/components/ui/resize-handle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScoreRing } from "@/components/ui/score-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { STATUS_LABELS, isApplicationStatus } from "@/lib/application-status";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";
import type { AtsEngineId } from "@/lib/ats-engines/types";
import { saveAtsPrefill } from "@/lib/ats-prefill";
import { JOB_SOURCES, type JobSource } from "@/lib/job-constants";
import type { JobDtoBase } from "@/lib/job-dto";
import { cn } from "@/lib/utils";
import { SearchInput } from "@/components/search-input";

export type JobDto = JobDtoBase;

export type JobsTab = "discover" | "applied";

type ResumeLite = { id: string; displayName: string; status: string };

type JobsHubProps = {
  /** "page" = normal Jobs page; "board" = full-screen board only (/jobs/board). */
  variant?: "page" | "board";
  initialTab?: JobsTab;
  initialJobId?: string | null;
  resumes: ResumeLite[];
  initialDiscover: JobDto[];
  initialApplied: JobDto[];
  discoveryEnabled: boolean;
  profileSettingsHref: string;
};

type JobPersonDto = {
  id: string;
  name: string;
  roleTitle: string | null;
  email: string | null;
  linkedin: string | null;
  origin: "system" | "user";
  relevanceReason: string;
  votes: VoteSummaryDto;
};

/** Must match JOB_EXPIRY_DAYS in the API (default 30). Display only. */
const EXPIRY_DAYS = 30;

const SOURCE_LABELS: Record<JobSource, string> = {
  manual: "Manual",
  linkedin: "LinkedIn",
  careers: "Careers",
  indeed: "Indeed",
  other: "Other",
};

const PANE_WIDTH_KEY = "aavedak-jobs-list-width";

function initials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function relativeAge(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** "Posted 3d ago" for discovered jobs (or "First seen" when the source had no date). */
function ageLabel(job: JobDto): string {
  if (!job.discovered) return `Added ${relativeAge(job.createdAt)}`;
  if (job.postedAt && !job.postedAtEstimated) return `Posted ${relativeAge(job.postedAt)}`;
  return `First seen ${relativeAge(job.firstSeenAt ?? job.createdAt)}`;
}

function daysLeft(job: JobDto): number | null {
  if (!job.discovered) return null;
  const age = daysSince(job.postedAt ?? job.firstSeenAt);
  return age === null ? null : Math.max(0, EXPIRY_DAYS - age);
}

function statusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return isApplicationStatus(status) ? STATUS_LABELS[status] : status;
}

export function JobsHub({
  variant = "page",
  initialTab = "discover",
  initialJobId = null,
  resumes,
  initialDiscover,
  initialApplied,
  discoveryEnabled,
  profileSettingsHref,
}: JobsHubProps) {
  const [tab, setTab] = useState<JobsTab>(initialTab);
  const [discover, setDiscover] = useState(initialDiscover);
  const [applied, setApplied] = useState(initialApplied);
  const jobs = tab === "discover" ? discover : applied;
  const [selectedId, setSelectedId] = useState<string | null>(
    initialJobId ?? (initialTab === "applied" ? initialApplied : initialDiscover)[0]?.id ?? null,
  );

  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [listWidth, setListWidth] = useState(360);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    company: "",
    location: "",
    source: "manual" as JobSource,
    url: "",
    salary: "",
    description: "",
  });
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PANE_WIDTH_KEY);
      if (!raw) return;
      const n = Number(raw);
      if (Number.isFinite(n)) setListWidth(Math.min(560, Math.max(260, n)));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PANE_WIDTH_KEY, String(listWidth));
    } catch {
      /* ignore */
    }
  }, [listWidth]);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { all: jobs.length };
    for (const job of jobs) counts[job.sourceLabel] = (counts[job.sourceLabel] ?? 0) + 1;
    return counts;
  }, [jobs]);
  const sourceOptions = useMemo(
    () =>
      Object.keys(sourceCounts)
        .filter((k) => k !== "all")
        .sort(),
    [sourceCounts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (sourceFilter !== "all" && job.sourceLabel !== sourceFilter) return false;
      if (!q) return true;
      return (
        job.title.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q) ||
        job.description.toLowerCase().includes(q)
      );
    });
  }, [jobs, query, sourceFilter]);

  const selected = filtered.find((j) => j.id === selectedId) ?? filtered[0] ?? null;

  function switchTab(next: string) {
    const value: JobsTab = next === "applied" ? "applied" : "discover";
    setTab(value);
    setSourceFilter("all");
    setSelectedId((value === "applied" ? applied : discover)[0]?.id ?? null);
  }

  function onResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: event.clientX, startWidth: listWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const delta = event.clientX - dragRef.current.startX;
    const next = Math.min(560, Math.max(260, dragRef.current.startWidth + delta));
    setListWidth(next);
  }

  function onResizeEnd() {
    dragRef.current = null;
  }

  async function createJob() {
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          company: draft.company,
          location: draft.location,
          source: draft.source,
          url: draft.url || null,
          salary: draft.salary || null,
          description: draft.description,
        }),
      });
      const data = (await res.json()) as { job?: JobDto; error?: string };
      if (!res.ok) throw new Error(data.error || "Create failed.");
      if (data.job) {
        setDiscover((list) => [data.job!, ...list]);
        setTab("discover");
        setSelectedId(data.job.id);
      }
      setDraft({
        title: "",
        company: "",
        location: "",
        source: "manual",
        url: "",
        salary: "",
        description: "",
      });
      setAddOpen(false);
      setMessage("Job added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setPending(false);
    }
  }

  async function ignoreJob(id: string) {
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/jobs/${id}/ignore`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not ignore.");
      setDiscover((list) => list.filter((j) => j.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast.add({ title: "Ignored", description: "Hidden from Discover.", type: "info" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ignore.");
    } finally {
      setPending(false);
    }
  }

  /** Bookmark / Apply create an application; the job moves to the Applied tab. */
  async function createApplicationFromJob(job: JobDto, status: "bookmarked" | "applied") {
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: job.company,
          role: job.title,
          location: job.location,
          salaryCtc: job.salary,
          jobLink: job.url,
          jobId: job.id,
          status,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        duplicateWarning?: boolean;
        application?: { id: string; status: string };
      };
      if (!res.ok) throw new Error(data.error || "Could not create application.");
      const moved: JobDto = {
        ...job,
        applicationId: data.application?.id ?? null,
        applicationStatus: data.application?.status ?? status,
      };
      setDiscover((list) => list.filter((j) => j.id !== job.id));
      setApplied((list) => [moved, ...list.filter((j) => j.id !== job.id)]);
      setSelectedId(null);
      const label = status === "bookmarked" ? "Bookmarked" : "Marked applied";
      setMessage(
        data.duplicateWarning
          ? `${label} — moved to Applied (possible duplicate company+role in tracker).`
          : `${label} — moved to Applied. Continue in the Job tracker.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create application.");
    } finally {
      setPending(false);
    }
  }

  async function pasteJd() {
    setError(null);
    setMessage(null);
    if (!pasteText.trim()) {
      setError("Paste a job description first.");
      return;
    }
    setPending(true);
    try {
      // Register as a manual job so it can be scored + used for cover letters
      const lines = pasteText
        .trim()
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
      const titleGuess = lines[0]?.slice(0, 120) || "Pasted role";
      const companyGuess =
        lines
          .find((l) => /^company\s*:/i.test(l))
          ?.split(":")
          .slice(1)
          .join(":")
          .trim() || "Custom company";
      const createRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleGuess,
          company: companyGuess,
          location: "Remote",
          source: "manual",
          description: pasteText,
        }),
      });
      const createData = (await createRes.json()) as { job?: JobDto; error?: string };
      if (!createRes.ok) throw new Error(createData.error || "Could not register job.");
      if (createData.job) {
        setDiscover((list) => [createData.job!, ...list]);
        setTab("discover");
        setSelectedId(createData.job.id);
      }
      await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: pasteText,
          jobId: createData.job?.id ?? null,
        }),
      });
      setPasteOpen(false);
      setPasteText("");
      setMessage(
        `Registered job · Match ${createData.job?.compatibilityScore ?? "—"}% · JD quality ${createData.job?.atsScore ?? "—"}%. Generate a cover letter from Documents.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setPending(false);
    }
  }

  const boardQuery = `tab=${tab}${selected ? `&job=${encodeURIComponent(selected.id)}` : ""}`;

  const notices = (
    <>
      {tab === "discover" && !discoveryEnabled ? (
        <Card size="sm" className="border-dashed">
          <CardHeader>
            <CardTitle className="text-[13px]">Daily discovery is paused</CardTitle>
            <CardDescription className="text-[12px]">
              You won&apos;t get new recommendations until you turn it back on. Existing ones stay
              here until you apply or ignore them.{" "}
              <Link href={profileSettingsHref} className="text-primary hover:underline">
                Profile settings → Job discovery
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      {message ? (
        <p className="text-primary text-[13px]">
          {message}{" "}
          <Link href="/job-tracker" className="font-medium underline-offset-2 hover:underline">
            Open tracker
          </Link>
        </p>
      ) : null}
    </>
  );

  const board = (
    <>
      {/* Top bar: search, filter, add, expand/collapse */}
      <Card size="sm" className="flex-row flex-wrap items-center gap-2 p-2 sm:flex-nowrap">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, company, location, description…"
          className="w-full sm:max-w-md"
          aria-label="Search jobs"
        />
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v || "all")}>
          <SelectTrigger
            className="border-border bg-background h-8 w-auto min-w-[10rem] rounded-md border px-2.5 text-[12px]"
            aria-label="Filter by source"
          >
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent className="z-[240]">
            <SelectItem value="all" className="text-[12px]">
              All sources ({sourceCounts.all ?? 0})
            </SelectItem>
            {sourceOptions.map((key) => (
              <SelectItem key={key} value={key} className="text-[12px]">
                {key} ({sourceCounts[key] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
          {filtered.length} of {jobs.length}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setPasteOpen(true)}>
            Paste JD
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            Add job
          </Button>
          <BoardToggleLink
            expanded={variant === "board"}
            href={variant === "board" ? `/jobs?${boardQuery}` : `/jobs/board?${boardQuery}`}
            label="jobs board"
          />
        </div>
      </Card>

      {/* Two cards with a gap (list | details). Each scrolls on its own. */}
      <div
        className={cn(
          "flex flex-col gap-4 md:flex-row md:gap-0",
          variant === "board" ? "min-h-0 flex-1" : "md:h-[calc(100dvh-17rem)] md:min-h-[32rem]",
        )}
      >
        <Card
          className="flex max-h-[60vh] w-full shrink-0 flex-col gap-0 overflow-hidden p-0 md:max-h-none md:w-[var(--jobs-list-width)] md:max-w-[min(100%,560px)]"
          style={{ ["--jobs-list-width" as string]: `${listWidth}px` }}
        >
          <div className="border-border/60 border-b p-3">
            <Tabs value={tab} onValueChange={switchTab}>
              <TabsList className="w-full">
                <TabsTrigger value="discover" className="flex-1">
                  Discover
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                    {discover.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="applied" className="flex-1">
                  Applied
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                    {applied.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <JobList
            jobs={filtered}
            tab={tab}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        </Card>

        {/* The gap between the cards doubles as the resize handle. */}
        <div className="hidden w-2 shrink-0 justify-center md:flex">
          <ResizeHandle
            aria-label="Resize panes"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
          />
        </div>

        <Card className="bg-muted/20 min-h-0 min-w-0 flex-1 gap-0 overflow-y-auto p-3 sm:p-4">
          {!selected ? (
            <EmptyState
              tab={tab}
              hasJobs={jobs.length > 0}
              discoveryEnabled={discoveryEnabled}
              onAdd={() => setAddOpen(true)}
            />
          ) : (
            <JobDetail
              key={selected.id}
              job={selected}
              tab={tab}
              pending={pending}
              resumes={resumes}
              onApply={() => void createApplicationFromJob(selected, "applied")}
              onBookmark={() => void createApplicationFromJob(selected, "bookmarked")}
              onIgnore={() => void ignoreJob(selected.id)}
            />
          )}
        </Card>
      </div>
    </>
  );

  const modals = (
    <>
      <Modal open={addOpen} title="Add job" onClose={() => setAddOpen(false)}>
        <div className="space-y-2.5">
          <Field
            label="Title *"
            value={draft.title}
            onChange={(v) => setDraft((d) => ({ ...d, title: v }))}
          />
          <label className="block space-y-1">
            <span className="text-foreground text-[12px] font-medium">Company *</span>
            <CompanySelect
              value={draft.company}
              onChange={(name) => setDraft((d) => ({ ...d, company: name }))}
              placeholder="e.g. Stripe"
            />
          </label>
          <Field
            label="Location *"
            value={draft.location}
            onChange={(v) => setDraft((d) => ({ ...d, location: v }))}
          />
          <label className="block space-y-1">
            <span className="text-foreground text-[12px] font-medium">Source</span>
            <Select
              value={draft.source}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, source: (v as JobSource) || d.source }))
              }
            >
              <SelectTrigger className="border-border bg-background text-foreground h-9 w-full rounded-md border px-2.5 text-[13px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent className="z-[240]">
                {JOB_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Field
            label="URL"
            value={draft.url}
            onChange={(v) => setDraft((d) => ({ ...d, url: v }))}
          />
          <Field
            label="Salary / CTC"
            value={draft.salary}
            onChange={(v) => setDraft((d) => ({ ...d, salary: v }))}
          />
          <label className="block space-y-1">
            <span className="text-foreground text-[12px] font-medium">Description</span>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={5}
              className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-[13px]"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="border-border text-muted-foreground inline-flex h-8 items-center rounded-md border px-3 text-[12px]"
            >
              Cancel
            </button>
            <Button
              type="button"
              size="sm"
              loading={pending}
              onClick={() => void createJob()}
              className="h-8"
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={pasteOpen}
        title="Paste JD (private analysis)"
        onClose={() => setPasteOpen(false)}
        description="Registers the JD as a job on your Jobs list, scores resume match + ATS, then you can generate a cover letter."
      >
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={10}
          placeholder="Paste job description text…"
          className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-[13px]"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPasteOpen(false)}
            className="border-border text-muted-foreground inline-flex h-8 items-center rounded-md border px-3 text-[12px]"
          >
            Cancel
          </button>
          <Button
            type="button"
            size="sm"
            loading={pending}
            onClick={() => void pasteJd()}
            className="h-8"
          >
            Save analysis
          </Button>
        </div>
      </Modal>
    </>
  );

  if (variant === "board") {
    // Full-screen board: covers the site header/footer; only the board is shown.
    return (
      <FullscreenBoard>
        {notices}
        {board}
        {modals}
      </FullscreenBoard>
    );
  }

  return (
    <ShellWidth className="aavedak-fade-up flex flex-col gap-4 py-6 sm:py-8">
      <header className="space-y-1">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Jobs</h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          Junior engineering roles in India, discovered daily from company career pages and ranked
          against your resume.
        </p>
      </header>
      {notices}
      {board}
      <HowJobsWork />
      {modals}
    </ShellWidth>
  );
}

function EmptyState({
  tab,
  hasJobs,
  discoveryEnabled,
  onAdd,
}: {
  tab: JobsTab;
  hasJobs: boolean;
  discoveryEnabled: boolean;
  onAdd: () => void;
}) {
  let text = "Select a job to see details.";
  if (!hasJobs && tab === "applied") {
    text = "Nothing here yet. Apply to or bookmark a job from Discover and it moves here.";
  } else if (!hasJobs) {
    text = discoveryEnabled
      ? "No new matches right now. Discovery scans career pages every night (IST) and adds up to 50 new junior roles a day."
      : "Discovery is paused. Add a job manually or turn discovery back on in Profile settings.";
  }
  return (
    <div className="text-muted-foreground flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center text-[13px]">
      <p className="max-w-sm">{text}</p>
      {!hasJobs && tab === "discover" ? (
        <Button type="button" variant="link" size="sm" onClick={onAdd}>
          Add a job manually
        </Button>
      ) : null}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-foreground text-[13px] font-semibold tracking-tight">{children}</h3>
      {action}
    </div>
  );
}

/** Right-hand side: four separate cards — job, about/JD, people, resume (ATS). */
function JobDetail({
  job,
  tab,
  pending,
  resumes,
  onApply,
  onBookmark,
  onIgnore,
}: {
  job: JobDto;
  tab: JobsTab;
  pending: boolean;
  resumes: ResumeLite[];
  onApply: () => void;
  onBookmark: () => void;
  onIgnore: () => void;
}) {
  const left = daysLeft(job);
  const reasons = [...(job.reasons?.skills ?? []), ...(job.reasons?.roles ?? [])].slice(0, 8);

  async function copyDescription() {
    try {
      await navigator.clipboard.writeText(job.description);
      toast.add({ title: "Job description copied", type: "success", duration: 2000 });
    } catch {
      toast.add({
        title: "Could not copy",
        description: "Your browser blocked clipboard access.",
        type: "error",
      });
    }
  }

  return (
    // flex-1: fill the details panel's full height (board and page) so no empty band is left.
    <div className="flex flex-1 flex-col gap-4">
      {/* 1 · Job */}
      <Card className="gap-3">
        <div className="flex items-start gap-3">
          <Avatar className="size-10 rounded-md">
            <AvatarFallback className="rounded-md text-[12px] font-semibold">
              {initials(job.company)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="aavedak-display text-foreground text-lg leading-snug sm:text-xl">
              {job.title}
            </h2>
            <p className="text-muted-foreground text-[13px]">
              <span className="text-foreground/90">{job.company}</span> · {job.location}
            </p>
          </div>
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "xs" })}
            >
              Original post ↗
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {job.sourceLabel}
          </Badge>
          {tab === "applied" && job.applicationStatus ? (
            <Badge className="text-[10px]">{statusLabel(job.applicationStatus)}</Badge>
          ) : null}
          {job.compatibilityScore != null ? (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              Match {job.compatibilityScore}%
            </Badge>
          ) : null}
          {job.atsScore != null ? (
            <Badge
              variant="secondary"
              className="text-[10px] tabular-nums"
              title="How complete and parseable the job description is"
            >
              JD quality {job.atsScore}%
            </Badge>
          ) : null}
          <Badge variant="secondary" className="text-[10px]">
            {job.minYears == null
              ? "Experience not stated"
              : job.minYears === 0
                ? "Fresher friendly"
                : `${job.minYears}+ yrs`}
          </Badge>
          {job.salary ? (
            <Badge variant="secondary" className="text-[10px]">
              {job.salary}
            </Badge>
          ) : null}
          <span className="text-muted-foreground text-[11px]">{ageLabel(job)}</span>
          {left !== null ? (
            <span
              className={cn(
                "text-[11px]",
                left <= 5 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              · {left === 0 ? "expires today" : `${left}d left`}
            </span>
          ) : null}
        </div>

        {reasons.length > 0 ? (
          <p className="text-muted-foreground text-[11px]">
            Matches your profile: <span className="text-foreground/90">{reasons.join(", ")}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {tab === "discover" ? (
            <>
              <Button type="button" size="sm" loading={pending} onClick={onApply}>
                Mark applied
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={onBookmark}
              >
                Bookmark
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onIgnore}>
                Ignore
              </Button>
            </>
          ) : (
            <Link
              href="/job-tracker"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open in tracker
            </Link>
          )}
          <Link
            href={`/documents?tab=cover_letters&jobId=${job.id}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Cover letter
          </Link>
        </div>
      </Card>

      {/* 2 · About / JD — stretches to take any spare height */}
      <Card className="min-h-48 flex-1 gap-2">
        <SectionTitle
          action={
            job.description ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => void copyDescription()}
                aria-label="Copy job description"
                title="Copy job description"
              >
                <CopyIcon />
              </Button>
            ) : null
          }
        >
          About the job
        </SectionTitle>
        <pre className="text-muted-foreground min-h-0 flex-1 overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
          {job.description || "No description provided."}
        </pre>
      </Card>

      {/* 3 · People */}
      <JobPeople jobId={job.id} company={job.company} />

      {/* 4 · Resume (ATS) */}
      <JobAtsCheck job={job} resumes={resumes} />
    </div>
  );
}

type AtsResultCell = {
  status: string;
  overallScore?: number | null;
  scoreName?: string;
  error?: string;
  failureKind?: string;
};

type AtsCellState = AtsResultCell | "running" | "queued";

const atsKey = (resumeId: string, engineId: string) => `${resumeId}::${engineId}`;

/**
 * Resume × engine matrix for this job, like the ATS page: pick resumes and any number of
 * engines, run them, see a score per cell. "Detailed scan" opens the ATS page pre-filled.
 */
function JobAtsCheck({ job, resumes }: { job: JobDto; resumes: ResumeLite[] }) {
  const router = useRouter();
  const [resumeIds, setResumeIds] = useState<Set<string>>(() => new Set(resumes.map((r) => r.id)));
  const [engineIds, setEngineIds] = useState<Set<AtsEngineId>>(() => new Set(["aavedak"]));
  const [cells, setCells] = useState<Record<string, AtsCellState>>({});
  const [running, setRunning] = useState(false);
  const runToken = useRef(0);

  const selectedResumes = resumes.filter((r) => resumeIds.has(r.id));
  const selectedEngines = ATS_ENGINES.filter((e) => engineIds.has(e.id));
  const total = selectedResumes.length * selectedEngines.length;
  const done = Object.values(cells).filter((c) => c !== "running" && c !== "queued").length;

  function toggleResume(id: string, on: boolean) {
    setResumeIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleEngine(id: AtsEngineId) {
    setEngineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runOne(resumeId: string, engineId: AtsEngineId, forceExtract: boolean) {
    const key = atsKey(resumeId, engineId);
    setCells((prev) => ({ ...prev, [key]: "running" }));
    let cell: AtsResultCell;
    try {
      const res = await fetch("/api/ats/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId,
          engineId,
          sharedRole: job.title,
          sharedJdText: job.description.slice(0, 40_000),
          forceExtract,
        }),
      });
      const data = (await res.json()) as { result?: AtsResultCell; error?: string };
      cell = data.result ?? { status: "error", error: data.error || "Scan failed." };
    } catch {
      cell = { status: "error", error: "Network error." };
    }
    setCells((prev) => ({ ...prev, [key]: cell }));
  }

  async function runScan() {
    if (total === 0) return;
    const token = ++runToken.current;
    setRunning(true);
    setCells(
      Object.fromEntries(
        selectedResumes.flatMap((r) =>
          selectedEngines.map((e) => [atsKey(r.id, e.id), "queued" as const]),
        ),
      ),
    );
    // Resumes in parallel (Promise.all); each resume's engines in order so its PDF text is
    // extracted once by the first engine and reused by the rest.
    await Promise.all(
      selectedResumes.map(async (resume) => {
        for (const [index, engine] of selectedEngines.entries()) {
          if (runToken.current !== token) return;
          await runOne(resume.id, engine.id, index === 0);
        }
      }),
    );
    if (runToken.current === token) setRunning(false);
  }

  function openDetailed() {
    saveAtsPrefill({
      role: job.title,
      jdText: job.description.slice(0, 40_000),
      resumeIds: [...resumeIds],
      engineIds: [...engineIds],
      job: { id: job.id, title: job.title, company: job.company, url: job.url },
    });
    router.push("/ats");
  }

  function renderCell(resumeId: string, engineId: AtsEngineId) {
    const cell = cells[atsKey(resumeId, engineId)];
    // Every state renders in the same fixed-height, centered box: the score ring appearing
    // never changes the row height, and the spinner sits in the middle of the cell.
    const box = (content: React.ReactNode, title?: string) => (
      <div className="flex h-16 items-center justify-center" title={title}>
        {content}
      </div>
    );
    if (!cell) return box(<span className="text-muted-foreground text-[11px]">—</span>);
    if (cell === "queued")
      return box(<span className="text-muted-foreground text-[10px]">Queued</span>);
    if (cell === "running") return box(<Spinner className="size-5" label="Scanning" />);
    if (cell.status === "done" && cell.overallScore != null) {
      return box(<ScoreRing value={cell.overallScore} size={44} />, cell.scoreName);
    }
    return box(
      <span
        className={cn(
          "px-1 text-[10px] leading-tight",
          cell.status === "excluded" || cell.status === "unsupported"
            ? "text-muted-foreground"
            : "text-destructive",
        )}
      >
        {cell.status === "excluded"
          ? "Needs input"
          : cell.status === "unsupported"
            ? "Unsupported"
            : "Failed"}
      </span>,
      cell.error,
    );
  }

  return (
    <Card className="gap-3">
      <SectionTitle
        action={
          running ? (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {done} of {total} done
            </span>
          ) : null
        }
      >
        Resume check (ATS)
      </SectionTitle>

      {resumes.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">
          Upload a resume in{" "}
          <Link href="/documents" className="text-primary hover:underline">
            Documents
          </Link>{" "}
          to score it against this job.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-[11px] font-medium">Engines</p>
            <div className="flex flex-wrap gap-1" role="group" aria-label="ATS engines">
              {ATS_ENGINES.map((eng) => {
                const on = engineIds.has(eng.id);
                return (
                  <Button
                    key={eng.id}
                    type="button"
                    size="xs"
                    variant="outline"
                    aria-pressed={on}
                    disabled={running}
                    onClick={() => toggleEngine(eng.id)}
                    title={eng.shortDescription}
                    className={cn(
                      "gap-1.5",
                      on
                        ? "border-primary text-foreground hover:bg-transparent"
                        : "text-muted-foreground",
                    )}
                  >
                    {on ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="text-primary size-3"
                        aria-hidden
                      >
                        <path
                          d="m5 12.5 4.5 4.5L19 7.5"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                    {eng.name}
                    <EngineKindBadge engineId={eng.id} />
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="border-border/60 overflow-x-auto rounded-md border">
            {/* Fixed layout: the resume column has a set width and every engine column is the
                same width, so the score rings line up in an even grid. */}
            <table
              className="w-full table-fixed border-collapse text-[12px]"
              style={{ minWidth: `${12 + selectedEngines.length * 7}rem` }}
            >
              <colgroup>
                <col className="w-48" />
                {selectedEngines.map((eng) => (
                  <col key={eng.id} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-border/40 border-b">
                  {/* Frozen first column: stays in place while engine columns scroll. */}
                  <th className="text-muted-foreground bg-card after:bg-border/60 sticky left-0 z-10 h-12 px-3 text-left align-middle font-medium after:absolute after:inset-y-0 after:right-0 after:w-px">
                    Resume
                  </th>
                  {selectedEngines.map((eng) => (
                    <th
                      key={eng.id}
                      className="text-muted-foreground h-12 px-2 text-center align-middle text-[11px] font-medium leading-tight"
                    >
                      {eng.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resumes.map((resume) => (
                  <tr key={resume.id} className="border-border/40 border-b last:border-b-0">
                    <td className="bg-card after:bg-border/60 sticky left-0 z-10 px-3 align-middle after:absolute after:inset-y-0 after:right-0 after:w-px">
                      <label className="flex min-w-0 cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={resumeIds.has(resume.id)}
                          onChange={(e) => toggleResume(resume.id, e.target.checked)}
                          disabled={running}
                          aria-label={`Include ${resume.displayName}`}
                        />
                        <span className="text-foreground truncate">{resume.displayName}</span>
                        {resume.status === "active" ? (
                          <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
                            Active
                          </Badge>
                        ) : null}
                      </label>
                    </td>
                    {selectedEngines.map((eng) => (
                      <td key={eng.id} className="p-0 align-middle">
                        {resumeIds.has(resume.id) ? (
                          renderCell(resume.id, eng.id)
                        ) : (
                          <div className="h-16" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              loading={running}
              disabled={total === 0}
              onClick={() => void runScan()}
            >
              Run {total > 0 ? `${total} scan${total === 1 ? "" : "s"}` : "scan"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={openDetailed}>
              Detailed scan on ATS page →
            </Button>
            <span className="text-muted-foreground text-[11px]">
              Opens the ATS page with this job, your resumes and engines filled in.
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

/** People at the job's company, for a referral ask (relevance first, then community votes). */
function JobPeople({ jobId, company }: { jobId: string; company: string }) {
  const [people, setPeople] = useState<JobPersonDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${jobId}/people`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: { people: JobPersonDto[] }) => {
        if (!cancelled) setPeople(data.people);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <Card className="gap-2">
      <SectionTitle>People at {company}</SectionTitle>
      {failed ? (
        <p className="text-muted-foreground text-[12px]">Could not load people.</p>
      ) : people === null ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : people.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">
          No one at {company} yet.{" "}
          <Link href="/people" className="text-primary hover:underline">
            Add a contact
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-2.5">
              <Avatar className="size-7">
                <AvatarFallback className="text-[10px]">
                  {personInitials(person.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-foreground flex items-center gap-1.5 truncate text-[12px] font-medium">
                  {person.name}
                  {person.origin === "system" ? (
                    <Badge variant="outline" className="px-1 py-0 text-[9px]">
                      Discovered
                    </Badge>
                  ) : null}
                </p>
                <p className="text-muted-foreground truncate text-[11px]">
                  {person.roleTitle ?? "Role unknown"} · {person.relevanceReason}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {person.linkedin ? (
                  <a
                    href={person.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "ghost", size: "xs" })}
                  >
                    LinkedIn
                  </a>
                ) : null}
                {person.email ? (
                  <Link
                    href={`/referrals?personId=${person.id}`}
                    className={buttonVariants({ variant: "ghost", size: "xs" })}
                  >
                    Ask
                  </Link>
                ) : null}
                <PersonVote personId={person.id} initial={person.votes} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-[10px]">
        Votes are a community signal, not a promise to refer.
      </p>
    </Card>
  );
}

/** Last section of the page, like the ATS page's "How scoring works". */
function HowJobsWork() {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl p-0">
      <Accordion type="single" collapsible className="border-y-0">
        <AccordionItem value="how">
          <AccordionTrigger className="text-foreground px-4 text-[13px] font-semibold hover:no-underline md:px-5">
            How Jobs works
          </AccordionTrigger>
          <AccordionContent>
            <div className="text-muted-foreground grid gap-4 px-4 pb-1 text-[12px] leading-relaxed md:grid-cols-2 md:px-5">
              <div className="space-y-1">
                <p className="text-foreground font-medium">Where jobs come from</p>
                <p>
                  Every night (IST) Aavedak scans company career boards — Greenhouse, Lever, Ashby,
                  SmartRecruiters, Workable and career pages that publish structured job data. Each
                  card shows its source and links to the original post. Sites without permitted
                  access (LinkedIn, Naukri, Indeed) are not scraped; add those jobs with Add job or
                  Paste JD.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-foreground font-medium">What gets recommended</p>
                <p>
                  Only India-based engineering roles that ask for under 3 years of experience are
                  kept. Each day you get up to 50 new matches, ranked by how well they fit your
                  skills, preferred roles, locations and resume text. Turn this off in Profile
                  settings → Job discovery.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-foreground font-medium">Discover, Applied and expiry</p>
                <p>
                  Matches stay in Discover until you mark them applied, bookmark or ignore them —
                  applied and bookmarked jobs move to Applied and into your tracker. Jobs leave both
                  tabs 30 days after posting; an early-stage application is then marked Rejected
                  with a &ldquo;Job expired&rdquo; badge, and you can change it back anytime.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-foreground font-medium">ATS check and people</p>
                <p>
                  Run scan scores your selected resumes against this job with one engine. For the
                  full report and improvement tips, use Detailed scan — it opens the ATS page with
                  everything filled in. People at the company are possible referral contacts; votes
                  from other users are a signal, not a promise to refer.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

function JobList({
  jobs,
  tab,
  selectedId,
  onSelect,
}: {
  jobs: JobDto[];
  tab: JobsTab;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (jobs.length === 0) {
    return (
      <div className="text-muted-foreground p-6 text-center text-[13px]">No matching jobs.</div>
    );
  }
  return (
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {jobs.map((job) => (
        <li key={job.id} className="relative">
          <button
            type="button"
            onClick={() => onSelect(job.id)}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2.5 text-left transition-colors",
              job.url && "pr-20",
              selectedId === job.id
                ? "border-primary/40 bg-primary/10"
                : "hover:border-border hover:bg-accent/40 border-transparent",
            )}
          >
            <Avatar className="mt-0.5 size-8 rounded-md">
              <AvatarFallback className="rounded-md text-[10px] font-semibold">
                {initials(job.company)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-[13px] font-semibold">{job.title}</p>
              <p className="text-muted-foreground truncate text-[12px]">
                {job.company} · {job.location}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {job.sourceLabel}
                </Badge>
                {tab === "applied" && job.applicationStatus ? (
                  <Badge className="px-1.5 py-0 text-[10px]">
                    {statusLabel(job.applicationStatus)}
                  </Badge>
                ) : null}
                {job.compatibilityScore != null ? (
                  <span className="text-foreground/80 text-[10px] font-medium tabular-nums">
                    Match {job.compatibilityScore}%
                  </span>
                ) : null}
                <span className="text-muted-foreground text-[10px]">{ageLabel(job)}</span>
              </div>
            </div>
          </button>
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary absolute right-2.5 top-2.5 text-[11px] font-medium hover:underline"
              title="Open the original job posting"
              aria-label={`Original post for ${job.title} at ${job.company}`}
            >
              Original ↗
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-foreground text-[12px] font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-background text-foreground h-9 w-full rounded-md border px-3 text-[13px]"
      />
    </label>
  );
}
