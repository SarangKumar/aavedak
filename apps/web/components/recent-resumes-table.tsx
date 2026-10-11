"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AdminResumeRow } from "@/lib/admin-data";
import { formatDateTimeFixed } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

type ResumeFilter = "all" | "active" | "inactive" | "archived";

const FILTERS: Array<{ value: ResumeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function RecentResumesTable({ resumes }: { resumes: AdminResumeRow[] }) {
  const [filter, setFilter] = useState<ResumeFilter>("all");

  const data = useMemo(
    () => (filter === "all" ? resumes : resumes.filter((r) => r.status === filter)),
    [resumes, filter],
  );

  const columns = useMemo<DataTableColumn<AdminResumeRow>[]>(
    () => [
      {
        id: "displayName",
        header: "Display",
        accessorKey: "displayName",
        sortable: true,
        searchable: true,
        enableHiding: false,
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-foreground truncate font-medium">{row.displayName}</p>
            <p className="text-muted-foreground truncate font-mono text-[10px]">
              {row.originalFilename} · {formatBytes(row.byteSize)}
            </p>
          </div>
        ),
      },
      {
        id: "owner",
        header: "Owner",
        searchable: true,
        accessorKey: "ownerEmail",
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-foreground truncate">{row.ownerName || row.username || "—"}</p>
            <p className="text-muted-foreground truncate font-mono text-[10px]">
              {row.ownerEmail || row.userId.slice(0, 10)}
              {row.username ? (
                <>
                  {" · "}
                  <Link href={`/${row.username}`} className="text-primary hover:underline">
                    @{row.username}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        sortable: true,
        width: "7rem",
        cell: (row) => (
          <Badge
            variant="outline"
            className={cn(
              "h-5 text-[10px] uppercase",
              row.status === "active" && "border-primary/40 text-primary",
            )}
          >
            {row.status}
          </Badge>
        ),
      },
      {
        id: "file",
        header: "File",
        width: "6rem",
        cell: (row) => (
          <span
            className={cn("text-[11px]", row.fileExists ? "text-foreground" : "text-destructive")}
          >
            {row.fileExists ? "On disk" : "Missing"}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        accessorKey: "createdAt",
        sortable: true,
        width: "11rem",
        cell: (row) => (
          <span className="text-muted-foreground tabular-nums">
            {formatDateTimeFixed(row.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <Card className="border-border/80 bg-card gap-3 rounded-xl border p-3.5 shadow-sm">
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 p-0">
        <div className="space-y-0.5">
          <CardTitle className="text-foreground text-[13px] font-semibold tracking-tight">
            Recent resumes
          </CardTitle>
          <CardDescription className="text-muted-foreground text-[11px]">
            Metadata from Neon. Open the PDF when the GCS object key is present.
          </CardDescription>
        </div>
        <ToggleGroup
          aria-label="Filter resumes by status"
          variant="outline"
          size="sm"
          spacing={1}
          value={[filter]}
          onValueChange={(next) => setFilter((next[0] as ResumeFilter) || "all")}
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem
              key={f.value}
              value={f.value}
              className="h-7 rounded-full px-2.5 text-[11px]"
            >
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          columns={columns}
          data={data}
          searchable
          searchPlaceholder="Search display name or owner…"
          pagination={10}
          columnVisibility
          emptyMessage="No resumes match this filter."
          renderRowActions={(row) =>
            row.fileExists ? (
              <a
                href={`/api/resumes/${row.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="border-border text-foreground hover:text-primary inline-flex h-7 items-center rounded-md border px-2 text-[11px]"
              >
                PDF
              </a>
            ) : (
              <span className="text-muted-foreground text-[11px]">—</span>
            )
          }
          actionsWidth="5rem"
        />
      </CardContent>
    </Card>
  );
}
