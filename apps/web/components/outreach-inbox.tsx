"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BoardToggleLink, FullscreenBoard } from "@/components/fullscreen-board";
import { GmailConnectBanner } from "@/components/gmail-connect-banner";
import { ShellWidth } from "@/components/shell-width";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ResizeHandle } from "@/components/ui/resize-handle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTimeReadable } from "@/lib/format-datetime";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";

export type FollowUpDto = {
  id: string;
  title: string;
  dueDate: string | null;
  sendAfter: string | null;
  status: "pending" | "queued" | "sent" | "sent_stub" | "failed" | "done" | "dismissed";
  personId: string | null;
  applicationId: string | null;
  notes: string | null;
  mailKind?: "outreach" | "followup" | null;
  mailTo?: string | null;
  mailSubject?: string | null;
  mailBody?: string | null;
  sendError?: string | null;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonLite = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  roleTitle: string | null;
};

export type ApplicationLite = {
  id: string;
  companyName: string;
  role: string;
};

type DurationFilter = "all" | "24h" | "7d" | "30d";

type Thread = {
  key: string;
  personId: string | null;
  applicationId: string | null;
  personName: string;
  personEmail: string | null;
  company: string;
  role: string;
  latestAt: string;
  messages: FollowUpDto[];
  hasFailed: boolean;
};

const LIST_MIN = 240;
const LIST_MAX = 560;
const LIST_DEFAULT = 320;

function mailKindOf(f: FollowUpDto): "outreach" | "followup" {
  if (f.mailKind === "outreach" || f.mailKind === "followup") return f.mailKind;
  if (f.title.startsWith("Follow-up:")) return "followup";
  return "outreach";
}

function statusLabel(status: FollowUpDto["status"]): string {
  if (status === "sent" || status === "sent_stub") return "Success";
  if (status === "failed") return "Failed";
  if (status === "queued") return "Queued";
  if (status === "pending") return "Pending";
  if (status === "dismissed") return "Dismissed";
  if (status === "done") return "Done";
  return status;
}

function statusVariant(
  status: FollowUpDto["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") return "destructive";
  if (status === "queued" || status === "pending") return "secondary";
  if (status === "sent" || status === "sent_stub") return "default";
  return "outline";
}

function withinDuration(iso: string, filter: DurationFilter): boolean {
  if (filter === "all") return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  const age = Date.now() - t;
  if (filter === "24h") return age <= 24 * 60 * 60 * 1000;
  if (filter === "7d") return age <= 7 * 24 * 60 * 60 * 1000;
  return age <= 30 * 24 * 60 * 60 * 1000;
}

function bodyFromMessage(f: FollowUpDto): string {
  if (f.mailBody?.trim()) return f.mailBody.trim();
  if (!f.notes) return "";
  const parts = f.notes.replace(/\r\n/g, "\n").split("\n\n");
  return (parts[parts.length - 1] || f.notes).trim();
}

function subjectFromMessage(f: FollowUpDto): string {
  if (f.mailSubject?.trim()) return f.mailSubject.trim();
  const line = f.notes?.split("\n").find((l) => l.startsWith("Subject:"));
  if (line) return line.slice("Subject:".length).trim();
  return f.title;
}

type Props = {
  initialFollowUps: FollowUpDto[];
  people: PersonLite[];
  applications: ApplicationLite[];
  /** "board" = full-screen inbox only (/outreach/board). */
  variant?: "page" | "board";
};

export function OutreachInbox({ initialFollowUps, people, applications, variant = "page" }: Props) {
  const [items, setItems] = useState(initialFollowUps);
  const [query, setQuery] = useState("");
  const [applicationId, setApplicationId] = useState<string>("");
  const [duration, setDuration] = useState<DurationFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(LIST_DEFAULT);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const appsById = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);

  const threads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Thread>();

    for (const f of items) {
      const person = f.personId ? peopleById.get(f.personId) : null;
      const app = f.applicationId ? appsById.get(f.applicationId) : null;
      const personName = person?.name || "Unknown person";
      const company = app?.companyName || person?.company || "Unknown company";
      const role = app?.role || person?.roleTitle || "";
      const key = `${f.applicationId ?? "none"}:${f.personId ?? f.id}`;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          personId: f.personId,
          applicationId: f.applicationId,
          personName,
          personEmail: person?.email ?? f.mailTo ?? null,
          company,
          role,
          latestAt: f.updatedAt || f.createdAt,
          messages: [f],
          hasFailed: f.status === "failed",
        });
      } else {
        existing.messages.push(f);
        existing.hasFailed = existing.hasFailed || f.status === "failed";
        const at = f.updatedAt || f.createdAt;
        if (new Date(at).getTime() > new Date(existing.latestAt).getTime()) {
          existing.latestAt = at;
        }
      }
    }

    const list = [...map.values()].filter((thread) => {
      if (applicationId && thread.applicationId !== applicationId) return false;
      if (!withinDuration(thread.latestAt, duration)) return false;
      if (!q) return true;
      const hay = [
        thread.personName,
        thread.personEmail ?? "",
        thread.company,
        thread.role,
        ...thread.messages.flatMap((m) => [m.title, m.mailSubject ?? "", m.mailBody ?? ""]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    for (const thread of list) {
      thread.messages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          (mailKindOf(a) === "outreach" ? -1 : 1),
      );
    }
    list.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
    return list;
  }, [applicationId, appsById, duration, items, peopleById, query]);

  const selectedApplication = applicationId ? appsById.get(applicationId) : null;
  const ALL_FOR_APP_KEY = "__all_for_app__";

  const applicationMessages = useMemo(() => {
    if (!applicationId) return [] as { thread: Thread; message: FollowUpDto }[];
    return threads
      .flatMap((t) => t.messages.map((m) => ({ thread: t, message: m })))
      .sort(
        (a, b) => new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime(),
      );
  }, [applicationId, threads]);

  useEffect(() => {
    if (selectedKey === ALL_FOR_APP_KEY && applicationId) return;
    if (selectedKey && threads.some((t) => t.key === selectedKey)) return;
    if (applicationId && threads.length > 0) {
      setSelectedKey(ALL_FOR_APP_KEY);
      return;
    }
    setSelectedKey(threads[0]?.key ?? null);
  }, [threads, selectedKey, applicationId]);

  const selected = threads.find((t) => t.key === selectedKey) ?? null;
  const viewingAllForApp = selectedKey === ALL_FOR_APP_KEY && Boolean(applicationId);

  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startW: listWidth };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [listWidth],
  );

  const onResizeMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = event.clientX - dragRef.current.startX;
    const next = Math.min(LIST_MAX, Math.max(LIST_MIN, dragRef.current.startW + delta));
    setListWidth(next);
  }, []);

  const onResizeEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  async function processQueue() {
    setProcessing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/referrals/process-queue", { method: "POST" });
      const data = (await res.json()) as {
        sent?: number;
        failed?: number;
        followUps?: FollowUpDto[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Process failed.");
      if (data.followUps?.length) {
        setItems((list) => {
          const byId = new Map(list.map((f) => [f.id, f]));
          for (const hit of data.followUps!) {
            byId.set(hit.id, { ...byId.get(hit.id), ...hit } as FollowUpDto);
          }
          return [...byId.values()];
        });
      }
      setNotice(`Processed: ${data.sent ?? 0} sent, ${data.failed ?? 0} failed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Process failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function retryMessage(id: string) {
    setRetryingId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/follow-ups/${id}/retry`, { method: "POST" });
      const data = (await res.json()) as { followUp?: FollowUpDto; error?: string };
      if (!res.ok || !data.followUp) throw new Error(data.error || "Retry failed.");
      setItems((list) => list.map((f) => (f.id === id ? { ...f, ...data.followUp! } : f)));
      setNotice(
        data.followUp.status === "sent"
          ? "Retry succeeded — email sent."
          : data.followUp.status === "failed"
            ? "Retry failed again."
            : "Retry queued.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetryingId(null);
    }
  }

  function renderMessageCard(msg: FollowUpDto, opts?: { personLabel?: string }) {
    const kind = mailKindOf(msg);
    const retrying = retryingId === msg.id;
    return (
      <article
        key={msg.id}
        className="border-border/70 bg-background/60 space-y-2 rounded-xl border p-3 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
              {kind === "followup" ? "Follow-up (reply)" : "Referral email"}
              {opts?.personLabel ? ` · ${opts.personLabel}` : ""}
            </p>
            <p className="text-foreground truncate text-[13px] font-medium">
              {subjectFromMessage(msg)}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {formatDateTimeReadable(msg.updatedAt || msg.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={statusVariant(msg.status)} className="h-6 text-[11px]">
              {statusLabel(msg.status)}
            </Badge>
            {msg.status === "failed" ? (
              <button
                type="button"
                title={msg.sendError || "Retry send"}
                aria-label="Retry failed send"
                disabled={retrying}
                onClick={() => void retryMessage(msg.id)}
                className="border-border text-foreground hover:bg-muted/60 group relative inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retrying ? (
                  <Spinner className="size-3.5" label="Retrying" />
                ) : (
                  <RetryIcon className="size-3.5" />
                )}
                <span
                  role="tooltip"
                  className="border-border bg-popover text-popover-foreground pointer-events-none absolute right-0 top-[calc(100%+6px)] z-20 w-52 rounded-md border px-2 py-1.5 text-left text-[11px] opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  {msg.sendError || "Retry sending this email"}
                </span>
              </button>
            ) : null}
          </div>
        </div>
        {msg.status === "failed" && msg.sendError ? (
          <p className="text-destructive text-[12px] leading-relaxed">{msg.sendError}</p>
        ) : null}
        <pre className="text-foreground/90 whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
          {bodyFromMessage(msg) || "(empty body)"}
        </pre>
      </article>
    );
  }

  const boardHref = variant === "board" ? "/outreach" : "/outreach/board";

  const noticesBlock = (
    <>
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
    </>
  );

  const toolbar = (
    <Card size="sm" className="flex-row flex-wrap items-center gap-2 p-2">
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search company, person, role…"
        aria-label="Search conversations"
        className="w-full sm:max-w-xs"
      />
      <Select
        value={applicationId || "all"}
        onValueChange={(v) => {
          const id = !v || v === "all" ? "" : v;
          setApplicationId(id);
          setSelectedKey(id ? ALL_FOR_APP_KEY : null);
        }}
      >
        <SelectTrigger
          className="border-border bg-background h-8 w-auto min-w-[10rem] max-w-[16rem] rounded-md border px-2.5 text-[12px]"
          aria-label="Filter by application"
        >
          <SelectValue placeholder="All applications" />
        </SelectTrigger>
        <SelectContent className="z-[240]">
          <SelectItem value="all" className="text-[12px]">
            All applications
          </SelectItem>
          {applications.map((app) => (
            <SelectItem key={app.id} value={app.id} className="text-[12px]">
              {app.companyName} · {app.role}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tabs value={duration} onValueChange={(v) => setDuration(v as DurationFilter)}>
        <TabsList aria-label="Duration">
          <TabsTrigger value="all" className="text-[12px]">
            All time
          </TabsTrigger>
          <TabsTrigger value="24h" className="text-[12px]">
            24h
          </TabsTrigger>
          <TabsTrigger value="7d" className="text-[12px]">
            7d
          </TabsTrigger>
          <TabsTrigger value="30d" className="text-[12px]">
            30d
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
        {applicationId
          ? `${applicationMessages.length} mail · ${threads.length} people`
          : `${threads.length} conversations`}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void processQueue()}
          disabled={processing}
          loading={processing}
          loadingText="Processing…"
        >
          Process due queue
        </Button>
        <Link
          href={variant === "board" ? "/referrals/board" : "/referrals"}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Open referrals
        </Link>
        <BoardToggleLink expanded={variant === "board"} href={boardHref} label="outreach inbox" />
      </div>
    </Card>
  );

  // Two cards with a small gap (conversations | mail); the gap is the resize handle.
  const board = (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:gap-0",
        variant === "board" ? "min-h-0 flex-1" : "md:h-[min(70vh,44rem)]",
      )}
    >
      <Card
        className="flex max-h-[42vh] w-full shrink-0 flex-col gap-0 overflow-hidden p-0 md:max-h-none md:w-[var(--inbox-list-width)] md:max-w-[min(100%,560px)]"
        style={{ ["--inbox-list-width" as string]: `${listWidth}px` }}
      >
        <div className="border-border/60 text-muted-foreground shrink-0 border-b px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide">
          Conversations
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {applicationId && threads.length > 0 ? (
            <li>
              <button
                type="button"
                onClick={() => setSelectedKey(ALL_FOR_APP_KEY)}
                className={cn(
                  "w-full cursor-pointer border-b px-3 py-2.5 text-left transition-colors",
                  viewingAllForApp
                    ? "border-primary/20 bg-primary/10"
                    : "border-border/50 hover:bg-muted/40",
                )}
              >
                <p className="text-foreground truncate text-[13px] font-semibold">
                  All mail for this role
                </p>
                <p className="text-muted-foreground truncate text-[12px]">
                  {selectedApplication
                    ? `${selectedApplication.companyName} · ${selectedApplication.role}`
                    : "Selected application"}
                </p>
                <p className="text-muted-foreground mt-0.5 text-[10px]">
                  {applicationMessages.length} message
                  {applicationMessages.length === 1 ? "" : "s"}
                </p>
              </button>
            </li>
          ) : null}
          {threads.length === 0 ? (
            <li className="text-muted-foreground px-3 py-8 text-center text-[13px]">
              No emails match this search.
            </li>
          ) : (
            threads.map((thread) => {
              const active = !viewingAllForApp && thread.key === selectedKey;
              const last = thread.messages[thread.messages.length - 1];
              return (
                <li key={thread.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(thread.key)}
                    className={cn(
                      "w-full cursor-pointer border-b px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-primary/20 bg-primary/10"
                        : "border-border/50 hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-foreground truncate text-[13px] font-semibold">
                        {thread.personName}
                      </p>
                      {thread.hasFailed ? (
                        <Badge variant="destructive" className="h-5 shrink-0 text-[10px]">
                          Failed
                        </Badge>
                      ) : last ? (
                        <Badge
                          variant={statusVariant(last.status)}
                          className="h-5 shrink-0 text-[10px]"
                        >
                          {statusLabel(last.status)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground truncate text-[12px]">
                      {thread.company}
                      {thread.role ? ` · ${thread.role}` : ""}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[10px]">
                      {thread.messages.length} message
                      {thread.messages.length === 1 ? "" : "s"} ·{" "}
                      {formatDateTimeReadable(thread.latestAt)}
                    </p>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </Card>

      <div className="hidden w-2 shrink-0 justify-center md:flex">
        <ResizeHandle
          aria-label="Resize inbox panes"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
        />
      </div>

      <Card className="flex min-h-[24rem] min-w-0 flex-1 flex-col gap-0 overflow-hidden p-0 md:min-h-0">
        {viewingAllForApp ? (
          <>
            <header className="border-border/60 shrink-0 border-b px-4 py-3">
              <p className="text-foreground text-[15px] font-semibold tracking-tight">
                All mail · {selectedApplication?.companyName}
                {selectedApplication?.role ? ` · ${selectedApplication.role}` : ""}
              </p>
              <p className="text-muted-foreground text-[12px]">
                Every referral and follow-up sent for this application
              </p>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {applicationMessages.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-[13px]">
                  No mail for this application yet.
                </p>
              ) : (
                applicationMessages.map(({ thread, message }) =>
                  renderMessageCard(message, { personLabel: thread.personName }),
                )
              )}
            </div>
          </>
        ) : !selected ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-[13px]">
            Select a conversation to read referral and follow-up mail.
          </div>
        ) : (
          <>
            <header className="border-border/60 shrink-0 border-b px-4 py-3">
              <p className="text-foreground text-[15px] font-semibold tracking-tight">
                {selected.personName}
              </p>
              <p className="text-muted-foreground text-[12px]">
                {selected.company}
                {selected.role ? ` · ${selected.role}` : ""}
                {selected.personEmail ? ` · ${selected.personEmail}` : ""}
              </p>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.map((msg) => renderMessageCard(msg))}
            </div>
          </>
        )}
      </Card>
    </div>
  );

  if (variant === "board") {
    return (
      <FullscreenBoard>
        {noticesBlock}
        {toolbar}
        {board}
      </FullscreenBoard>
    );
  }

  return (
    <ShellWidth className="aavedak-fade-up space-y-4 py-6 sm:py-8">
      <header className="space-y-1">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide">Inbox</p>
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Outreach</h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          Referral and follow-up mail per person and role. Same company, different roles stay
          separate. Follow-ups send as replies in the same Gmail thread. Compose on{" "}
          <Link href="/referrals" className="text-primary cursor-pointer hover:underline">
            Referrals
          </Link>
          .
        </p>
      </header>

      <GmailConnectBanner callbackURL="/outreach" />

      {noticesBlock}
      {toolbar}
      {board}
    </ShellWidth>
  );
}

function RetryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13 8a5 5 0 1 1-1.2-3.3M13 3v3.2H9.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
