"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ShellWidth } from "@/components/shell-width";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminOverviewCounts, AdminResumeRow } from "@/lib/admin-data";
import type { PendingUserRow } from "@/lib/user-approval-shared";
import { cn } from "@/lib/utils";

type Props = {
  adminEmail: string;
  allowlist: string[];
  counts: AdminOverviewCounts;
  resumes: AdminResumeRow[];
  pendingUsers: PendingUserRow[];
};

type ResumeFilter = "all" | "active" | "inactive" | "archived";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export function AdminShell({
  adminEmail,
  allowlist,
  counts,
  resumes,
  pendingUsers: initialPending,
}: Props) {
  const [resumeFilter, setResumeFilter] = useState<ResumeFilter>("all");
  const [pendingUsers, setPendingUsers] = useState(initialPending);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredResumes = useMemo(() => {
    if (resumeFilter === "all") return resumes;
    return resumes.filter((r) => r.status === resumeFilter);
  }, [resumes, resumeFilter]);

  const cards: Array<{ key: keyof AdminOverviewCounts; label: string }> = [
    { key: "profiles", label: "Profiles" },
    { key: "applications", label: "Applications" },
    { key: "resumes", label: "Resumes" },
    { key: "people", label: "People" },
    { key: "templates", label: "Templates" },
  ];

  async function decide(userId: string, status: "approved" | "rejected") {
    setActionId(userId);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update approval.");
      setPendingUsers((list) => list.filter((u) => u.userId !== userId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update approval.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <ShellWidth className="aavedak-fade-up space-y-4 py-7 sm:py-9">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            Admin · {adminEmail}
          </p>
          <h1 className="aavedak-display text-foreground text-xl tracking-tight sm:text-2xl">
            Ops overview
          </h1>
          <p className="text-muted-foreground max-w-2xl text-[12px] leading-relaxed">
            Approve new registrations, review resumes, and manage allowlisted admins.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/dashboard"
            className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
          >
            Dashboard
          </Link>
          <Link
            href="/referrals"
            className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
          >
            Referrals
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.key}
            className="border-border/80 bg-card rounded-xl border px-3 py-2.5 shadow-sm"
          >
            <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
              {card.label}
            </p>
            <p className="text-foreground mt-0.5 font-mono text-xl tabular-nums tracking-tight">
              {counts[card.key]}
            </p>
          </div>
        ))}
      </section>

      <section className="border-border/80 bg-card space-y-2.5 rounded-xl border p-3.5 shadow-sm">
        <div>
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
            Pending registrations
            {pendingUsers.length > 0 ? (
              <span className="text-primary ml-1.5 font-mono text-[12px]">
                ({pendingUsers.length})
              </span>
            ) : null}
          </h2>
          <p className="text-muted-foreground text-[11px]">
            New Google sign-ins wait here until you approve them for onboarding.
          </p>
        </div>
        {actionError ? (
          <p className="text-destructive text-[12px]" role="alert">
            {actionError}
          </p>
        ) : null}
        {pendingUsers.length === 0 ? (
          <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-3 py-8 text-center text-[12px]">
            No pending access requests.
          </div>
        ) : (
          <ul className="divide-border/60 border-border/70 divide-y rounded-xl border">
            {pendingUsers.map((u) => (
              <li
                key={u.userId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-[13px] font-medium">
                    {u.name || u.username}
                  </p>
                  <p className="text-muted-foreground truncate font-mono text-[11px]">
                    {u.email || "—"} · @{u.username} · {formatWhen(u.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="cursor-pointer"
                    disabled={actionId === u.userId}
                    loading={actionId === u.userId}
                    onClick={() => void decide(u.userId, "approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={actionId === u.userId}
                    onClick={() => void decide(u.userId, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-border/80 bg-card space-y-2.5 rounded-xl border p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              Recent resumes
            </h2>
            <p className="text-muted-foreground text-[11px]">
              Metadata from Neon. Open PDF when the GCS object key is present.
            </p>
          </div>
          <Select
            value={resumeFilter}
            onValueChange={(v) => setResumeFilter((v as ResumeFilter) || "all")}
          >
            <SelectTrigger className="border-border bg-background text-foreground h-8 w-[9rem] rounded-lg border px-2 text-[12px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="z-[240]">
              <SelectItem value="all" className="text-[12px]">
                All statuses
              </SelectItem>
              <SelectItem value="active" className="text-[12px]">
                Active
              </SelectItem>
              <SelectItem value="inactive" className="text-[12px]">
                Inactive
              </SelectItem>
              <SelectItem value="archived" className="text-[12px]">
                Archived
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredResumes.length === 0 ? (
          <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-3 py-8 text-center text-[12px]">
            No resumes match this filter.
          </div>
        ) : (
          <div className="border-border/70 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[48rem] text-left text-[12px]">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2.5 py-2 font-medium">Display</th>
                  <th className="px-2.5 py-2 font-medium">Owner</th>
                  <th className="px-2.5 py-2 font-medium">Status</th>
                  <th className="px-2.5 py-2 font-medium">File</th>
                  <th className="px-2.5 py-2 font-medium">Created</th>
                  <th className="px-2.5 py-2 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {filteredResumes.map((row) => (
                  <tr key={row.id} className="bg-card/40">
                    <td className="px-2.5 py-2 align-top">
                      <p className="text-foreground font-medium">{row.displayName}</p>
                      <p className="text-muted-foreground truncate font-mono text-[10px]">
                        {row.originalFilename} · {formatBytes(row.byteSize)}
                      </p>
                    </td>
                    <td className="px-2.5 py-2 align-top">
                      <p className="text-foreground">{row.ownerName || row.username || "—"}</p>
                      <p className="text-muted-foreground truncate font-mono text-[10px]">
                        {row.ownerEmail || row.userId.slice(0, 10)}
                        {row.username ? (
                          <>
                            {" · "}
                            <Link
                              href={`/${row.username}`}
                              className="text-primary hover:underline"
                            >
                              @{row.username}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </td>
                    <td className="px-2.5 py-2 align-top">
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 text-[10px] uppercase",
                          row.status === "active" && "border-primary/40 text-primary",
                        )}
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-2.5 py-2 align-top">
                      <span
                        className={cn(
                          "text-[11px]",
                          row.fileExists ? "text-foreground" : "text-destructive",
                        )}
                      >
                        {row.fileExists ? "On disk" : "Missing"}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-2.5 py-2 align-top tabular-nums">
                      {formatWhen(row.createdAt)}
                    </td>
                    <td className="px-2.5 py-2 align-top">
                      {row.fileExists ? (
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
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border-border/80 bg-card space-y-2 rounded-xl border p-3.5 shadow-sm">
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
          Person email suggest-corrections
        </h2>
        <p className="text-muted-foreground text-[12px] leading-relaxed">
          Queue for proposed email fixes on global/user contacts. Coming later — no items yet.
        </p>
        <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-3 py-10 text-center text-[12px]">
          Empty queue — nothing to review.
        </div>
      </section>

      <section className="border-border/80 bg-card rounded-xl border p-3.5">
        <p className="text-foreground text-[12px] font-semibold tracking-tight">
          ADMIN_EMAILS allowlist
        </p>
        <ul className="text-muted-foreground mt-2 space-y-1 font-mono text-[11px]">
          {allowlist.map((email) => (
            <li key={email}>{email}</li>
          ))}
        </ul>
      </section>
    </ShellWidth>
  );
}
