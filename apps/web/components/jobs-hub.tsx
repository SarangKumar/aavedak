"use client";

import { useMemo, useRef, useState } from "react";

import { JOB_SOURCES, type JobSource } from "@/lib/jobs";
import { cn } from "@/lib/utils";

export type JobDto = {
  id: string;
  title: string;
  company: string;
  location: string;
  source: JobSource;
  url: string | null;
  description: string;
  salary: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
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

export function JobsHub({ initialJobs }: JobsHubProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobs[0]?.id ?? null);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [listWidth, setListWidth] = useState(380);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (sourceFilter !== "all" && job.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        job.title.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q)
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

  async function archiveJob(id: string) {
    setError(null);
    const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not archive.");
      return;
    }
    setJobs((list) => list.filter((j) => j.id !== id));
    if (selectedId === id) setSelectedId(null);
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
          ? `${label} application created (possible duplicate company+role).`
          : `${label} application created in Job tracker.`,
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
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: pasteText,
          jobId: selected?.id ?? null,
        }),
      });
      const data = (await res.json()) as {
        analysis?: { summary: string | null };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      setPasteOpen(false);
      setPasteText("");
      setMessage(
        data.analysis?.summary ||
          "Saved a private JD analysis stub (does not create a global job).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="avsar-fade-up mx-auto flex w-full max-w-[90rem] flex-col gap-3 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
            अवसर
          </p>
          <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Jobs</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            Multi-source discovery shell. Save or start tracking without leaving the detail pane.
            Pasted JD analysis stays private to you.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            className="border-border bg-card/70 text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
          >
            Paste JD
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="avsar-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold shadow-sm ring-1"
          >
            Add job
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or company…"
          className="border-border bg-card/70 text-foreground h-8 w-full rounded-lg border px-3 text-[13px] sm:max-w-xs"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="border-border bg-card/70 text-foreground h-8 rounded-lg border px-2.5 text-[12px]"
        >
          <option value="all">All sources</option>
          {JOB_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground text-[11px]">{filtered.length} roles</span>
      </div>

      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      {message ? <p className="text-primary text-[13px]">{message}</p> : null}

      <div className="border-border/80 bg-card/40 flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border md:flex-row">
        <aside
          className="border-border/60 flex w-full shrink-0 flex-col border-b md:w-auto md:border-b-0 md:border-r"
          style={{ ["--jobs-list-width" as string]: `${listWidth}px` }}
        >
          <div className="md:w-[var(--jobs-list-width)] md:max-w-full">
            <JobList jobs={filtered} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          </div>
        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          className="border-border/60 hover:bg-primary/20 hidden w-1.5 shrink-0 cursor-col-resize bg-transparent md:block"
        />

        <section className="min-w-0 flex-1 p-4 sm:p-5">
          {!selected ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-center text-[13px]">
              {jobs.length === 0
                ? "No jobs yet — add one or wait for demo seed."
                : "Select a job to see details."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {SOURCE_LABELS[selected.source]}
                  </span>
                  {selected.salary ? (
                    <span className="text-primary/90 text-[12px] font-medium">
                      {selected.salary}
                    </span>
                  ) : null}
                </div>
                <h2 className="avsar-display text-foreground text-xl sm:text-2xl">
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

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void createApplicationFromJob(selected, "bookmarked")}
                  className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
                >
                  Save / Bookmark
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void createApplicationFromJob(selected, "preparing")}
                  className="border-border text-foreground hover:text-primary inline-flex h-8 items-center rounded-lg border px-3 text-[12px] disabled:opacity-60"
                >
                  Track as preparing
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void createApplicationFromJob(selected, "applied")}
                  className="border-border text-foreground hover:text-primary inline-flex h-8 items-center rounded-lg border px-3 text-[12px] disabled:opacity-60"
                >
                  Mark applied
                </button>
                <button
                  type="button"
                  onClick={() => void archiveJob(selected.id)}
                  className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
                >
                  Archive
                </button>
              </div>

              <div className="border-border/70 bg-background/50 rounded-xl border p-3 sm:p-4">
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

      {addOpen ? (
        <Modal title="Add job" onClose={() => setAddOpen(false)}>
          <div className="space-y-2.5">
            <Field
              label="Title *"
              value={draft.title}
              onChange={(v) => setDraft((d) => ({ ...d, title: v }))}
            />
            <Field
              label="Company *"
              value={draft.company}
              onChange={(v) => setDraft((d) => ({ ...d, company: v }))}
            />
            <Field
              label="Location *"
              value={draft.location}
              onChange={(v) => setDraft((d) => ({ ...d, location: v }))}
            />
            <label className="block space-y-1">
              <span className="text-foreground text-[12px] font-medium">Source</span>
              <select
                value={draft.source}
                onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value as JobSource }))}
                className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-2.5 text-[13px]"
              >
                {JOB_SOURCES.filter((s) => s !== "demo").map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
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
                className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px]"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="border-border text-muted-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void createJob()}
                className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
              >
                {pending ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {pasteOpen ? (
        <Modal title="Paste JD (private analysis)" onClose={() => setPasteOpen(false)}>
          <p className="text-muted-foreground mb-2 text-[12px] leading-relaxed">
            Stores a user-scoped analysis stub. Does not create a global job for other users.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={10}
            placeholder="Paste job description text…"
            className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px]"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPasteOpen(false)}
              className="border-border text-muted-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void pasteJd()}
              className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save analysis"}
            </button>
          </div>
        </Modal>
      ) : null}
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
              "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
              selectedId === job.id
                ? "border-primary/40 bg-primary/10"
                : "hover:border-border hover:bg-accent/40 border-transparent",
            )}
          >
            <p className="text-foreground truncate text-[13px] font-semibold">{job.title}</p>
            <p className="text-muted-foreground truncate text-[12px]">
              {job.company} · {job.location}
            </p>
            <p className="text-primary/80 mt-1 text-[10px] font-semibold uppercase tracking-wide">
              {SOURCE_LABELS[job.source]}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="border-border bg-popover text-popover-foreground w-full max-w-md rounded-2xl border p-4 shadow-xl sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="avsar-display text-foreground text-lg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-[12px]"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
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
        className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
      />
    </label>
  );
}
