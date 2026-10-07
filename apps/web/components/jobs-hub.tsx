"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOB_SOURCES, type JobSource } from "@/lib/job-constants";
import { ShellWidth } from "@/components/shell-width";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { CompanySelect } from "@/components/company-select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type JobDto = {
  id: string;
  title: string;
  company: string;
  companyId?: string | null;
  location: string;
  source: JobSource;
  url: string | null;
  description: string;
  salary: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  compatibilityScore?: number | null;
  atsScore?: number | null;
};

type JobsHubProps = {
  initialJobs: JobDto[];
};

const SOURCE_LABELS: Record<JobSource, string> = {
  manual: "Manual",
  linkedin: "LinkedIn",
  careers: "Careers",
  indeed: "Indeed",
  other: "Other",
  demo: "Demo",
};

const SOURCE_TONE: Record<JobSource, string> = {
  manual: "bg-muted text-muted-foreground",
  linkedin: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  careers: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  indeed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  other: "bg-secondary text-secondary-foreground",
  demo: "bg-primary/15 text-primary",
};

const PANE_WIDTH_KEY = "aavedak-jobs-list-width";

function initials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function relativeAge(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function JobsHub({ initialJobs }: JobsHubProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobs[0]?.id ?? null);
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
        setJobs((list) => [data.job!, ...list]);
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
      setJobs((list) => list.filter((j) => j.id !== id));
      if (selectedId === id) setSelectedId(null);
      setMessage("Ignored — hidden from your Jobs list.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ignore.");
    } finally {
      setPending(false);
    }
  }

  async function createApplicationFromJob(
    job: JobDto,
    status: "bookmarked" | "preparing" | "applied",
  ) {
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
      };
      if (!res.ok) throw new Error(data.error || "Could not create application.");
      const label =
        status === "bookmarked" ? "Bookmarked" : status === "preparing" ? "Preparing" : "Applied";
      setMessage(
        data.duplicateWarning
          ? `${label} in tracker (possible duplicate company+role).`
          : `${label} — open Job tracker to continue.`,
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
        setJobs((list) => [createData.job!, ...list]);
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
        `Registered job · Match ${createData.job?.compatibilityScore ?? "—"}% · ATS ${createData.job?.atsScore ?? "—"}%. Generate a cover letter from Documents.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setPending(false);
    }
  }

  const sourceChipOrder: Array<"all" | JobSource> = [
    "all",
    "linkedin",
    "careers",
    "indeed",
    "manual",
    "other",
    "demo",
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
            Multi-source discovery with a resizable master–detail shell. Bookmark into Job tracker
            without leaving the pane. Pasted JD analysis stays private to you.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            className="border-border bg-card text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-md border px-2.5 text-[12px]"
          >
            Paste JD
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="aavedak-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-8 items-center rounded-md px-3 text-[12px] font-semibold shadow-sm ring-1"
          >
            Add job
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, company, or description…"
            className="border-border bg-card text-foreground h-8 w-full rounded-md border px-3 text-[13px] sm:max-w-sm"
          />
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {filtered.length} of {jobs.length} roles
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by source">
          {sourceChipOrder.map((key) => {
            const count = sourceCounts[key] ?? 0;
            if (key !== "all" && count === 0) return null;
            const active = sourceFilter === key;
            const label = key === "all" ? "All sources" : SOURCE_LABELS[key];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSourceFilter(key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/80 bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      {message ? (
        <p className="text-primary text-[13px]">
          {message}{" "}
          {message.includes("tracker") || message.includes("Tracker") ? (
            <Link href="/job-tracker" className="font-medium underline-offset-2 hover:underline">
              Open tracker
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="border-border/80 bg-card flex min-h-[30rem] flex-col overflow-hidden rounded-lg border md:flex-row">
        <aside
          className="border-border/60 flex w-full shrink-0 flex-col border-b md:w-[var(--jobs-list-width)] md:max-w-[min(100%,560px)] md:border-b-0 md:border-r"
          style={{ ["--jobs-list-width" as string]: `${listWidth}px` }}
        >
          <JobList jobs={filtered} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
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
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-[13px]">
              <p>
                {jobs.length === 0
                  ? "No jobs yet — add one to get started."
                  : "Select a job to see details."}
              </p>
              {jobs.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="text-primary text-[12px] font-medium hover:underline"
                >
                  Add your first job
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold tracking-tight"
                  aria-hidden
                >
                  {initials(selected.company)}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="ghost"
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        SOURCE_TONE[selected.source],
                      )}
                    >
                      {SOURCE_LABELS[selected.source]}
                    </Badge>
                    {selected.salary ? (
                      <span className="text-foreground/90 text-[12px] font-medium">
                        {selected.salary}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground text-[11px]">
                      {relativeAge(selected.createdAt)}
                    </span>
                  </div>
                  <h2 className="aavedak-display text-foreground text-xl sm:text-2xl">
                    {selected.title}
                  </h2>
                  <p className="text-foreground/90 text-[13px]">
                    {selected.company}
                    <span className="text-muted-foreground"> · {selected.location}</span>
                  </p>
                  {selected.url ? (
                    <a
                      href={selected.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-[12px] hover:underline"
                    >
                      Open job link
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetaChip
                  label="Match"
                  value={
                    selected.compatibilityScore != null ? `${selected.compatibilityScore}%` : "—"
                  }
                />
                <MetaChip
                  label="ATS"
                  value={selected.atsScore != null ? `${selected.atsScore}%` : "—"}
                />
                <MetaChip label="Source" value={SOURCE_LABELS[selected.source]} />
                <MetaChip label="Comp" value={selected.salary ?? "—"} />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void createApplicationFromJob(selected, "applied")}
                  className="aavedak-btn bg-primary text-primary-foreground inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold disabled:opacity-60"
                >
                  {pending ? <Spinner className="size-3.5" /> : null}
                  Applied
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void ignoreJob(selected.id)}
                  className="border-border text-foreground hover:border-primary/40 inline-flex h-8 items-center rounded-md border px-3 text-[12px] disabled:opacity-60"
                >
                  Ignore
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void createApplicationFromJob(selected, "bookmarked")}
                  className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-md border px-3 text-[12px] disabled:opacity-60"
                >
                  Bookmark
                </button>
                <Link
                  href={`/documents?tab=cover_letters&jobId=${selected.id}`}
                  className="border-border text-foreground hover:border-primary/40 inline-flex h-8 items-center rounded-md border px-3 text-[12px]"
                >
                  Cover letter
                </Link>
              </div>

              <div className="border-border/70 bg-muted/30 rounded-lg border p-3 sm:p-4">
                <h3 className="text-foreground mb-2 text-[12px] font-semibold tracking-tight">
                  Description
                </h3>
                <pre className="text-muted-foreground max-h-[22rem] overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
                  {selected.description || "No description provided."}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>

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
                {JOB_SOURCES.filter((s) => s !== "demo").map((s) => (
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
            <button
              type="button"
              disabled={pending}
              onClick={() => void createJob()}
              className="aavedak-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-md px-3 text-[12px] font-semibold disabled:opacity-60"
            >
              {pending ? "Saving…" : "Create"}
            </button>
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
          <button
            type="button"
            disabled={pending}
            onClick={() => void pasteJd()}
            className="aavedak-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-md px-3 text-[12px] font-semibold disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save analysis"}
          </button>
        </div>
      </Modal>
    </ShellWidth>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/70 bg-muted/40 rounded-md border px-2.5 py-2">
      <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="text-foreground mt-0.5 truncate text-[12px] font-medium">{value}</p>
    </div>
  );
}

function JobList({
  jobs,
  selectedId,
  onSelect,
}: {
  jobs: JobDto[];
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
        <li key={job.id}>
          <button
            type="button"
            onClick={() => onSelect(job.id)}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2.5 text-left transition-colors",
              selectedId === job.id
                ? "border-primary/40 bg-primary/10"
                : "hover:border-border hover:bg-accent/40 border-transparent",
            )}
          >
            <div
              className="bg-muted text-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold"
              aria-hidden
            >
              {initials(job.company)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-[13px] font-semibold">{job.title}</p>
              <p className="text-muted-foreground truncate text-[12px]">
                {job.company} · {job.location}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    SOURCE_TONE[job.source],
                  )}
                >
                  {SOURCE_LABELS[job.source]}
                </span>
                {job.compatibilityScore != null ? (
                  <span className="text-foreground/80 text-[10px] font-medium tabular-nums">
                    Match {job.compatibilityScore}%
                  </span>
                ) : null}
                {job.atsScore != null ? (
                  <span className="text-muted-foreground text-[10px] tabular-nums">
                    ATS {job.atsScore}%
                  </span>
                ) : null}
                {job.salary ? (
                  <span className="text-muted-foreground text-[10px]">{job.salary}</span>
                ) : null}
              </div>
            </div>
          </button>
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
