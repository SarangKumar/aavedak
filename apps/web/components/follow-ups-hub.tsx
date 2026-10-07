"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { GmailConnectBanner } from "@/components/gmail-connect-banner";
import { ShellWidth } from "@/components/shell-width";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePickerField } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type FollowUpDto = {
  id: string;
  title: string;
  dueDate: string | null;
  sendAfter: string | null;
  status: "pending" | "queued" | "sent" | "sent_stub" | "failed" | "done" | "dismissed";
  personId: string | null;
  applicationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonLite = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
};

export type ApplicationLite = {
  id: string;
  companyName: string;
  role: string;
};

type Filter = "open" | "all" | "closed";

const STATUS_LABEL: Record<FollowUpDto["status"], string> = {
  pending: "Pending",
  queued: "Queued",
  sent: "Sent",
  sent_stub: "Sent (legacy stub)",
  failed: "Failed",
  done: "Done",
  dismissed: "Dismissed",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function statusVariant(
  status: FollowUpDto["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "queued") return "default";
  if (status === "pending") return "secondary";
  if (status === "sent") return "outline";
  if (status === "sent_stub") return "outline";
  if (status === "failed") return "destructive";
  if (status === "dismissed") return "destructive";
  return "outline";
}

type Props = {
  initialFollowUps: FollowUpDto[];
  people: PersonLite[];
  applications: ApplicationLite[];
};

export function FollowUpsHub({ initialFollowUps, people, applications }: Props) {
  const [items, setItems] = useState(initialFollowUps);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [personId, setPersonId] = useState("");
  const [notes, setNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const appsById = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((f) => {
      if (
        filter === "open" &&
        f.status !== "pending" &&
        f.status !== "queued" &&
        f.status !== "failed"
      )
        return false;
      if (
        filter === "closed" &&
        (f.status === "pending" || f.status === "queued" || f.status === "failed")
      )
        return false;
      if (!q) return true;
      const person = f.personId ? peopleById.get(f.personId) : null;
      const app = f.applicationId ? appsById.get(f.applicationId) : null;
      const hay = [
        f.title,
        f.notes ?? "",
        f.status,
        person?.name ?? "",
        person?.email ?? "",
        person?.company ?? "",
        app?.companyName ?? "",
        app?.role ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [appsById, filter, items, peopleById, query]);

  const counts = useMemo(() => {
    let open = 0;
    let closed = 0;
    for (const f of items) {
      if (f.status === "pending" || f.status === "queued" || f.status === "failed") open += 1;
      else closed += 1;
    }
    return { open, closed, all: items.length };
  }, [items]);

  const patchStatus = useCallback(async (id: string, status: "done" | "dismissed" | "pending") => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/follow-ups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { followUp?: FollowUpDto; error?: string };
      if (!res.ok || !data.followUp) throw new Error(data.error || "Update failed.");
      setItems((list) => list.map((f) => (f.id === id ? { ...f, ...data.followUp! } : f)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }, []);

  async function createFollowUp() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          dueDate: dueDate || null,
          personId: personId || null,
          notes: notes.trim() || null,
          status: "pending",
        }),
      });
      const data = (await res.json()) as { followUp?: FollowUpDto; error?: string };
      if (!res.ok || !data.followUp) throw new Error(data.error || "Create failed.");
      const created: FollowUpDto = {
        id: data.followUp.id,
        title: data.followUp.title,
        dueDate: data.followUp.dueDate,
        sendAfter: data.followUp.sendAfter ?? null,
        status: data.followUp.status,
        personId: data.followUp.personId,
        applicationId: data.followUp.applicationId,
        notes: data.followUp.notes,
        createdAt: data.followUp.createdAt,
        updatedAt: data.followUp.updatedAt,
      };
      setItems((list) => [created, ...list]);
      setTitle("");
      setDueDate("");
      setPersonId("");
      setNotes("");
      setNotice("Follow-up created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  }

  async function processQueue() {
    setProcessing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/referrals/process-queue", { method: "POST" });
      const data = (await res.json()) as {
        processed?: number;
        sent?: number;
        failed?: number;
        followUps?: Array<Partial<FollowUpDto> & { id: string; status?: FollowUpDto["status"] }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Process failed.");
      const followUps = data.followUps ?? [];
      if (followUps.length) {
        setItems((list) =>
          list.map((f) => {
            const hit = followUps.find((p) => p.id === f.id);
            if (!hit) return f;
            return {
              ...f,
              status: hit.status ?? f.status,
              notes: hit.notes ?? f.notes,
              updatedAt: hit.updatedAt ?? f.updatedAt,
            };
          }),
        );
      }
      const n = typeof data.processed === "number" ? data.processed : followUps.length;
      const sent = typeof data.sent === "number" ? data.sent : 0;
      const failed = typeof data.failed === "number" ? data.failed : 0;
      setNotice(
        n > 0
          ? `Processed ${n}: ${sent} sent via Gmail, ${failed} failed.`
          : "No queued items are due yet.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Process failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <ShellWidth className="aavedak-fade-up space-y-6 py-8 sm:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide">Follow-ups</p>
          <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Follow-ups</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            Pending asks and queued outreach. Queued mail waits ~10 minutes, then sends via your
            Gmail (cron every 10 min, or Process due queue). Compose on{" "}
            <Link href="/referrals" className="text-primary hover:underline">
              Referrals
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void processQueue()}
            disabled={processing}
          >
            {processing ? "Processing…" : "Process due queue"}
          </Button>
          <Link href="/people" className="text-primary text-[12px] font-medium hover:underline">
            People
          </Link>
        </div>
      </header>

      <GmailConnectBanner callbackURL="/follow-ups" />

      {(error || notice) && (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-[12px]",
            error
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-primary/30 bg-primary/10 text-foreground",
          )}
          role="status"
        >
          {error ?? notice}
        </p>
      )}

      <section className="border-border/80 bg-card space-y-3 rounded-lg border p-4 shadow-sm">
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">New follow-up</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Title (required)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Follow-up title"
          />
          <DatePickerField value={dueDate} onChange={setDueDate} placeholder="Due date" />
          <select
            className="border-input bg-muted text-foreground box-border flex h-9 w-full rounded-md border px-3 text-sm"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            aria-label="Person"
          >
            <option value="">No person</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.company ? ` · ${p.company}` : ""}
              </option>
            ))}
          </select>
          <Button onClick={() => void createFollowUp()} disabled={creating}>
            {creating ? "Saving…" : "Add follow-up"}
          </Button>
        </div>
        <textarea
          className="border-input bg-muted text-foreground placeholder:text-muted-foreground min-h-[72px] w-full resize-y rounded-md border px-3 py-2 text-sm"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["open", `Open (${counts.open})`],
              ["all", `All (${counts.all})`],
              ["closed", `Closed (${counts.closed})`],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="xs"
              variant={filter === key ? "default" : "outline"}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Input
          className="sm:max-w-xs"
          placeholder="Search title, person, company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search follow-ups"
        />
      </div>

      <div className="border-border/80 bg-card overflow-hidden rounded-lg border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Person</TableHead>
              <TableHead>Application</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Send after</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center text-[13px]"
                >
                  No follow-ups in this view. Queue some from Referrals or add one above.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((f) => {
                const person = f.personId ? peopleById.get(f.personId) : null;
                const app = f.applicationId ? appsById.get(f.applicationId) : null;
                const busy = busyId === f.id;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="max-w-[220px]">
                      <p className="text-foreground truncate text-[13px] font-medium">{f.title}</p>
                      {f.notes ? (
                        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px]">
                          {f.notes}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(f.status)}>{STATUS_LABEL[f.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[12px]">
                      {person ? (
                        <>
                          <span className="text-foreground">{person.name}</span>
                          {person.email ? (
                            <span className="block truncate text-[11px]">{person.email}</span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[160px] truncate text-[12px]">
                      {app ? `${app.companyName} · ${app.role}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-[12px]">
                      {f.dueDate ? f.dueDate.slice(0, 10) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap text-[12px]">
                      {formatWhen(f.sendAfter)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        {(f.status === "pending" || f.status === "queued") && (
                          <>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void patchStatus(f.id, "done")}
                            >
                              {busy ? "…" : "Done"}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void patchStatus(f.id, "dismissed")}
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                        {(f.status === "done" ||
                          f.status === "dismissed" ||
                          f.status === "sent_stub") && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void patchStatus(f.id, "pending")}
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </ShellWidth>
  );
}
