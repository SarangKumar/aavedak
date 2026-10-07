"use client";

import { useCallback, useMemo, useState } from "react";

import {
  APPLICATION_STATUSES,
  DEFAULT_KANBAN_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/application-status";
import { cn } from "@/lib/utils";

export type ApplicationDto = {
  id: string;
  companyName: string;
  role: string;
  location: string;
  salaryCtc: string | null;
  jobLink: string | null;
  jobId: string | null;
  status: ApplicationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrackerPrefsDto = {
  trackerView: "kanban" | "list";
  trackerScope: "active" | "archived";
  hiddenColumns: ApplicationStatus[];
};

type JobTrackerBoardProps = {
  initialApplications: ApplicationDto[];
  initialPreferences: TrackerPrefsDto;
};

type Draft = {
  companyName: string;
  role: string;
  location: string;
  salaryCtc: string;
  jobLink: string;
  jobId: string;
  status: ApplicationStatus;
};

const emptyDraft = (): Draft => ({
  companyName: "",
  role: "",
  location: "",
  salaryCtc: "",
  jobLink: "",
  jobId: "",
  status: "bookmarked",
});

export function JobTrackerBoard({ initialApplications, initialPreferences }: JobTrackerBoardProps) {
  const [applications, setApplications] = useState(initialApplications);
  const [prefs, setPrefs] = useState(initialPreferences);
  const [createOpen, setCreateOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const visibleStatuses = useMemo(() => {
    if (prefs.trackerScope === "archived") return ["archived"] as ApplicationStatus[];
    const hidden = new Set(prefs.hiddenColumns);
    return DEFAULT_KANBAN_STATUSES.filter((s) => !hidden.has(s));
  }, [prefs]);

  const persistPrefs = useCallback(async (patch: Partial<TrackerPrefsDto>) => {
    setError(null);
    const res = await fetch("/api/preferences/tracker", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as {
      preferences?: TrackerPrefsDto & { userId: string; updatedAt: string };
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Could not save preferences.");
      return;
    }
    if (data.preferences) {
      setPrefs({
        trackerView: data.preferences.trackerView,
        trackerScope: data.preferences.trackerScope,
        hiddenColumns: data.preferences.hiddenColumns,
      });
    }
  }, []);

  async function reloadScope(scope: "active" | "archived") {
    const res = await fetch(`/api/applications?scope=${scope}`);
    const data = (await res.json()) as { applications?: ApplicationDto[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Failed to load applications.");
    setApplications(data.applications ?? []);
  }

  async function setView(view: "kanban" | "list") {
    setPrefs((p) => ({ ...p, trackerView: view }));
    await persistPrefs({ trackerView: view });
  }

  async function setScope(scope: "active" | "archived") {
    setPrefs((p) => ({ ...p, trackerScope: scope }));
    setPending(true);
    try {
      await persistPrefs({ trackerScope: scope });
      await reloadScope(scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch scope.");
    } finally {
      setPending(false);
    }
  }

  async function toggleColumn(status: ApplicationStatus) {
    if (status === "archived") return;
    const hidden = new Set(prefs.hiddenColumns);
    if (hidden.has(status)) hidden.delete(status);
    else hidden.add(status);
    const next = Array.from(hidden);
    setPrefs((p) => ({ ...p, hiddenColumns: next }));
    await persistPrefs({ hiddenColumns: next });
  }

  async function createApplication(force = false) {
    setError(null);
    setWarning(null);
    if (!draft.companyName.trim() || !draft.role.trim() || !draft.location.trim()) {
      setError("Company name, role, and location are required.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: draft.companyName,
          role: draft.role,
          location: draft.location,
          salaryCtc: draft.salaryCtc || null,
          jobLink: draft.jobLink || null,
          jobId: draft.jobId || null,
          status: prefs.trackerScope === "archived" ? "archived" : draft.status,
        }),
      });
      const data = (await res.json()) as {
        application?: ApplicationDto;
        duplicateWarning?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Create failed.");
      if (data.duplicateWarning && !force) {
        setWarning(
          "You already have an active application with this company + role. Create anyway?",
        );
        setPending(false);
        return;
      }
      if (data.application) {
        if (
          (prefs.trackerScope === "active" && data.application.status !== "archived") ||
          (prefs.trackerScope === "archived" && data.application.status === "archived")
        ) {
          setApplications((list) => [data.application!, ...list]);
        }
      }
      setDraft(emptyDraft());
      setCreateOpen(false);
      setWarning(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(id: string, status: ApplicationStatus) {
    setError(null);
    const prev = applications;
    // Optimistic
    if (prefs.trackerScope === "active" && status === "archived") {
      setApplications((list) => list.filter((a) => a.id !== id));
    } else if (prefs.trackerScope === "archived" && status !== "archived") {
      setApplications((list) => list.filter((a) => a.id !== id));
    } else {
      setApplications((list) =>
        list.map((a) => (a.id === id ? { ...a, status, updatedAt: new Date().toISOString() } : a)),
      );
    }

    const res = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await res.json()) as { application?: ApplicationDto; error?: string };
    if (!res.ok) {
      setApplications(prev);
      setError(data.error || "Could not update status.");
      return;
    }
    if (data.application) {
      const app = data.application;
      const belongs =
        (prefs.trackerScope === "active" && app.status !== "archived") ||
        (prefs.trackerScope === "archived" && app.status === "archived");
      setApplications((list) => {
        const without = list.filter((a) => a.id !== id);
        return belongs ? [app, ...without] : without;
      });
    }
  }

  function onDragStart(id: string) {
    setDraggingId(id);
  }

  function onDragEnd() {
    setDraggingId(null);
  }

  async function onDropStatus(status: ApplicationStatus) {
    if (!draggingId) return;
    const id = draggingId;
    setDraggingId(null);
    await changeStatus(id, status);
  }

  const byStatus = useMemo(() => {
    const map = new Map<ApplicationStatus, ApplicationDto[]>();
    for (const s of visibleStatuses) map.set(s, []);
    for (const app of applications) {
      const bucket = map.get(app.status);
      if (bucket) bucket.push(app);
    }
    return map;
  }, [applications, visibleStatuses]);

  return (
    <div className="avsar-fade-up mx-auto w-full max-w-[90rem] space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
            अवसर
          </p>
          <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Job tracker</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            You own every status change. Bookmarked means saved interest — not applied yet.
            Applications can exist without a linked job.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Segmented
            value={prefs.trackerView}
            options={[
              { value: "kanban", label: "Kanban" },
              { value: "list", label: "List" },
            ]}
            onChange={(v) => void setView(v)}
          />
          <Segmented
            value={prefs.trackerScope}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
            onChange={(v) => void setScope(v)}
          />
          {prefs.trackerScope === "active" && prefs.trackerView === "kanban" ? (
            <button
              type="button"
              onClick={() => setColumnsOpen((o) => !o)}
              className="border-border bg-card/70 text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
            >
              Columns
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setWarning(null);
              setError(null);
            }}
            className="avsar-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold shadow-sm ring-1 hover:opacity-90"
          >
            New application
          </button>
        </div>
      </header>

      {columnsOpen && prefs.trackerScope === "active" ? (
        <div className="border-border/80 bg-card/70 rounded-xl border p-3">
          <p className="text-foreground mb-2 text-[12px] font-medium">Show / hide Kanban columns</p>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_KANBAN_STATUSES.map((status) => {
              const hidden = prefs.hiddenColumns.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => void toggleColumn(status)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                    hidden
                      ? "border-border text-muted-foreground bg-transparent"
                      : "border-primary/30 bg-primary/10 text-primary",
                  )}
                >
                  {STATUS_LABELS[status]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}

      {prefs.trackerView === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {visibleStatuses.map((status) => {
            const cards = byStatus.get(status) ?? [];
            return (
              <section
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void onDropStatus(status)}
                className="border-border/80 bg-card/50 flex w-[17.5rem] shrink-0 flex-col rounded-2xl border"
                style={{ minHeight: "22rem" }}
              >
                <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2.5">
                  <h2 className="text-foreground text-[12px] font-semibold tracking-tight">
                    {STATUS_LABELS[status]}
                  </h2>
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    {cards.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {cards.length === 0 ? (
                    <p className="text-muted-foreground px-1 py-6 text-center text-[11px]">
                      Drop cards here
                    </p>
                  ) : (
                    cards.map((app) => (
                      <ApplicationCard
                        key={app.id}
                        app={app}
                        dragging={draggingId === app.id}
                        onDragStart={() => onDragStart(app.id)}
                        onDragEnd={onDragEnd}
                        onStatusChange={(s) => void changeStatus(app.id, s)}
                        statusOptions={
                          prefs.trackerScope === "archived"
                            ? [...APPLICATION_STATUSES]
                            : [...DEFAULT_KANBAN_STATUSES, "archived"]
                        }
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <ListView
          applications={applications}
          statusOptions={
            prefs.trackerScope === "archived"
              ? [...APPLICATION_STATUSES]
              : [...DEFAULT_KANBAN_STATUSES, "archived"]
          }
          onStatusChange={(id, s) => void changeStatus(id, s)}
        />
      )}

      {applications.length === 0 && !pending ? (
        <div className="border-border/70 bg-card/40 text-muted-foreground rounded-2xl border border-dashed px-4 py-10 text-center text-[13px]">
          {prefs.trackerScope === "archived"
            ? "No archived applications yet."
            : "No applications yet — create one to start your pipeline."}
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-app-title"
            className="border-border bg-popover text-popover-foreground w-full max-w-md rounded-2xl border p-4 shadow-xl sm:p-5"
          >
            <h2 id="create-app-title" className="avsar-display text-foreground text-lg">
              New application
            </h2>
            <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">
              Company, role, and location are required. Job link / id optional — applications can
              exist without a linked job.
            </p>
            <div className="mt-3 space-y-2.5">
              <Field
                label="Company name *"
                value={draft.companyName}
                onChange={(v) => setDraft((d) => ({ ...d, companyName: v }))}
              />
              <Field
                label="Role *"
                value={draft.role}
                onChange={(v) => setDraft((d) => ({ ...d, role: v }))}
              />
              <Field
                label="Location *"
                value={draft.location}
                onChange={(v) => setDraft((d) => ({ ...d, location: v }))}
              />
              <Field
                label="CTC / salary"
                value={draft.salaryCtc}
                onChange={(v) => setDraft((d) => ({ ...d, salaryCtc: v }))}
              />
              <Field
                label="Job link"
                value={draft.jobLink}
                onChange={(v) => setDraft((d) => ({ ...d, jobLink: v }))}
              />
              <Field
                label="Job id"
                value={draft.jobId}
                onChange={(v) => setDraft((d) => ({ ...d, jobId: v }))}
              />
              {prefs.trackerScope === "active" ? (
                <label className="block space-y-1">
                  <span className="text-foreground text-[12px] font-medium">Status</span>
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        status: e.target.value as ApplicationStatus,
                      }))
                    }
                    className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-2.5 text-[13px]"
                  >
                    {DEFAULT_KANBAN_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {warning ? (
              <p className="text-primary mt-3 text-[12px] leading-relaxed">{warning}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setWarning(null);
                }}
                className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void createApplication(Boolean(warning))}
                className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
              >
                {pending ? "Saving…" : warning ? "Create anyway" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="border-border bg-card/70 inline-flex h-8 items-center rounded-lg border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors",
            value === opt.value
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
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
        className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
      />
    </label>
  );
}

function ApplicationCard({
  app,
  dragging,
  onDragStart,
  onDragEnd,
  onStatusChange,
  statusOptions,
}: {
  app: ApplicationDto;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStatusChange: (status: ApplicationStatus) => void;
  statusOptions: readonly ApplicationStatus[];
}) {
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "border-border/80 bg-background/80 cursor-grab rounded-xl border p-2.5 shadow-sm active:cursor-grabbing",
        dragging && "opacity-60",
      )}
    >
      <p className="text-foreground truncate text-[13px] font-semibold tracking-tight">
        {app.companyName}
      </p>
      <p className="text-foreground/90 truncate text-[12px]">{app.role}</p>
      <p className="text-muted-foreground mt-1 truncate text-[11px]">{app.location}</p>
      {app.salaryCtc ? (
        <p className="text-primary/90 mt-1 truncate text-[11px] font-medium">{app.salaryCtc}</p>
      ) : null}
      <label className="mt-2 block">
        <span className="sr-only">Status</span>
        <select
          value={app.status}
          onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
          onClick={(e) => e.stopPropagation()}
          className="border-border bg-card text-muted-foreground hover:text-foreground h-7 w-full rounded-md border px-1.5 text-[11px]"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

function ListView({
  applications,
  statusOptions,
  onStatusChange,
}: {
  applications: ApplicationDto[];
  statusOptions: readonly ApplicationStatus[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
}) {
  if (applications.length === 0) return null;
  return (
    <div className="border-border/80 bg-card/60 overflow-hidden rounded-2xl border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-[12px]">
          <thead className="border-border/60 bg-muted/40 text-muted-foreground border-b">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">CTC</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((app) => (
              <tr key={app.id} className="border-border/40 border-b last:border-0">
                <td className="text-foreground px-3 py-2 font-medium">{app.companyName}</td>
                <td className="text-foreground/90 px-3 py-2">{app.role}</td>
                <td className="text-muted-foreground px-3 py-2">{app.location}</td>
                <td className="text-muted-foreground px-3 py-2">{app.salaryCtc || "—"}</td>
                <td className="px-3 py-2">
                  <select
                    value={app.status}
                    onChange={(e) => onStatusChange(app.id, e.target.value as ApplicationStatus)}
                    className="border-border bg-background text-foreground h-7 rounded-md border px-1.5 text-[11px]"
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
