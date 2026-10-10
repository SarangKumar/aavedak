"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BoardToggleLink, FullscreenBoard } from "@/components/fullscreen-board";
import { GmailConnectBanner, ReplyDetectionBanner } from "@/components/gmail-connect-banner";
import { ShellWidth } from "@/components/shell-width";
import { personInitials } from "@/components/person-vote";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateOnly, formatDateTimeReadable } from "@/lib/format-datetime";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";

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

const IST_OFFSET_MS = 330 * 60_000;

/** "8:26 pm" in India time; computed from the timestamp so server and client agree. */
function timeIst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

/** Day-divider label: Today, Yesterday, or "12 Oct 2026" (India time). */
function dayLabelIst(iso: string): string {
  const label = formatDateOnly(iso, { zone: "ist" });
  const now = new Date().toISOString();
  if (label === formatDateOnly(now, { zone: "ist" })) return "Today";
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  if (label === formatDateOnly(yesterday, { zone: "ist" })) return "Yesterday";
  return label;
}

/** Id prefix for the optimistic bubble shown while a chat message is being queued. */
const PENDING_PREFIX = "pending_";

function messageAt(f: FollowUpDto): string {
  return f.updatedAt || f.createdAt;
}

type TimelineItem =
  | { type: "day"; key: string; label: string }
  | { type: "out"; key: string; msg: FollowUpDto; personLabel?: string }
  | { type: "in"; key: string; reply: MailReplyView };

/**
 * Chat order: every sent mail and reply by time, with a day divider whenever the India-time date
 * changes. Strictly chronological, because mails in one Gmail thread share their replies: reply
 * detection may file a reply under a later mail in the same thread.
 */
function buildTimeline(
  entries: Array<{ msg: FollowUpDto; personLabel?: string }>,
  replies: Record<string, MailReplyView[]>,
): TimelineItem[] {
  const events: Array<{ at: string; item: TimelineItem }> = [];
  const seenReplies = new Set<string>();
  for (const { msg, personLabel } of entries) {
    events.push({ at: messageAt(msg), item: { type: "out", key: msg.id, msg, personLabel } });
    for (const reply of replies[msg.id] ?? []) {
      if (seenReplies.has(reply.id)) continue;
      seenReplies.add(reply.id);
      events.push({ at: reply.receivedAt, item: { type: "in", key: reply.id, reply } });
    }
  }
  // Stable sort: equal times keep insertion order (a mail before its replies).
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const out: TimelineItem[] = [];
  let lastDay = "";
  for (const { at, item } of events) {
    const day = formatDateOnly(at, { zone: "ist" });
    if (day !== lastDay) {
      lastDay = day;
      out.push({ type: "day", key: `day:${day}`, label: dayLabelIst(at) });
    }
    out.push(item);
  }
  return out;
}

type Props = {
  initialFollowUps: FollowUpDto[];
  /** Replies to sent mails, grouped by sent mail id (server-loaded). */
  initialReplies?: Record<string, MailReplyView[]>;
  /** False until the user grants gmail.readonly; shows the authorize prompt. */
  replyDetectionReady?: boolean;
  people: PersonLite[];
  applications: ApplicationLite[];
  /** "board" = full-screen inbox only (/outreach/board). */
  variant?: "page" | "board";
};

type MailReplyView = {
  id: string;
  followUpId: string;
  fromAddress: string;
  subject: string | null;
  bodyText: string;
  receivedAt: string;
};

export function OutreachInbox({
  initialFollowUps,
  initialReplies = {},
  replyDetectionReady = false,
  people,
  applications,
  variant = "page",
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialFollowUps);
  const [replies, setReplies] = useState(initialReplies);
  const [checkingReplies, setCheckingReplies] = useState(false);
  useEffect(() => {
    setReplies(initialReplies);
  }, [initialReplies]);
  const [query, setQuery] = useState("");
  const [applicationId, setApplicationId] = useState<string>("");
  const [duration, setDuration] = useState<DurationFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Phones show one pane at a time, like a messaging app: the list, or the open chat.
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  // Chat box: a custom message (optionally with a resume) sent as a follow-up in the thread.
  const [draft, setDraft] = useState("");
  const [draftResumeId, setDraftResumeId] = useState("");
  const [resumeOptions, setResumeOptions] = useState<Array<{ id: string; displayName: string }>>(
    [],
  );
  const [sendPhase, setSendPhase] = useState<"idle" | "sending">("idle");
  // Resume picker dialog: the radio choice is only applied on Confirm.
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeChoice, setResumeChoice] = useState("");
  // Phones: the application and duration filters live in a bottom sheet.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

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
      for (const m of thread.messages) {
        for (const r of replies[m.id] ?? []) {
          if (new Date(r.receivedAt).getTime() > new Date(thread.latestAt).getTime()) {
            thread.latestAt = r.receivedAt;
          }
        }
      }
      thread.messages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          (mailKindOf(a) === "outreach" ? -1 : 1),
      );
    }
    list.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
    return list;
  }, [applicationId, appsById, duration, items, peopleById, query, replies]);

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

  async function checkReplies() {
    setCheckingReplies(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/outreach/replies/sync", { method: "POST" });
      const data = (await res.json()) as {
        status?: "ok" | "skipped";
        reason?: string;
        newReplies?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not check replies.");
      if (data.status === "skipped") {
        setNotice(data.reason ?? "Reply detection is not available yet.");
      } else if (data.error) {
        setError(data.error);
      } else {
        setNotice(
          data.newReplies
            ? `${data.newReplies} new repl${data.newReplies === 1 ? "y" : "ies"}.`
            : "No new replies.",
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check replies.");
    } finally {
      setCheckingReplies(false);
    }
  }

  // Chat box ------------------------------------------------------------------------------

  // Resumes for the attach picker, loaded once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/resumes");
        const data = (await res.json()) as {
          resumes?: Array<{ id: string; displayName: string; status: string }>;
        };
        if (!cancelled && res.ok) {
          setResumeOptions((data.resumes ?? []).filter((r) => r.status !== "archived"));
        }
      } catch {
        // The picker just stays empty; sending without a resume still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function mergeFollowUps(rows: FollowUpDto[] | undefined) {
    if (!rows?.length) return;
    setItems((list) => {
      const byId = new Map(list.map((f) => [f.id, f]));
      for (const row of rows) byId.set(row.id, { ...byId.get(row.id), ...row } as FollowUpDto);
      return [...byId.values()];
    });
  }

  /** A chat message is sent as soon as the user presses Send: that press is the confirmation. */
  function startSend(thread: Thread) {
    const text = draft.trim();
    if (!text || sendPhase !== "idle" || !thread.applicationId || !thread.personId) return;
    void deliver(thread, text);
  }

  async function deliver(thread: Thread, text: string) {
    setSendPhase("sending");
    // Show the message in the chat straight away; swapped for the saved mail once queued.
    const now = new Date().toISOString();
    const pendingId = `${PENDING_PREFIX}${now}`;
    setItems((list) => [
      ...list,
      {
        id: pendingId,
        title: `Follow-up: ${thread.personName}`,
        dueDate: null,
        sendAfter: null,
        status: "queued",
        personId: thread.personId,
        applicationId: thread.applicationId,
        notes: null,
        mailKind: "followup",
        mailTo: thread.personEmail,
        mailBody: text,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setDraft("");
    const removePending = () => setItems((list) => list.filter((f) => f.id !== pendingId));
    let queued = false;
    try {
      const res = await fetch("/api/referrals/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: thread.applicationId,
          personIds: [thread.personId],
          subject: "",
          body: text,
          confirmed: true,
          sendAfterSeconds: 0,
          resumeId: draftResumeId || null,
          // A follow-up goes out as a reply in the same Gmail thread; as a chat reply it is
          // exempt from the follow-up cooldown.
          mailKind: "followup",
          chatReply: true,
        }),
      });
      const data = (await res.json()) as { followUps?: FollowUpDto[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not queue the message.");
      }
      queued = true;
      removePending();
      mergeFollowUps(data.followUps);
      setDraftResumeId("");

      const sendRes = await fetch("/api/referrals/process-queue", { method: "POST" });
      const sendData = (await sendRes.json()) as {
        sent?: number;
        failed?: number;
        followUps?: FollowUpDto[];
        error?: string;
      };
      if (!sendRes.ok) throw new Error(sendData.error || "Could not send the queued message.");
      mergeFollowUps(sendData.followUps);
      if ((sendData.failed ?? 0) > 0 && !(sendData.sent ?? 0)) {
        toast.add({
          title: "Send failed",
          description: "Gmail could not send it. Use Retry on the message.",
          type: "error",
        });
      } else {
        toast.add({ title: "Message sent", description: thread.personName, type: "success" });
      }
    } catch (err) {
      if (!queued) {
        // Nothing was queued (error or network failure): drop the bubble and give the text
        // back to edit or resend. Once queued, the saved mail stays and shows Retry if it failed.
        removePending();
        setDraft(text);
      }
      toast.add({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Could not send the message.",
        type: "error",
      });
    } finally {
      setSendPhase("idle");
    }
  }

  /** Why the chat box is unavailable for this thread, or null when a message can be sent. */
  function composeBlocker(thread: Thread): string | null {
    if (!thread.applicationId || !thread.personId) return "This conversation has no application.";
    if (!thread.personEmail) return `${thread.personName} has no email address.`;
    const outreachSent = thread.messages.some(
      (m) => mailKindOf(m) === "outreach" && (m.status === "sent" || m.status === "sent_stub"),
    );
    if (!outreachSent) return "Send the referral email from Referrals first.";
    return null;
  }

  // Chat view ------------------------------------------------------------------------------

  /** Our referral / follow-up mail: right-hand bubble with a delivery tick or cross. */
  function renderOutgoing(msg: FollowUpDto, personLabel?: string) {
    const kind = mailKindOf(msg);
    const retrying = retryingId === msg.id;
    const delivered = msg.status === "sent" || msg.status === "sent_stub" || msg.status === "done";
    const failed = msg.status === "failed";
    const at = messageAt(msg);
    return (
      <div className="flex justify-end pl-8 sm:pl-16">
        <div className="bg-primary text-primary-foreground relative max-w-full space-y-1 rounded-xl rounded-tr-sm px-3 py-2 shadow-sm sm:max-w-[80%]">
          <p className="text-primary-foreground/70 text-[10px] font-medium uppercase tracking-wide">
            {kind === "followup" ? "Follow-up" : "Referral"}
            {personLabel ? ` · ${personLabel}` : ""}
          </p>
          {kind === "outreach" ? (
            <p className="text-[12px] font-semibold">{subjectFromMessage(msg)}</p>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
            {bodyFromMessage(msg) || "(empty body)"}
          </p>
          {failed && msg.sendError ? (
            <p className="text-[11px] font-medium leading-snug">⚠ {msg.sendError}</p>
          ) : null}
          <div className="text-primary-foreground/70 flex items-center justify-end gap-1 text-[10px]">
            <time dateTime={at} title={formatDateTimeReadable(at)}>
              {timeIst(at)}
            </time>
            {delivered ? (
              <span
                role="img"
                aria-label="Sent"
                title={statusLabel(msg.status)}
                className="text-primary-foreground"
              >
                <TickIcon className="size-3.5" />
              </span>
            ) : failed ? (
              <span
                role="img"
                aria-label="Failed"
                title={msg.sendError || "Failed"}
                className="text-destructive"
              >
                <CrossIcon className="size-3.5" />
              </span>
            ) : (
              <span>
                {msg.id.startsWith(PENDING_PREFIX) ? "Sending…" : statusLabel(msg.status)}
              </span>
            )}
            {failed ? (
              <Button
                variant="outline"
                size="icon-xs"
                title={msg.sendError || "Retry send"}
                aria-label="Retry failed send"
                loading={retrying}
                loadingText=""
                onClick={() => void retryMessage(msg.id)}
              >
                <RetryIcon className="size-3" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  /** A reply from the person: left-hand bubble. */
  function renderIncoming(reply: MailReplyView) {
    return (
      <div className="flex justify-start pr-8 sm:pr-16">
        <div className="bg-muted text-foreground max-w-full space-y-1 rounded-xl rounded-tl-sm px-3 py-2 shadow-sm sm:max-w-[80%]">
          <p className="text-muted-foreground text-[11px] font-medium">
            {reply.fromAddress || "Reply"}
          </p>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
            {reply.bodyText || "(reply has no text)"}
          </p>
          <p className="text-muted-foreground text-right text-[10px]">
            <time dateTime={reply.receivedAt} title={formatDateTimeReadable(reply.receivedAt)}>
              {timeIst(reply.receivedAt)}
            </time>
          </p>
        </div>
      </div>
    );
  }

  function renderTimeline(items: TimelineItem[]) {
    return (
      <div className="flex flex-col gap-2 px-3 py-4 sm:px-6">
        {items.map((item) =>
          item.type === "day" ? (
            <Marker
              key={item.key}
              variant="separator"
              role="separator"
              aria-label={item.label}
              className="before:bg-border/70 after:bg-border/70 py-1.5 text-[11px]"
            >
              <MarkerContent className="bg-card/90 border-border/60 rounded-md border px-2.5 py-0.5 shadow-sm">
                {item.label}
              </MarkerContent>
            </Marker>
          ) : item.type === "out" ? (
            <div key={item.key}>{renderOutgoing(item.msg, item.personLabel)}</div>
          ) : (
            <div key={item.key}>{renderIncoming(item.reply)}</div>
          ),
        )}
      </div>
    );
  }

  // Icon-only, so the spinner replaces the icon (no loading text; it would overflow the square).
  const refreshLabel = replyDetectionReady
    ? "Check for replies now"
    : "Authorize reply detection first";
  const refreshButton = (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      loading={checkingReplies}
      loadingText=""
      disabled={!replyDetectionReady}
      aria-label={refreshLabel}
      onClick={() => void checkReplies()}
    >
      <RetryIcon className="size-3.5" />
    </Button>
  );
  const refreshControl = (
    <Tooltip content={refreshLabel} className="z-70 text-[12px]">
      {refreshButton}
    </Tooltip>
  );

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

  const applicationFilter = (
    <Select
      value={applicationId || "all"}
      onValueChange={(v) => {
        const id = !v || v === "all" ? "" : v;
        setApplicationId(id);
        setSelectedKey(id ? ALL_FOR_APP_KEY : null);
      }}
    >
      <SelectTrigger
        className={cn(
          "h-8 rounded-md border px-2.5 text-[12px]",
          isDesktop ? "w-auto min-w-40 max-w-[16rem]" : "w-full",
        )}
        aria-label="Filter by application"
      >
        <SelectValue placeholder="All applications" />
      </SelectTrigger>
      <SelectContent className="z-240">
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
  );

  const durationFilter = (
    <ToggleGroup
      aria-label="Duration"
      variant="outline"
      size="sm"
      value={[duration]}
      onValueChange={(next) => {
        // Single selection: the chosen duration stays on until another one is picked.
        const value = next[0] as DurationFilter | undefined;
        if (value) setDuration(value);
      }}
    >
      <ToggleGroupItem value="all" className="h-7 px-2.5 text-[12px]">
        All time
      </ToggleGroupItem>
      <ToggleGroupItem value="24h" className="h-7 px-2.5 text-[12px]">
        24h
      </ToggleGroupItem>
      <ToggleGroupItem value="7d" className="h-7 px-2.5 text-[12px]">
        7d
      </ToggleGroupItem>
      <ToggleGroupItem value="30d" className="h-7 px-2.5 text-[12px]">
        30d
      </ToggleGroupItem>
    </ToggleGroup>
  );

  const activeFilterCount = (applicationId ? 1 : 0) + (duration !== "all" ? 1 : 0);

  const filterButton = (
    <Tooltip
      content={activeFilterCount ? `Filters (${activeFilterCount} active)` : "Filters"}
      className="z-70 text-[12px]"
    >
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="relative"
        aria-label={activeFilterCount ? `Filters, ${activeFilterCount} active` : "Filters"}
        onClick={() => setFiltersOpen(true)}
      >
        <FilterIcon className="size-3.5" />
        {activeFilterCount ? (
          <span className="bg-primary text-primary-foreground absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full text-[9px] font-semibold tabular-nums">
            {activeFilterCount}
          </span>
        ) : null}
      </Button>
    </Tooltip>
  );

  const processLabel = "Process due queue: send mail whose send time has passed";
  const toolbarActions = (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      {isDesktop ? (
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
      ) : (
        // Phones: icon-only so search, actions and filters fit on one row.
        <Tooltip content={processLabel} className="z-70 text-[12px]">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => void processQueue()}
            disabled={processing}
            loading={processing}
            loadingText=""
            aria-label={processLabel}
          >
            <QueueIcon className="size-3.5" />
          </Button>
        </Tooltip>
      )}
      {refreshControl}
      {isDesktop ? null : filterButton}
      {/* On the full-screen board the collapse control sits in the top bar instead. */}
      {variant === "page" ? (
        <BoardToggleLink expanded={false} href={boardHref} label="outreach inbox" showOnMobile />
      ) : null}
    </div>
  );

  const toolbar = isDesktop ? (
    <Card size="sm" className="flex-row flex-wrap items-center gap-2 p-2">
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search company, person, role…"
        aria-label="Search conversations"
        className="w-full sm:max-w-xs"
      />
      {applicationFilter}
      {durationFilter}
      {toolbarActions}
    </Card>
  ) : (
    // Phones: one row — search (stretches), then process queue, refresh, filters, expand icons.
    // The filters open in a bottom sheet.
    <Card size="sm" className="gap-2 p-2">
      <div className="flex items-center gap-1.5">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Search conversations"
          className="min-w-0 flex-1"
        />
        {toolbarActions}
      </div>
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="gap-4 rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow the conversation list.</SheetDescription>
          </SheetHeader>
          <div className="space-y-1.5">
            <p className="text-foreground text-[12px] font-medium">Application</p>
            {applicationFilter}
          </div>
          <div className="space-y-1.5">
            <p className="text-foreground text-[12px] font-medium">Last activity</p>
            {durationFilter}
          </div>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={activeFilterCount === 0}
              onClick={() => {
                setApplicationId("");
                setDuration("all");
                setSelectedKey(null);
              }}
            >
              Reset
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );

  function openThread(key: string) {
    setSelectedKey(key);
    setMobileChatOpen(true);
  }

  /** Last thing that happened in a thread, for the card preview. */
  function threadPreview(thread: Thread): { text: string; fromThem: boolean } {
    let best: { at: number; text: string; fromThem: boolean } | null = null;
    for (const m of thread.messages) {
      const t = new Date(messageAt(m)).getTime();
      if (!best || t >= best.at) best = { at: t, text: bodyFromMessage(m), fromThem: false };
      for (const r of replies[m.id] ?? []) {
        const rt = new Date(r.receivedAt).getTime();
        if (rt >= best.at) best = { at: rt, text: r.bodyText, fromThem: true };
      }
    }
    return {
      text: best?.text.replace(/\s+/g, " ").trim() || "",
      fromThem: best?.fromThem ?? false,
    };
  }

  const cardClass = (active: boolean) =>
    cn(
      "bg-card flex w-full cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-3 text-left shadow-sm transition-colors",
      active
        ? "border-primary/40 bg-primary/10"
        : "border-border/80 hover:border-border hover:bg-accent/40",
    );

  const listPane = (
    <>
      <div className="border-border/60 text-muted-foreground shrink-0 border-b px-3 py-2.5 text-[11px] font-medium uppercase tabular-nums tracking-wide">
        {applicationId
          ? `${applicationMessages.length} mail · ${threads.length} people`
          : `${threads.length} conversations`}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-2 p-2">
          {applicationId && threads.length > 0 ? (
            <li>
              <button
                type="button"
                onClick={() => openThread(ALL_FOR_APP_KEY)}
                className={cardClass(viewingAllForApp)}
              >
                <Avatar className="mt-0.5 size-8 rounded-md">
                  <AvatarFallback className="rounded-md text-[10px] font-semibold">
                    All
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-[13px] font-semibold">
                    All mail for this role
                  </p>
                  <p className="text-muted-foreground truncate text-[12px]">
                    {selectedApplication
                      ? `${selectedApplication.companyName} · ${selectedApplication.role}`
                      : "Selected application"}
                  </p>
                  <p className="text-muted-foreground mt-1.5 text-[10px]">
                    {applicationMessages.length} message
                    {applicationMessages.length === 1 ? "" : "s"}
                  </p>
                </div>
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
              const replyCount = thread.messages.reduce(
                (n, m) => n + (replies[m.id]?.length ?? 0),
                0,
              );
              const preview = threadPreview(thread);
              return (
                <li key={thread.key}>
                  <button
                    type="button"
                    onClick={() => openThread(thread.key)}
                    className={cardClass(active)}
                  >
                    <Avatar className="mt-0.5 size-8 rounded-md">
                      <AvatarFallback className="rounded-md text-[10px] font-semibold">
                        {personInitials(thread.personName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-foreground truncate text-[13px] font-semibold">
                          {thread.personName}
                        </p>
                        <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                          {dayLabelIst(thread.latestAt) === "Today"
                            ? timeIst(thread.latestAt)
                            : dayLabelIst(thread.latestAt)}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate text-[12px]">
                        {thread.company}
                        {thread.role ? ` · ${thread.role}` : ""}
                      </p>
                      {preview.text ? (
                        <p className="text-muted-foreground mt-1 line-clamp-1 text-[12px]">
                          <span className="text-foreground/70">
                            {preview.fromThem ? `${thread.personName.split(" ")[0]}: ` : "You: "}
                          </span>
                          {preview.text}
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {thread.hasFailed ? (
                          <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                            Failed
                          </Badge>
                        ) : last ? (
                          <Badge
                            variant={statusVariant(last.status)}
                            className="px-1.5 py-0 text-[10px]"
                          >
                            {statusLabel(last.status)}
                          </Badge>
                        ) : null}
                        {replyCount > 0 ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            Replied
                          </Badge>
                        ) : null}
                        <span className="text-muted-foreground text-[10px]">
                          {thread.messages.length} sent
                          {replyCount
                            ? ` · ${replyCount} repl${replyCount === 1 ? "y" : "ies"}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </ScrollArea>
    </>
  );

  const timeline = useMemo(() => {
    if (viewingAllForApp) {
      return buildTimeline(
        applicationMessages.map(({ thread, message }) => ({
          msg: message,
          personLabel: thread.personName,
        })),
        replies,
      );
    }
    return selected
      ? buildTimeline(
          selected.messages.map((msg) => ({ msg })),
          replies,
        )
      : [];
  }, [applicationMessages, replies, selected, viewingAllForApp]);

  // Open at the newest message, like a messaging app.
  useEffect(() => {
    // The ref is on the wallpaper wrapper; the scrolling element is the ScrollArea inside it.
    const el = chatScrollRef.current?.querySelector<HTMLElement>("[data-scroll-area]");
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline, selectedKey, mobileChatOpen, isDesktop]);

  const backButton = isDesktop ? null : (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Back to conversations"
      title="Back"
      onClick={() => setMobileChatOpen(false)}
      className="-ml-1 shrink-0"
    >
      <BackIcon className="size-4" />
    </Button>
  );

  const attachedResume = resumeOptions.find((r) => r.id === draftResumeId) ?? null;

  const resumeDialog = (
    <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach a resume</DialogTitle>
          <DialogDescription>
            The PDF is attached to this message when you press Send.
          </DialogDescription>
        </DialogHeader>
        {resumeOptions.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            No resumes yet. Upload one on the{" "}
            <Link href="/documents" className="text-primary hover:underline">
              Documents
            </Link>{" "}
            page.
          </p>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <RadioGroup
              aria-label="Resume to attach"
              value={resumeChoice || "none"}
              onValueChange={(v) => setResumeChoice(v === "none" ? "" : v)}
              className="gap-1.5"
            >
              {[{ id: "none", displayName: "No resume" }, ...resumeOptions].map((r) => (
                <label
                  key={r.id}
                  htmlFor={`attach-resume-${r.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-[13px] transition-colors",
                    (resumeChoice || "none") === r.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-border/80 hover:bg-accent/40",
                  )}
                >
                  <RadioGroupItem id={`attach-resume-${r.id}`} value={r.id} />
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      r.id === "none" ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {r.displayName}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </ScrollArea>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setResumeDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              setDraftResumeId(resumeChoice);
              setResumeDialogOpen(false);
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const blocker = selected && !viewingAllForApp ? composeBlocker(selected) : null;
  const composer =
    selected && !viewingAllForApp ? (
      <div className="border-border/60 bg-card/95 shrink-0 border-t p-2 sm:p-3">
        {blocker ? (
          <p className="text-muted-foreground px-1 py-1.5 text-center text-[12px]">{blocker}</p>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startSend(selected);
            }}
          >
            <div className="bg-input border-border focus-within:border-ring/70 flex min-w-0 flex-1 flex-col rounded-xl border transition-colors">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Email bodies are multi-line, so Enter adds a line; ⌘/Ctrl+Enter sends.
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    startSend(selected);
                  }
                }}
                rows={1}
                maxRows={6}
                maxLength={5000}
                disabled={sendPhase !== "idle"}
                placeholder={`Message ${selected.personName.split(" ")[0]}…`}
                aria-label={`Message to ${selected.personName}`}
                className="min-h-10 resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] shadow-none outline-none focus:border-0 focus:outline-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {attachedResume ? (
                <div className="flex px-2 pb-1.5">
                  <span className="bg-muted text-foreground inline-flex max-w-full items-center gap-1.5 rounded-md py-0.5 pl-2 pr-0.5 text-[11px]">
                    <PaperclipIcon className="text-muted-foreground size-3 shrink-0" />
                    <span className="truncate">{attachedResume.displayName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="size-5"
                      aria-label="Remove attached resume"
                      title="Remove"
                      disabled={sendPhase !== "idle"}
                      onClick={() => setDraftResumeId("")}
                    >
                      <CrossIcon className="size-3" />
                    </Button>
                  </span>
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0 rounded-full"
              aria-label={attachedResume ? "Change attached resume" : "Attach a resume"}
              title={attachedResume ? "Change resume" : "Attach a resume"}
              disabled={sendPhase !== "idle"}
              onClick={() => {
                setResumeChoice(draftResumeId);
                setResumeDialogOpen(true);
              }}
            >
              <PaperclipIcon className="size-4" />
            </Button>
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0 rounded-full"
              disabled={!draft.trim() || sendPhase !== "idle"}
              loading={sendPhase === "sending"}
              loadingText=""
              aria-label="Send message"
              title="Send now"
            >
              <SendIcon className="size-4" />
            </Button>
          </form>
        )}
      </div>
    ) : null;

  const chatHeader = viewingAllForApp ? (
    <header className="border-border/60 bg-card/95 flex shrink-0 items-center gap-2.5 border-b px-3 py-2.5">
      {backButton}
      <Avatar className="size-9 rounded-md">
        <AvatarFallback className="rounded-md text-[10px] font-semibold">All</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-foreground truncate text-[14px] font-semibold tracking-tight">
          All mail · {selectedApplication?.companyName}
          {selectedApplication?.role ? ` · ${selectedApplication.role}` : ""}
        </p>
        <p className="text-muted-foreground truncate text-[11px]">
          Every referral and follow-up sent for this application
        </p>
      </div>
    </header>
  ) : selected ? (
    <header className="border-border/60 bg-card/95 flex shrink-0 items-center gap-2.5 border-b px-3 py-2.5">
      {backButton}
      <Avatar className="size-9 rounded-full">
        <AvatarFallback className="rounded-full text-[11px] font-semibold">
          {personInitials(selected.personName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-foreground truncate text-[14px] font-semibold tracking-tight">
          {selected.personName}
        </p>
        <p className="text-muted-foreground truncate text-[11px]">
          {selected.company}
          {selected.role ? ` · ${selected.role}` : ""}
          {selected.personEmail ? ` · ${selected.personEmail}` : ""}
        </p>
      </div>
    </header>
  ) : null;

  const mailPane = !chatHeader ? (
    <div className="aavedak-chat-wallpaper text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-[13px]">
      <span className="bg-card/90 border-border/60 rounded-lg border px-3 py-2 shadow-sm">
        Select a conversation to read referral and follow-up mail.
      </span>
    </div>
  ) : (
    <>
      {chatHeader}
      {/* The wallpaper sits on this non-scrolling wrapper so it stays put while messages scroll. */}
      <div ref={chatScrollRef} className="aavedak-chat-wallpaper flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1" aria-label="Messages">
          {timeline.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-[13px]">No mail here yet.</p>
          ) : (
            renderTimeline(timeline)
          )}
        </ScrollArea>
      </div>
      {composer}
      {resumeDialog}
    </>
  );

  // Desktop: conversations | chat, resizable. Phones: one pane at a time with a back button.
  const board = isDesktop ? (
    // The library sets height:100% inline, so the fixed height has to sit on this wrapper.
    <div className={cn("flex", variant === "board" ? "min-h-0 flex-1" : "md:h-[min(75vh,48rem)]")}>
      <ResizablePanelGroup variant="blocks" orientation="horizontal" className="h-full w-full">
        <ResizablePanel
          id="inbox-list"
          // Section colour: conversation cards (bg-card) sit on the muted list.
          className="bg-muted"
          defaultSize={`${LIST_DEFAULT}px`}
          minSize={`${LIST_MIN}px`}
          maxSize={`${LIST_MAX}px`}
          groupResizeBehavior="preserve-pixel-size"
        >
          <div className="flex h-full min-h-0 flex-col">{listPane}</div>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize inbox panes" />
        <ResizablePanel id="inbox-mail">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">{mailPane}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ) : mobileChatOpen && chatHeader ? (
    <Card
      className={cn(
        "flex min-w-0 flex-col gap-0 overflow-hidden p-0",
        variant === "board" ? "min-h-0 flex-1" : "h-[calc(100dvh-8rem)] min-h-[26rem]",
      )}
    >
      {mailPane}
    </Card>
  ) : (
    <Card
      className={cn(
        "bg-muted flex w-full flex-col gap-0 overflow-hidden p-0",
        variant === "board" ? "min-h-0 flex-1" : "max-h-[calc(100dvh-8rem)] min-h-[20rem]",
      )}
    >
      {listPane}
    </Card>
  );

  if (variant === "board") {
    // Full screen, like a messaging app: a slim top bar with the collapse control always at the
    // top right. On phones an open chat takes the whole screen below it (back returns to the list).
    const chatFillsScreen = !isDesktop && mobileChatOpen && Boolean(chatHeader);
    return (
      <FullscreenBoard>
        <header className="flex shrink-0 items-center justify-between gap-2">
          <p className="aavedak-display text-foreground text-lg">Outreach</p>
          <BoardToggleLink expanded href={boardHref} label="outreach inbox" showOnMobile />
        </header>
        {noticesBlock}
        {chatFillsScreen ? null : toolbar}
        {board}
      </FullscreenBoard>
    );
  }

  return (
    <ShellWidth className="aavedak-fade-up space-y-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide">Inbox</p>
          <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Outreach</h1>
        </div>
      </header>
      <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
        Referral and follow-up mail per person and role. Same company, different roles stay
        separate. Follow-ups send as replies in the same Gmail thread. Compose on{" "}
        <Link href="/referrals" className="text-primary cursor-pointer hover:underline">
          Referrals
        </Link>
        .
      </p>

      <GmailConnectBanner callbackURL="/outreach" />
      <ReplyDetectionBanner readReady={replyDetectionReady} callbackURL="/outreach" />

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

function TickIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrossIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 5h18M6 12h12M10 19h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function QueueIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h10M4 12h7M4 18h5M15 15l3 3 4-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
