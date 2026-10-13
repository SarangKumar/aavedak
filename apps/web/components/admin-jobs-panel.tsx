"use client";

import { format, parseISO } from "date-fns";
import { useCallback, useEffect, useState } from "react";

import { JobFormFields, type JobFormField, type JobFormValues } from "@/components/job-form-fields";
import { SearchInput } from "@/components/search-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-picker";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminJobRow } from "@/lib/admin-jobs";
import { canonicalLocation } from "@/lib/locations";

type SearchResult = {
  rows: AdminJobRow[];
  total: number;
  page: number;
  pageSize: number;
  sources: string[];
};

type Filters = { q: string; source: string; from: string; to: string; page: number };

const EMPTY_FILTERS: Filters = { q: "", source: "all", from: "", to: "", page: 1 };

function toForm(row: AdminJobRow): JobFormValues {
  return {
    title: row.title,
    company: row.company,
    // Only canonical values go in the Combobox; anything else shows as a hint.
    location: canonicalLocation(row.location) ?? "",
    source: row.source,
    url: row.url ?? "",
    salary: row.salary ?? "",
    description: row.description,
    workMode: row.workMode ?? "",
    employmentType: row.employmentType ?? "",
    seniority: row.seniority ?? "",
    postedAt: row.postedAt ? row.postedAt.slice(0, 10) : "",
    skills: row.skills.join(", "),
  };
}

function day(iso: string | null) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : format(new Date(t), "d MMM yyyy");
}

/** Admin → Jobs: search every job, edit it in a drawer, or delete it. */
export function AdminJobsPanel() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdminJobRow | null>(null);
  const [form, setForm] = useState<JobFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<AdminJobRow | null>(null);
  const [impact, setImpact] = useState<{
    applications: number;
    users: number;
    coverLetters: number;
    analyses: number;
    recommendedTo: number;
  } | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: f.q, source: f.source, page: String(f.page) });
      if (f.from) params.set("from", f.from);
      if (f.to) params.set("to", f.to);
      const res = await fetch(`/api/admin/jobs?${params}`, { cache: "no-store" });
      const json = (await res.json()) as SearchResult & { error?: string };
      if (!res.ok) throw new Error(json.error || "Search failed.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  // Debounce typing into the search box.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => (f.q === query.trim() ? f : { ...f, q: query.trim(), page: 1 }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  function openEdit(row: AdminJobRow) {
    setEditing(row);
    setForm(toForm(row));
    setFormError(null);
  }

  async function save() {
    if (!editing || !form) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          company: form.company,
          // Empty = leave a non-canonical stored location as it is.
          ...(form.location ? { location: form.location } : {}),
          source: form.source,
          url: form.url || null,
          salary: form.salary || null,
          description: form.description,
          workMode: form.workMode || null,
          employmentType: form.employmentType || null,
          seniority: form.seniority || null,
          postedAt: form.postedAt || null,
          skills: form.skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setEditing(null);
      setNotice(`Saved “${form.title}”.`);
      void load(filters);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function askDelete(row: AdminJobRow) {
    setDeleting(row);
    setImpact(null);
    try {
      const res = await fetch(`/api/admin/jobs/${encodeURIComponent(row.id)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { impact?: typeof impact };
      if (res.ok && json.impact) setImpact(json.impact);
    } catch {
      // The dialog still explains the effect without counts.
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    try {
      const res = await fetch(`/api/admin/jobs/${encodeURIComponent(deleting.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Delete failed.");
      setNotice(`Deleted “${deleting.title}”.`);
      setDeleting(null);
      void load(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(null);
    } finally {
      setDeletePending(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = filters.page;

  return (
    <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-xl border p-3.5 shadow-sm">
      <div className="space-y-0.5">
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Jobs</h2>
        <p className="text-muted-foreground text-[12px] leading-relaxed">
          Search every job (discovered and users&apos; own) by title, company, location, link or id.
          Edit fixes it for everyone; delete removes it but keeps users&apos; applications.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, company, location, URL or id…"
          className="w-full sm:max-w-sm"
          aria-label="Search jobs"
        />
        <Select
          value={filters.source}
          onValueChange={(v) => setFilters((f) => ({ ...f, source: v || "all", page: 1 }))}
        >
          <SelectTrigger
            className="h-8 w-40 rounded-md border px-2.5 text-[12px]"
            aria-label="Filter by source"
          >
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent className="z-240">
            <SelectItem value="all" className="text-[12px]">
              All sources
            </SelectItem>
            {(data?.sources ?? []).map((s) => (
              <SelectItem key={s} value={s} className="text-[12px]">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker
          value={
            filters.from || filters.to
              ? {
                  from: filters.from ? parseISO(filters.from) : undefined,
                  to: filters.to ? parseISO(filters.to) : undefined,
                }
              : undefined
          }
          onValueChange={(range) =>
            setFilters((f) => ({
              ...f,
              from: range?.from ? format(range.from, "yyyy-MM-dd") : "",
              to: range?.to ? format(range.to, "yyyy-MM-dd") : "",
              page: 1,
            }))
          }
          placeholder="Posted date range"
          aria-label="Posted date range"
          formatString="d MMM yyyy"
          className="h-8 w-64 text-[12px]"
        />
        {filters.source !== "all" || filters.from || filters.to || query ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setFilters(EMPTY_FILTERS);
            }}
          >
            Clear
          </Button>
        ) : null}
        <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
          {data ? `${data.total} job${data.total === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-[12px]">{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? <p className="text-primary text-[12px]">{notice}</p> : null}

      <div className="border-border/70 overflow-hidden rounded-xl border">
        <Table className="text-[12px] font-normal">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-normal">Job</TableHead>
              <TableHead className="font-normal">Location</TableHead>
              <TableHead className="font-normal">Source</TableHead>
              <TableHead className="font-normal">Posted</TableHead>
              <TableHead className="font-normal">Owner</TableHead>
              <TableHead className="text-right font-normal">Applications</TableHead>
              <TableHead className="text-right font-normal">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data
              ? Array.from({ length: 6 }, (_, i) => <AdminJobsRowSkeleton key={i} />)
              : (data?.rows ?? []).map((row) => (
                  <TableRow key={row.id} className={loading ? "opacity-60" : undefined}>
                    <TableCell className="max-w-72">
                      <p className="text-foreground truncate font-medium">{row.title}</p>
                      <p className="text-muted-foreground truncate">{row.company}</p>
                      <p className="text-muted-foreground truncate font-mono text-[10px]">
                        {row.id}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{row.location}</TableCell>
                    <TableCell>
                      <span className="text-foreground">{row.sourceLabel}</span>
                      {row.closed ? (
                        <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                          closed
                        </Badge>
                      ) : null}
                      {row.sourceUrl || row.url ? (
                        <a
                          href={row.sourceUrl ?? row.url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary block max-w-48 truncate text-[11px] hover:underline"
                        >
                          {row.sourceUrl ?? row.url}
                        </a>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {day(row.postedAt ?? row.postedAtFallback)}
                      {row.postedAt ? null : (
                        <span className="text-muted-foreground block text-[10px]">first seen</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-44 truncate">
                      {row.shared ? (
                        <span className="text-muted-foreground">Shared</span>
                      ) : (
                        (row.ownerEmail ?? "User")
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.applicationCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => void askDelete(row)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            {!loading && data && data.rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  No jobs match.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                disabled={page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
              />
            </PaginationItem>
            {paginationPageList(page, totalPages).flatMap((p, i, list) => [
              ...(i > 0 && p - list[i - 1]! > 1
                ? [
                    <PaginationItem key={`gap-${p}`}>
                      <PaginationEllipsis />
                    </PaginationItem>,
                  ]
                : []),
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === page}
                  onClick={() => setFilters((f) => ({ ...f, page: p }))}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>,
            ])}
            <PaginationItem>
              <PaginationNext
                disabled={page >= totalPages}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: Math.min(totalPages, f.page + 1) }))
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Edit job</SheetTitle>
            <SheetDescription>
              Changes apply to everyone who sees this job.
              {editing && !editing.shared ? ` Owned by ${editing.ownerEmail ?? "a user"}.` : ""}
            </SheetDescription>
          </SheetHeader>
          {form && editing ? (
            <div className="space-y-3 px-4">
              <JobFormFields
                value={form}
                onFieldChange={(field: JobFormField, next: string) =>
                  setForm((f) => (f ? { ...f, [field]: next } : f))
                }
                onSourceChange={(src) => setForm((f) => (f ? { ...f, source: src } : f))}
                locationHint={form.location ? null : editing.location || null}
              />
              {formError ? (
                <Alert variant="destructive">
                  <AlertDescription className="text-[12px]">{formError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
          <SheetFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              loading={saving}
              disabled={!form || !form.title.trim() || !form.company.trim()}
              onClick={() => void save()}
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The job is removed for everyone. Users&apos; applications stay in their tracker with
              their company, role, location, link and status history, they just no longer link to
              this job. Cover letters and JD analyses are kept and unlinked too. Its recommendations
              and match scores are removed. The next scan won&apos;t add the same posting back from
              the same source.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-muted-foreground px-1 text-[12px]">
            {impact ? (
              <ul className="list-disc space-y-0.5 pl-5">
                <li>
                  {impact.applications} application{impact.applications === 1 ? "" : "s"} from{" "}
                  {impact.users} user{impact.users === 1 ? "" : "s"} will be unlinked
                </li>
                <li>
                  {impact.coverLetters} cover letter{impact.coverLetters === 1 ? "" : "s"} and{" "}
                  {impact.analyses} analys{impact.analyses === 1 ? "is" : "es"} unlinked
                </li>
                <li>
                  Recommended to {impact.recommendedTo} user
                  {impact.recommendedTo === 1 ? "" : "s"} (removed from their Discover)
                </li>
              </ul>
            ) : (
              <Skeleton className="h-12 w-full" />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={deletePending}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Delete job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AdminJobsRowSkeleton() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell>
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="mt-1 h-3 w-28" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-3 w-28" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-3 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-3 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-3 w-24" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-3 w-6" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-7 w-28" />
      </TableCell>
    </TableRow>
  );
}

/** Same layout as the panel, for the page's loading state. */
export function AdminJobsPanelSkeleton() {
  return (
    <Card className="border-border/80 bg-card gap-0 space-y-3 rounded-xl border p-3.5 shadow-sm">
      <div className="space-y-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-full sm:max-w-sm" />
        <Skeleton className="h-8 w-40 rounded-md" />
        <Skeleton className="h-8 w-64 rounded-md" />
      </div>
      <div className="border-border/70 overflow-hidden rounded-xl border">
        <Table className="text-[12px]">
          <TableBody>
            {Array.from({ length: 6 }, (_, i) => (
              <AdminJobsRowSkeleton key={i} />
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
