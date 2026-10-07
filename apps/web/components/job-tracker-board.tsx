"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ImportApplicationsDialog } from "@/components/import-applications-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DragDrop,
  DragDropHandle,
  DragDropItem,
  DragDropList,
  type DragDropItems,
} from "@/components/ui/drag-and-drop";
import { Modal } from "@/components/ui/modal";
import { StatusSelect } from "@/components/status-select";
import {
  APPLICATION_STATUSES,
  DEFAULT_KANBAN_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/application-status";
import { ShellWidth } from "@/components/shell-width";
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
  appliedAt?: string | null;
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

type ColumnMap = Record<string, string[]>;

const emptyDraft = (): Draft => ({
  companyName: "",
  role: "",
  location: "",
  salaryCtc: "",
  jobLink: "",
  jobId: "",
  status: "bookmarked",
});

function buildColumns(
  applications: ApplicationDto[],
  statuses: ApplicationStatus[],
  previous?: ColumnMap,
): ColumnMap {
  const byId = new Map(applications.map((a) => [a.id, a]));
  const next: ColumnMap = {};
  for (const status of statuses) {
    const prevIds = previous?.[status] ?? [];
    const kept = prevIds.filter((id) => byId.get(id)?.status === status);
    const extras = applications
      .filter((a) => a.status === status && !kept.includes(a.id))
      .map((a) => a.id);
    next[status] = [...kept, ...extras];
  }
  return next;
}

export function JobTrackerBoard({ initialApplications, initialPreferences }: JobTrackerBoardProps) {
  const [applications, setApplications] = useState(initialApplications);
  const [prefs, setPrefs] = useState(initialPreferences);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const visibleStatuses = useMemo(() => {
    if (prefs.trackerScope === "archived") return ["archived"] as ApplicationStatus[];
    const hidden = new Set(prefs.hiddenColumns);
    return DEFAULT_KANBAN_STATUSES.filter((s) => !hidden.has(s));
  }, [prefs]);

  const [columns, setColumns] = useState<ColumnMap>(() =>
    buildColumns(initialApplications, visibleStatuses),
  );

  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("avsar-tracker-col-widths");
      if (raw) setColWidths(JSON.parse(raw) as Record<string, number>);
    } catch {
      /* ignore */
    }
  }, []);

  function persistWidth(status: string, width: number) {
    setColWidths((prev) => {
      const next = { ...prev, [status]: Math.min(480, Math.max(220, width)) };
      try {
        localStorage.setItem("avsar-tracker-col-widths", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function startResize(status: string, startX: number, startW: number) {
    function onMove(e: MouseEvent) {
      persistWidth(status, startW + (e.clientX - startX));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    setColumns((prev) => buildColumns(applications, visibleStatuses, prev));
  }, [applications, visibleStatuses]);

  const appsById = useMemo(() => {
    const map = new Map<string, ApplicationDto>();
    for (const app of applications) map.set(app.id, app);
    return map;
  }, [applications]);

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

  function findContainer(map: ColumnMap, id: string): string | undefined {
    for (const [container, ids] of Object.entries(map)) {
      if (ids.includes(id)) return container;
    }
    return undefined;
  }

  function onKanbanReorder(nextItems: DragDropItems) {
    if (Array.isArray(nextItems)) return;
    const next = nextItems as ColumnMap;
    const prev = columns;
    setColumns(next);

    const touched = new Set<string>();
    for (const ids of Object.values(next)) {
      for (const id of ids) touched.add(String(id));
    }
    for (const id of touched) {
      const from = findContainer(prev, id);
      const to = findContainer(next, id);
      if (from && to && from !== to && (APPLICATION_STATUSES as readonly string[]).includes(to)) {
        void changeStatus(id, to as ApplicationStatus);
      }
    }
  }

  const filteredApplications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter(
      (a) =>
        a.companyName.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q),
    );
  }, [applications, searchQuery]);

  const filteredIds = useMemo(
    () => new Set(filteredApplications.map((a) => a.id)),
    [filteredApplications],
  );

  const statusOptions =
    prefs.trackerScope === "archived"
      ? [...APPLICATION_STATUSES]
      : [...DEFAULT_KANBAN_STATUSES, "archived" as const];

  return (
    <ShellWidth className="avsar-fade-up space-y-6 py-8 sm:py-10">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
            आरंभ
          </p>
          <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Job tracker</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            You own every status change. Drag cards between columns to update status. Bookmarked
            means saved interest — not applied yet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Segmented
            value={prefs.trackerView}
            options={[
              { value: "kanban", label: "Kanban", shortLabel: "K" },
              { value: "list", label: "List", shortLabel: "L" },
            ]}
            onChange={(v) => void setView(v)}
          />
          <Segmented
            value={prefs.trackerScope}
            options={[
              { value: "active", label: "Active", shortLabel: "A" },
              { value: "archived", label: "Archived", shortLabel: "Arch" },
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
              setImportOpen(true);
              setError(null);
            }}
            title="Import applications"
            aria-label="Import applications"
            className="border-border bg-card/70 text-muted-foreground hover:text-foreground inline-flex h-8 items-center justify-center rounded-lg border px-2 text-[12px] md:px-2.5"
          >
            <span className="md:hidden" aria-hidden>
              ⇩
            </span>
            <span className="hidden md:inline">Import</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setWarning(null);
              setError(null);
            }}
            title="New application"
            aria-label="New application"
            className="avsar-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-8 items-center justify-center rounded-lg px-2 text-[12px] font-semibold shadow-sm ring-1 hover:opacity-90 md:px-3"
          >
            <span className="md:hidden" aria-hidden>
              +
            </span>
            <span className="hidden md:inline">New application</span>
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

      <div className="space-y-2">
        <label className="sr-only" htmlFor="tracker-search">
          Search applications
        </label>
        <input
          id="tracker-search"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search company, role, location…"
          className="border-border bg-card/80 text-foreground placeholder:text-muted-foreground h-9 w-full rounded-xl border px-3 text-[13px]"
        />
      </div>

      {prefs.trackerView === "kanban" ? (
        <div className="border-border bg-card/40 overflow-hidden rounded-2xl border">
          <div className="bg-muted/20 p-3 sm:p-4">
            <DragDrop items={columns} onReorder={onKanbanReorder}>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {visibleStatuses.map((status) => {
                  const ids = columns[status] ?? [];
                  return (
                    <section
                      key={status}
                      style={{ width: colWidths[status] ?? 288 }}
                      className="border-border/70 bg-muted/50 relative flex h-[min(75vh,46rem)] shrink-0 flex-col rounded-xl border p-2.5"
                    >
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${STATUS_LABELS[status]} column`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          startResize(status, e.clientX, colWidths[status] ?? 288);
                        }}
                        className="hover:bg-primary/40 absolute bottom-2 right-0 top-2 z-10 w-1.5 cursor-col-resize rounded-full bg-transparent"
                      />
                      <div className="mb-2 flex items-center justify-between gap-2 px-1">
                        <h2 className="text-foreground truncate text-[12px] font-semibold tracking-tight">
                          {STATUS_LABELS[status]}
                        </h2>
                        <Badge
                          variant="outline"
                          className="text-muted-foreground h-5 min-w-5 justify-center px-1.5 text-[11px] tabular-nums"
                        >
                          {ids.length}
                        </Badge>
                      </div>
                      <DragDropList
                        id={status}
                        items={ids.filter((id) => filteredIds.has(id))}
                        className="min-h-0 flex-1 gap-2.5 overflow-y-auto overflow-x-hidden pr-0.5"
                      >
                        {ids
                          .filter((id) => filteredIds.has(id))
                          .map((id) => {
                            const app = appsById.get(id);
                            if (!app) return null;
                            return (
                              <DragDropItem
                                key={id}
                                id={id}
                                className="border-border/80 bg-card hover:bg-card min-h-[7.5rem] shrink-0 overflow-visible p-0 shadow-sm"
                              >
                                <Card
                                  size="sm"
                                  className="min-h-[7.5rem] shrink-0 gap-0 border-0 bg-transparent p-0 shadow-none"
                                >
                                  <CardHeader className="gap-1 p-3 pb-2">
                                    <CardTitle className="pr-8 text-[13px] font-semibold leading-snug">
                                      {app.companyName}
                                    </CardTitle>
                                    <CardDescription className="text-[13px] leading-5">
                                      {app.role}
                                    </CardDescription>
                                    <CardAction>
                                      <DragDropHandle
                                        aria-label={`Move ${app.companyName}`}
                                        className="text-muted-foreground size-8"
                                      />
                                    </CardAction>
                                  </CardHeader>
                                  <CardFooter className="border-border/60 flex-wrap justify-between gap-x-2 gap-y-1.5 border-t px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Badge
                                        variant="secondary"
                                        className="h-5 px-1.5 text-[11px] font-medium"
                                      >
                                        {STATUS_LABELS[app.status]}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className="text-muted-foreground h-5 max-w-[8rem] truncate px-1.5 text-[11px]"
                                      >
                                        {app.location}
                                      </Badge>
                                      {app.salaryCtc ? (
                                        <Badge
                                          variant="outline"
                                          className="text-muted-foreground h-5 px-1.5 text-[11px]"
                                        >
                                          {app.salaryCtc}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <StatusSelect
                                      value={app.status}
                                      options={statusOptions}
                                      onChange={(s) => void changeStatus(app.id, s)}
                                      aria-label={`Status for ${app.companyName}`}
                                      triggerClassName="h-7 max-w-[8.5rem] text-[12px]"
                                    />
                                  </CardFooter>
                                </Card>
                              </DragDropItem>
                            );
                          })}
                      </DragDropList>
                    </section>
                  );
                })}
              </div>
            </DragDrop>
          </div>
        </div>
      ) : (
        <ListView
          applications={filteredApplications}
          statusOptions={statusOptions}
          onStatusChange={(id, s) => void changeStatus(id, s)}
        />
      )}

      {filteredApplications.length === 0 && !pending ? (
        <div className="border-border/70 bg-card/40 text-muted-foreground rounded-2xl border border-dashed px-4 py-10 text-center text-[13px]">
          {prefs.trackerScope === "archived"
            ? "No archived applications yet."
            : "No applications yet — create one to start your pipeline."}
        </div>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setWarning(null);
        }}
        title="New application"
        description="Company, role, and location are required. Job link / id optional — applications can exist without a linked job."
        footer={
          <>
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
          </>
        }
      >
        <div className="space-y-2.5">
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
            <div className="space-y-1">
              <span className="text-foreground text-[12px] font-medium">Status</span>
              <StatusSelect
                value={draft.status}
                options={DEFAULT_KANBAN_STATUSES}
                onChange={(s) => setDraft((d) => ({ ...d, status: s }))}
                triggerClassName="h-9 w-full text-[13px]"
              />
            </div>
          ) : null}
          {warning ? <p className="text-primary text-[12px] leading-relaxed">{warning}</p> : null}
        </div>
      </Modal>

      <ImportApplicationsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(apps) => {
          if (apps.length === 0) return;
          setApplications((list) => {
            const ids = new Set(list.map((a) => a.id));
            const fresh = apps.filter((a) => !ids.has(a.id));
            const scoped = fresh.filter((a) =>
              prefs.trackerScope === "archived" ? a.status === "archived" : a.status !== "archived",
            );
            return scoped.length ? [...scoped, ...list] : list;
          });
        }}
      />
    </ShellWidth>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; shortLabel?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="border-border bg-card/70 inline-flex h-8 items-center rounded-lg border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          aria-label={opt.label}
          onClick={() => onChange(opt.value)}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium transition-colors md:px-2.5",
            value === opt.value
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="md:hidden">{opt.shortLabel ?? opt.label.slice(0, 1)}</span>
          <span className="hidden md:inline">{opt.label}</span>
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
                  <StatusSelect
                    value={app.status}
                    options={statusOptions}
                    onChange={(s) => onStatusChange(app.id, s)}
                    aria-label={`Status for ${app.companyName}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
