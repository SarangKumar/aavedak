"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { CompanySelect } from "@/components/company-select";
import { PersonVote, personInitials, type VoteSummaryDto } from "@/components/person-vote";
import { ShellWidth } from "@/components/shell-width";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ResizeHandle } from "@/components/ui/resize-handle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { STATUS_LABELS, isApplicationStatus } from "@/lib/application-status";
import { JOB_SOURCES, type JobSource } from "@/lib/job-constants";
import type { JobDtoBase } from "@/lib/job-dto";
import { cn } from "@/lib/utils";

export type JobDto = JobDtoBase;

type JobsTab = "discover" | "applied";

type JobsHubProps = {
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
  initialDiscover,
  initialApplied,
  discoveryEnabled,
  profileSettingsHref,
}: JobsHubProps) {
  const [tab, setTab] = useState<JobsTab>("discover");
  const [discover, setDiscover] = useState(initialDiscover);
  const [applied, setApplied] = useState(initialApplied);
  const jobs = tab === "discover" ? discover : applied;
  const [selectedId, setSelectedId] = useState<string | null>(initialDiscover[0]?.id ?? null);
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
    for (const s of JOB_SOURCES) counts[s] = 0;
    for (const job of jobs) counts[job.source] = (counts[job.source] ?? 0) + 1;
    return counts;
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (sourceFilter !== "all" && job.source !== sourceFilter) return false;
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

  const sourceChipOrder: Array<"all" | JobSource> = [
    "all",
    "careers",
    "linkedin",
    "indeed",
    "manual",
    "other",
  ];

  return (
    <ShellWidth className="aavedak-fade-up flex flex-col gap-5 py-8 sm:py-10">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
            आवेदक
          </p>
          <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Jobs</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            Junior engineering roles in India, discovered daily from company career pages and ranked
            against your resume. Jobs leave both tabs {EXPIRY_DAYS} days after posting.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
            Paste JD
          </Button>
          <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
            Add job
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={tab} onValueChange={switchTab}>
            <TabsList>
              <TabsTrigger value="discover">
                Discover jobs
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                  {discover.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="applied">
                Applied jobs
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                  {applied.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, company, or description…"
              className="h-8 w-full text-[13px] sm:w-72"
              aria-label="Search jobs"
            />
            <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
              {filtered.length} of {jobs.length}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by source">
          {sourceChipOrder.map((key) => {
            const count = sourceCounts[key] ?? 0;
            if (key !== "all" && count === 0) return null;
            const active = sourceFilter === key;
            const label = key === "all" ? "All sources" : SOURCE_LABELS[key];
            return (
              <Button
                key={key}
                type="button"
                size="xs"
                variant={active ? "secondary" : "ghost"}
                aria-pressed={active}
                onClick={() => setSourceFilter(key)}
                className="rounded-full"
              >
                {label}
                <span className="tabular-nums opacity-70">{count}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      {message ? (
        <p className="text-primary text-[13px]">
          {message}{" "}
          <Link href="/job-tracker" className="font-medium underline-offset-2 hover:underline">
            Open tracker
          </Link>
        </p>
      ) : null}

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

      <Card className="min-h-[30rem] gap-0 overflow-hidden p-0 md:flex-row">
        <aside
          className="border-border/60 flex w-full shrink-0 flex-col border-b md:w-[var(--jobs-list-width)] md:max-w-[min(100%,560px)] md:border-b-0 md:border-r"
          style={{ ["--jobs-list-width" as string]: `${listWidth}px` }}
        >
          <JobList
            jobs={filtered}
            tab={tab}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        </aside>

        <ResizeHandle
          aria-label="Resize panes"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          className="hidden shrink-0 md:flex"
        />

        <section className="min-w-0 flex-1 p-4 sm:p-5">
          {!selected ? (
            <EmptyState
              tab={tab}
              hasJobs={jobs.length > 0}
              discoveryEnabled={discoveryEnabled}
              onAdd={() => setAddOpen(true)}
            />
          ) : (
            <JobDetail
              job={selected}
              tab={tab}
              pending={pending}
              onApply={() => void createApplicationFromJob(selected, "applied")}
              onBookmark={() => void createApplicationFromJob(selected, "bookmarked")}
              onIgnore={() => void ignoreJob(selected.id)}
            />
          )}
        </section>
      </Card>

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
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-[13px]">
      <p className="max-w-sm">{text}</p>
      {!hasJobs && tab === "discover" ? (
        <Button type="button" variant="link" size="sm" onClick={onAdd}>
          Add a job manually
        </Button>
      ) : null}
    </div>
  );
}

function JobDetail({
  job,
  tab,
  pending,
  onApply,
  onBookmark,
  onIgnore,
}: {
  job: JobDto;
  tab: JobsTab;
  pending: boolean;
  onApply: () => void;
  onBookmark: () => void;
  onIgnore: () => void;
}) {
  const left = daysLeft(job);
  const reasons = [...(job.reasons?.skills ?? []), ...(job.reasons?.roles ?? [])].slice(0, 8);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-11 rounded-md">
          <AvatarFallback className="rounded-md text-[13px] font-semibold">
            {initials(job.company)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={job.discovered ? "outline" : "secondary"}
              className="text-[10px] uppercase"
            >
              {job.discovered ? "Discovered" : SOURCE_LABELS[job.source]}
            </Badge>
            {tab === "applied" && job.applicationStatus ? (
              <Badge className="text-[10px]">{statusLabel(job.applicationStatus)}</Badge>
            ) : null}
            {job.minYears != null ? (
              <Badge variant="secondary" className="text-[10px]">
                {job.minYears === 0 ? "Fresher friendly" : `${job.minYears}+ yrs`}
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
          <h2 className="aavedak-display text-foreground text-xl sm:text-2xl">{job.title}</h2>
          <p className="text-foreground/90 text-[13px]">
            {job.company}
            <span className="text-muted-foreground"> · {job.location}</span>
          </p>
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-[12px] hover:underline"
            >
              Original post ↗
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetaChip
          label="Match"
          value={job.compatibilityScore != null ? `${job.compatibilityScore}%` : "—"}
        />
        <MetaChip label="JD quality" value={job.atsScore != null ? `${job.atsScore}%` : "—"} />
        <MetaChip
          label="Experience"
          value={job.minYears != null ? `${job.minYears}+ yrs` : "Not stated"}
        />
        <MetaChip label="Comp" value={job.salary ?? "—"} />
      </div>

      {reasons.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-[11px]">Matches your profile:</span>
          {reasons.map((r) => (
            <Badge key={r} variant="outline" className="text-[10px]">
              {r}
            </Badge>
          ))}
        </div>
      ) : null}

      {tab === "discover" ? (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" loading={pending} onClick={onApply}>
            Mark applied
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onBookmark}>
            Bookmark
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onIgnore}>
            Ignore
          </Button>
          <Link
            href={`/documents?tab=cover_letters&jobId=${job.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Cover letter
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Link href="/job-tracker" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open in tracker
          </Link>
          <Link
            href={`/documents?tab=cover_letters&jobId=${job.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Cover letter
          </Link>
        </div>
      )}

      <JobPeople jobId={job.id} company={job.company} />

      <Card size="sm" className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-[12px]">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-muted-foreground max-h-[22rem] overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
            {job.description || "No description provided."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

/** People at the job's company, for a referral ask (relevance first, then community votes). */
function JobPeople({ jobId, company }: { jobId: string; company: string }) {
  const [people, setPeople] = useState<JobPersonDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPeople(null);
    setFailed(false);
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
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-[12px]">People at {company}</CardTitle>
        <CardDescription className="text-[11px]">
          Possible referral contacts. Votes are a community signal, not a promise to refer.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-2">
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
            {people.map((person, index) => (
              <li key={person.id} className="space-y-2">
                {index > 0 ? <Separator /> : null}
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-8">
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm" className="bg-muted/40 gap-0.5 px-2.5 py-2">
      <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="text-foreground truncate text-[12px] font-medium">{value}</p>
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
    <ul className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
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
                {tab === "applied" && job.applicationStatus ? (
                  <Badge className="px-1.5 py-0 text-[10px]">
                    {statusLabel(job.applicationStatus)}
                  </Badge>
                ) : (
                  <Badge
                    variant={job.discovered ? "outline" : "secondary"}
                    className="px-1.5 py-0 text-[10px] uppercase"
                  >
                    {job.discovered ? "Discovered" : SOURCE_LABELS[job.source]}
                  </Badge>
                )}
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
