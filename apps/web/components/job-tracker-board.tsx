"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ImportApplicationsDialog } from "@/components/import-applications-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "@/components/ui/card";
import {
  DragDrop,
  DragDropHandle,
  DragDropItem,
  DragDropList,
  type DragDropItems,
} from "@/components/ui/drag-and-drop";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  paginationPageList,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusSelect } from "@/components/status-select";
import {
  APPLICATION_STATUSES,
  DEFAULT_KANBAN_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/application-status";
import { ShellWidth } from "@/components/shell-width";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompanySelect } from "@/components/company-select";
import { format } from "date-fns";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDateOnly } from "@/lib/format-datetime";
import { SearchInput } from "@/components/search-input";

/** `YYYY-MM-DD…` → local Date (no timezone shift), or undefined. */
function isoToDate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

const LIST_PAGE_SIZES = [10, 25, 50] as const;
type ListPageSize = (typeof LIST_PAGE_SIZES)[number];

export type ApplicationDto = {
  id: string;
  companyName: string;
  companyId?: string | null;
  role: string;
  location: string;
  salaryCtc: string | null;
  jobLink: string | null;
  jobId: string | null;
  coverLetterId?: string | null;
  coverLetterTitle?: string | null;
  jobTitle?: string | null;
  status: ApplicationStatus;
  /** System reason for the last status change (`job_expired` → auto-rejected). */
  statusReason?: string | null;
  notes: string | null;
  appliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoverLetterOptionDto = {
  id: string;
  title: string;
  companyName: string | null;
  roleTitle: string | null;
  jobId: string | null;
};

export type TrackerPrefsDto = {
  trackerView: "kanban" | "list";
  trackerScope: "active" | "archived";
  hiddenColumns: ApplicationStatus[];
};

type JobTrackerBoardProps = {
  initialApplications: ApplicationDto[];
  initialCoverLetters?: CoverLetterOptionDto[];
  initialPreferences: TrackerPrefsDto;
};

type Draft = {
  companyName: string;
  role: string;
  location: string;
  salaryCtc: string;
  jobLink: string;
  jobId: string;
  coverLetterId: string;
  appliedAt: string;
  status: ApplicationStatus;
  notes: string;
};

type ColumnMap = Record<string, string[]>;

type PendingAction = "create" | "save" | "delete" | null;

const emptyDraft = (): Draft => ({
  companyName: "",
  role: "",
  location: "",
  salaryCtc: "",
  jobLink: "",
  jobId: "",
  coverLetterId: "",
  appliedAt: "",
  status: "bookmarked",
  notes: "",
});

function draftFromApp(app: ApplicationDto): Draft {
  return {
    companyName: app.companyName,
    role: app.role,
    location: app.location,
    salaryCtc: app.salaryCtc ?? "",
    jobLink: app.jobLink ?? "",
    jobId: app.jobId ?? "",
    coverLetterId: app.coverLetterId ?? "",
    appliedAt: app.appliedAt?.slice(0, 10) ?? "",
    status: app.status,
    notes: app.notes ?? "",
  };
}

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

export function JobTrackerBoard({
  initialApplications,
  initialCoverLetters = [],
  initialPreferences,
}: JobTrackerBoardProps) {
  const [applications, setApplications] = useState(() =>
    initialApplications.filter((a) => a.status !== "archived"),
  );
  const [coverLetters] = useState(initialCoverLetters);
  const [prefs, setPrefs] = useState(initialPreferences);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [listPageSize, setListPageSize] = useState<ListPageSize>(10);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const pending = pendingAction !== null;

  const visibleStatuses = useMemo(() => {
    const hidden = new Set(prefs.hiddenColumns);
    return DEFAULT_KANBAN_STATUSES.filter((s) => !hidden.has(s));
  }, [prefs.hiddenColumns]);

  const [columns, setColumns] = useState<ColumnMap>(() =>
    buildColumns(
      initialApplications.filter((a) => a.status !== "archived"),
      visibleStatuses,
    ),
  );

  useEffect(() => {
    setColumns((prev) => buildColumns(applications, visibleStatuses, prev));
  }, [applications, visibleStatuses]);

  useEffect(() => {
    if (prefs.trackerView !== "kanban") setColumnsOpen(false);
  }, [prefs.trackerView]);

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
        trackerScope: "active",
        hiddenColumns: data.preferences.hiddenColumns,
      });
    }
  }, []);

  async function setView(view: "kanban" | "list") {
    setPrefs((p) => ({ ...p, trackerView: view }));
    await persistPrefs({ trackerView: view, trackerScope: "active" });
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
    setPendingAction("create");
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
          coverLetterId: draft.coverLetterId || null,
          appliedAt: draft.appliedAt || null,
          status: draft.status === "archived" ? "bookmarked" : draft.status,
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
        setPendingAction(null);
        return;
      }
      if (data.application && data.application.status !== "archived") {
        setApplications((list) => [data.application!, ...list]);
      }
      setDraft(emptyDraft());
      setCreateOpen(false);
      setWarning(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function changeStatus(id: string, status: ApplicationStatus) {
    setError(null);
    const prev = applications;
    if (status === "archived") {
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
      setApplications((list) => {
        const without = list.filter((a) => a.id !== id);
        return app.status === "archived" ? without : [app, ...without];
      });
    }
  }

  function openEdit(app: ApplicationDto) {
    setEditingId(app.id);
    setDraft(draftFromApp(app));
    setError(null);
    setWarning(null);
  }

  function closeEdit() {
    setEditingId(null);
    setDraft(emptyDraft());
    setWarning(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setError(null);
    if (!draft.companyName.trim() || !draft.role.trim() || !draft.location.trim()) {
      setError("Company name, role, and location are required.");
      return;
    }
    setPendingAction("save");
    try {
      const res = await fetch(`/api/applications/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: draft.companyName,
          role: draft.role,
          location: draft.location,
          salaryCtc: draft.salaryCtc || null,
          jobLink: draft.jobLink || null,
          jobId: draft.jobId || null,
          coverLetterId: draft.coverLetterId || null,
          appliedAt: draft.appliedAt || null,
          notes: draft.notes || null,
          status: draft.status,
        }),
      });
      const data = (await res.json()) as { application?: ApplicationDto; error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed.");
      if (data.application) {
        const app = data.application;
        setApplications((list) => {
          const without = list.filter((a) => a.id !== editingId);
          return app.status === "archived" ? without : [app, ...without];
        });
      }
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteApplication() {
    if (!editingId) return;
    setError(null);
    setPendingAction("delete");
    try {
      const res = await fetch(`/api/applications/${editingId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      setApplications((list) => list.filter((a) => a.id !== editingId));
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setPendingAction(null);
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

  return (
    <ShellWidth className="aavedak-fade-up space-y-6 py-8 sm:py-10">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
            आवेदक
          </p>
          <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Job tracker</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            Status changes by dragging cards between columns only. Bookmarked means saved interest —
            not applied yet.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="tracker-search">
          Search applications
        </label>
        <SearchInput
          id="tracker-search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search company, role, location…"
          className="h-9 min-w-0 flex-1 sm:max-w-sm"
        />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <ToggleGroup
            aria-label="Board view"
            variant="outline"
            size="sm"
            value={[prefs.trackerView]}
            onValueChange={(next) => {
              // Single mode lets the pressed item turn off; a board always has one view.
              if (next[0] === "kanban" || next[0] === "list") void setView(next[0]);
            }}
          >
            <ToggleGroupItem
              value="kanban"
              title="Kanban"
              aria-label="Kanban view"
              className="size-8 px-0"
            >
              <KanbanGlyph className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              title="List"
              aria-label="List view"
              className="size-8 px-0"
            >
              <ListGlyph className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
          {prefs.trackerView === "list" ? (
            <ToggleGroup
              aria-label="Applications per page"
              variant="outline"
              size="sm"
              value={[String(listPageSize)]}
              onValueChange={(next) => {
                const size = LIST_PAGE_SIZES.find((n) => String(n) === next[0]);
                if (size) setListPageSize(size);
              }}
            >
              {LIST_PAGE_SIZES.map((size) => (
                <ToggleGroupItem
                  key={size}
                  value={String(size)}
                  title={`${size} per page`}
                  aria-label={`${size} applications per page`}
                  className="min-w-8 px-2 text-[12px] tabular-nums"
                >
                  {size}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          {prefs.trackerView === "kanban" ? (
            <Button variant="outline" size="sm" onClick={() => setColumnsOpen((o) => !o)}>
              Columns
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => {
              setImportOpen(true);
              setError(null);
            }}
            title="Import applications"
            aria-label="Import applications"
          >
            <ImportGlyph className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => {
              window.location.assign("/api/applications/export");
            }}
            title="Download applications JSON backup"
            aria-label="Download applications JSON backup"
          >
            <DownloadGlyph className="size-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setCreateOpen(true);
              setWarning(null);
              setError(null);
            }}
            title="New application"
            aria-label="New application"
          >
            <span aria-hidden className="text-[16px] leading-none">
              +
            </span>
            <span className="hidden sm:inline">New Application</span>
          </Button>
        </div>
      </div>

      {columnsOpen && prefs.trackerView === "kanban" ? (
        <Card className="border-border/80 bg-card gap-0 rounded-xl border p-3">
          <p className="text-foreground mb-2 text-[12px] font-medium">Show / hide Kanban columns</p>
          <ToggleGroup
            aria-label="Visible Kanban columns"
            multiple
            variant="outline"
            size="sm"
            spacing={1}
            className="flex-wrap"
            value={DEFAULT_KANBAN_STATUSES.filter((st) => !prefs.hiddenColumns.includes(st))}
            onValueChange={(next) => {
              // One click changes exactly one column; find which.
              const visible = DEFAULT_KANBAN_STATUSES.filter(
                (st) => !prefs.hiddenColumns.includes(st),
              );
              const changed = DEFAULT_KANBAN_STATUSES.find(
                (st) => visible.includes(st) !== next.includes(st),
              );
              if (changed) void toggleColumn(changed);
            }}
          >
            {DEFAULT_KANBAN_STATUSES.map((status) => (
              <ToggleGroupItem
                key={status}
                value={status}
                className="h-7 rounded-full px-2.5 text-[11px]"
              >
                {STATUS_LABELS[status]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {prefs.trackerView === "kanban" ? (
        <Card className="border-border/70 bg-card gap-0 overflow-hidden rounded-xl border p-0">
          <div className="p-3 sm:p-4">
            <DragDrop items={columns} onReorder={onKanbanReorder}>
              <ScrollArea className="flex gap-3 pb-1" orientation="horizontal">
                {visibleStatuses.map((status) => {
                  const ids = columns[status] ?? [];
                  return (
                    <section
                      key={status}
                      className="border-border/60 bg-muted/25 flex h-[min(75vh,46rem)] w-[18rem] shrink-0 flex-col overflow-hidden rounded-lg border"
                    >
                      <div className="mb-0 flex shrink-0 items-center justify-between gap-2 px-2.5 pb-2 pt-2.5">
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
                      <ScrollArea className="min-h-0 flex-1">
                        <DragDropList
                          id={status}
                          items={ids.filter((id) => filteredIds.has(id))}
                          className="gap-2.5 p-2.5 pt-0"
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
                                  className="border-border/50 bg-muted/40 hover:border-border/80 hover:bg-muted/55 shrink-0 overflow-visible rounded-lg p-0 shadow-none"
                                >
                                  <Card
                                    size="sm"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openEdit(app)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        openEdit(app);
                                      }
                                    }}
                                    className="shrink-0 cursor-pointer gap-0 border-0 bg-transparent p-0 shadow-none"
                                  >
                                    <div className="flex items-start gap-2 p-3 pb-2">
                                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
                                        <span className="text-foreground min-w-0 truncate text-[13px] font-semibold leading-snug tracking-tight">
                                          {app.companyName}
                                        </span>
                                        <span
                                          aria-hidden
                                          className="text-muted-foreground text-[13px]"
                                        >
                                          ⋅
                                        </span>
                                        <Badge
                                          variant="secondary"
                                          className="max-w-full truncate text-[11px] font-medium"
                                        >
                                          {app.role}
                                        </Badge>
                                      </div>
                                      <DragDropHandle
                                        aria-label={`Move ${app.companyName}`}
                                        className="text-muted-foreground size-7 shrink-0 cursor-grab"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-3">
                                      <span className="text-muted-foreground min-w-0 truncate text-[11px] leading-snug">
                                        {app.location}
                                        {app.salaryCtc ? ` · ${app.salaryCtc}` : ""}
                                      </span>
                                      <ApplicationDate app={app} />
                                      {app.statusReason === "job_expired" ? (
                                        <JobExpiredBadge />
                                      ) : null}
                                    </div>
                                  </Card>
                                </DragDropItem>
                              );
                            })}
                        </DragDropList>
                      </ScrollArea>
                    </section>
                  );
                })}
              </ScrollArea>
            </DragDrop>
          </div>
        </Card>
      ) : (
        <ListView applications={filteredApplications} pageSize={listPageSize} onSelect={openEdit} />
      )}

      {filteredApplications.length === 0 && !pending ? (
        <Card className="border-border/70 bg-card/40 text-muted-foreground gap-0 rounded-xl border border-dashed px-4 py-10 text-center text-[13px]">
          No applications yet — create one to start your pipeline.
        </Card>
      ) : null}

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          if (!next)
            (() => {
              setCreateOpen(false);
              setWarning(null);
            })();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New application</DialogTitle>
            <DialogDescription>
              Company, role, and location are required. Job link / id optional — applications can
              exist without a linked job.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            <label className="block space-y-1">
              <span className="text-foreground text-[12px] font-medium">Company name *</span>
              <CompanySelect
                value={draft.companyName}
                onChange={(name) => setDraft((d) => ({ ...d, companyName: name }))}
                placeholder="e.g. Stripe"
              />
            </label>
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
            <div className="space-y-1">
              <span className="text-foreground text-[12px] font-medium">Applied date</span>
              <DatePicker
                value={isoToDate(draft.appliedAt)}
                onValueChange={(date) =>
                  setDraft((d) => ({ ...d, appliedAt: date ? format(date, "yyyy-MM-dd") : "" }))
                }
                placeholder="Pick applied date"
                formatString="yyyy-MM-dd"
              />
            </div>
            <div className="space-y-1">
              <span className="text-foreground text-[12px] font-medium">Status</span>
              <StatusSelect
                value={draft.status === "archived" ? "bookmarked" : draft.status}
                options={DEFAULT_KANBAN_STATUSES}
                onChange={(s) => setDraft((d) => ({ ...d, status: s }))}
                triggerClassName="h-9 w-full cursor-pointer text-[13px]"
              />
            </div>
            {warning ? <p className="text-primary text-[12px] leading-relaxed">{warning}</p> : null}
          </div>

          <DialogFooter>
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreateOpen(false);
                  setWarning(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                loading={pendingAction === "create"}
                disabled={pending}
                onClick={() => void createApplication(Boolean(warning))}
              >
                {warning ? "Create anyway" : "Create"}
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={Boolean(editingId)}
        onOpenChange={(next) => {
          if (!next) closeEdit();
        }}
      >
        <SheetContent className="w-full max-w-md sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="aavedak-display text-lg font-normal">
              Edit application
            </SheetTitle>
            <SheetDescription className="text-[12px] leading-relaxed">
              Update details or permanently delete this application.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <div className="space-y-2.5">
              {(() => {
                const current = editingId ? appsById.get(editingId) : null;
                return (
                  <div className="border-border/70 bg-muted/30 space-y-1 rounded-lg border px-3 py-2.5">
                    <p className="text-foreground text-[11px] font-semibold tracking-tight">
                      Linked job & cover letter
                    </p>
                    <p className="text-muted-foreground text-[12px]">
                      Job:{" "}
                      {current?.jobTitle
                        ? `${current.jobTitle}${current.jobId ? ` (${current.jobId.slice(0, 8)}…)` : ""}`
                        : current?.jobId
                          ? current.jobId
                          : "—"}
                    </p>
                    <p className="text-muted-foreground text-[12px]">
                      Cover letter: {current?.coverLetterTitle || "—"}
                    </p>
                  </div>
                );
              })()}
              <label className="block space-y-1">
                <span className="text-foreground text-[12px] font-medium">Company name *</span>
                <CompanySelect
                  value={draft.companyName}
                  onChange={(name) => setDraft((d) => ({ ...d, companyName: name }))}
                  placeholder="e.g. Stripe"
                />
              </label>
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
              <div className="space-y-1">
                <span className="text-foreground text-[12px] font-medium">Applied date</span>
                <DatePicker
                  value={isoToDate(draft.appliedAt)}
                  onValueChange={(date) =>
                    setDraft((d) => ({ ...d, appliedAt: date ? format(date, "yyyy-MM-dd") : "" }))
                  }
                  placeholder="Pick a date"
                  formatString="yyyy-MM-dd"
                />
              </div>
              <div className="space-y-1">
                <span className="text-foreground text-[12px] font-medium">Cover letter used</span>
                <Select
                  value={draft.coverLetterId || "__none"}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, coverLetterId: v === "__none" ? "" : v || "" }))
                  }
                >
                  <SelectTrigger className="border-border bg-background text-foreground h-9 w-full rounded-md border px-2.5 text-[13px]">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="z-280">
                    <SelectItem value="__none">None</SelectItem>
                    {coverLetters.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                        {c.companyName ? ` · ${c.companyName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="block space-y-1">
                <span className="text-foreground text-[12px] font-medium">Notes</span>
                <Textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  rows={3}
                  className="min-h-18 max-h-40 overflow-y-auto py-2"
                />
              </label>
              <div className="space-y-1">
                <span className="text-foreground text-[12px] font-medium">Status</span>
                <StatusSelect
                  value={draft.status}
                  options={APPLICATION_STATUSES}
                  onChange={(s) => setDraft((d) => ({ ...d, status: s }))}
                  triggerClassName="h-9 w-full cursor-pointer text-[13px]"
                />
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Delete permanently removes the application and lowers that day on your dashboard
                graph.
              </p>
            </div>
          </div>
          <SheetFooter className="border-border/70 -mx-6 -mb-6 flex-wrap border-t px-6 py-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={pendingAction === "delete"}
              loadingText="Deleting…"
              disabled={pending}
              onClick={() => void deleteApplication()}
              className="mr-auto"
            >
              Delete
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={closeEdit}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              loading={pendingAction === "save"}
              disabled={pending}
              onClick={() => void saveEdit()}
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ImportApplicationsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(apps) => {
          if (apps.length === 0) return;
          setApplications((list) => {
            const ids = new Set(list.map((a) => a.id));
            const fresh = apps.filter((a) => !ids.has(a.id) && a.status !== "archived");
            return fresh.length ? [...fresh, ...list] : list;
          });
        }}
      />
    </ShellWidth>
  );
}

function KanbanGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="2.5"
        width="5.5"
        height="11"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="9"
        y="2.5"
        width="5.5"
        height="11"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ListGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="2.75" cy="4" r="1" fill="currentColor" />
      <path d="M5.5 4h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2.75" cy="8" r="1" fill="currentColor" />
      <path d="M5.5 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2.75" cy="12" r="1" fill="currentColor" />
      <path d="M5.5 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ImportGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 8h7.5M7.5 5.5 10 8l-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 3.5H12a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 12.5h-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5v7M5.5 7.5 8 10l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ListView({
  applications,
  pageSize,
  onSelect,
}: {
  applications: ApplicationDto[];
  pageSize: number;
  onSelect: (app: ApplicationDto) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    if (statusFilter === "all") return applications;
    return applications.filter((a) => a.status === statusFilter);
  }, [applications, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize]);

  if (applications.length === 0) return null;

  return (
    <Card className="border-border/80 bg-card/60 gap-0 space-y-2 overflow-hidden rounded-xl border p-3">
      <ToggleGroup
        aria-label="Filter by status"
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
        value={[statusFilter]}
        // Single mode lets the pressed item turn off, which means "All".
        onValueChange={(next) =>
          setStatusFilter((next[0] as typeof statusFilter | undefined) ?? "all")
        }
      >
        <ToggleGroupItem value="all" className="h-7 rounded-full px-2.5 text-[11px]">
          All ({applications.length})
        </ToggleGroupItem>
        {DEFAULT_KANBAN_STATUSES.map((status) => {
          const count = applications.filter((a) => a.status === status).length;
          if (count === 0) return null;
          return (
            <ToggleGroupItem
              key={status}
              value={status}
              className="h-7 rounded-full px-2.5 text-[11px]"
            >
              {STATUS_LABELS[status]} ({count})
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <Table className="text-[12px] font-normal">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-normal">Company</TableHead>
            <TableHead className="font-normal">Role</TableHead>
            <TableHead className="font-normal">Location</TableHead>
            <TableHead className="font-normal">CTC</TableHead>
            <TableHead className="font-normal">Status</TableHead>
            <TableHead className="font-normal">Applied</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((app) => (
            <TableRow
              key={app.id}
              className="hover:bg-muted/40 cursor-pointer"
              onClick={() => onSelect(app)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(app);
                }
              }}
              tabIndex={0}
              role="button"
            >
              <TableCell className="text-foreground/90 font-normal">{app.companyName}</TableCell>
              <TableCell className="text-muted-foreground font-normal">{app.role}</TableCell>
              <TableCell className="text-muted-foreground font-normal">{app.location}</TableCell>
              <TableCell className="text-muted-foreground font-normal">
                {app.salaryCtc || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground font-normal">
                <span className="inline-flex items-center gap-1.5">
                  {STATUS_LABELS[app.status]}
                  {app.statusReason === "job_expired" ? <JobExpiredBadge /> : null}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap font-normal">
                <ApplicationDate app={app} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 ? (
        <p className="text-muted-foreground px-1 py-2 text-[11px]">
          No applications in this status.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
          <p className="text-muted-foreground text-[11px] tabular-nums">
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, rows.length)} of {rows.length}
          </p>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                />
              </PaginationItem>
              {paginationPageList(currentPage, pageCount).map((pageNumber, index, list) => {
                const previous = list[index - 1];
                const showEllipsis = previous != null && pageNumber - previous > 1;
                return (
                  <span key={pageNumber} className="contents">
                    {showEllipsis ? (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : null}
                    <PaginationItem>
                      <PaginationLink
                        size="sm"
                        isActive={pageNumber === currentPage}
                        onClick={() => setPage(pageNumber)}
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  </span>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  size="sm"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </Card>
  );
}

/** Marks applications the system moved to Rejected because the posting expired. */
function JobExpiredBadge() {
  return (
    <Badge
      variant="secondary"
      className="px-1.5 py-0 text-[10px]"
      title="Automatically marked Rejected: the job posting is older than 30 days. Change the status anytime."
    >
      Job expired
    </Badge>
  );
}

/**
 * When the user applied (the date they set), or — for bookmarked / preparing items with no
 * applied date yet — when it was added to the tracker.
 */
function ApplicationDate({ app }: { app: Pick<ApplicationDto, "appliedAt" | "createdAt"> }) {
  return app.appliedAt ? (
    <span className="text-muted-foreground text-[11px] leading-snug" title="Date applied">
      Applied {formatDateOnly(app.appliedAt)}
    </span>
  ) : (
    <span
      className="text-muted-foreground/80 text-[11px] leading-snug"
      title="Date added to the tracker"
    >
      Added {formatDateOnly(app.createdAt, { zone: "ist" })}
    </span>
  );
}
