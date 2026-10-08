"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import type { ApplicationStatus } from "@/lib/application-status";
import { CompanySelect } from "@/components/company-select";
import { ColdEmailTemplatesPanel } from "@/components/cold-email-templates-panel";
import { GmailConnectBanner } from "@/components/gmail-connect-banner";
import { ShellWidth } from "@/components/shell-width";
import { formatDateTimeReadable } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

export type ApplicationDto = {
  id: string;
  companyName: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  updatedAt: string;
};

type AppReferralTab = "needs" | "sent";

export type PersonDto = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  roleTitle: string | null;
  notes: string | null;
  applicationId: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type TemplateDto = {
  id: string;
  title: string;
  subject: string;
  body: string;
  kind: "outreach" | "cover" | "followup" | "other";
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type FollowUpDto = {
  id: string;
  title: string;
  dueDate: string | null;
  sendAfter: string | null;
  status: "pending" | "done" | "dismissed" | "queued" | "sent" | "sent_stub" | "failed";
  personId: string | null;
  applicationId: string | null;
  notes: string | null;
  mailKind?: "outreach" | "followup" | null;
  createdAt: string;
  updatedAt: string;
};

type ColumnId = "applications" | "template" | "people";
type MailKind = "outreach" | "followup";

const DEFAULT_ORDER: ColumnId[] = ["applications", "template", "people"];
const STORAGE_KEY = "aavedak-referrals-column-order";
const DEFAULT_WIDTHS: Record<ColumnId, number> = {
  applications: 1,
  template: 2,
  people: 1,
};
const FOLLOWUP_COOLDOWN_MS = 60 * 60 * 1000;

const COLUMN_META: Record<ColumnId, { title: string; blurb: string }> = {
  applications: {
    title: "Applications",
    blurb: "Applied jobs · Needs referral stays listed after sends",
  },
  template: { title: "Email", blurb: "Template · From = your Gmail" },
  people: { title: "People", blurb: "Select recipients · one referral per person per job" },
};

function mailKindOf(f: FollowUpDto): MailKind {
  if (f.mailKind === "outreach" || f.mailKind === "followup") return f.mailKind;
  if (f.title.startsWith("Follow-up:")) return "followup";
  return "outreach";
}

function isSuccessfulSend(f: FollowUpDto): boolean {
  return f.status === "sent" || f.status === "sent_stub";
}

function isBlockingOutreach(f: FollowUpDto): boolean {
  return (
    mailKindOf(f) === "outreach" &&
    (isSuccessfulSend(f) || f.status === "queued" || f.status === "pending")
  );
}

function hasSuccessfulReferral(appId: string, followUps: FollowUpDto[]): boolean {
  return followUps.some(
    (f) => f.applicationId === appId && mailKindOf(f) === "outreach" && isSuccessfulSend(f),
  );
}

function formatRelativeAgo(iso: string): string {
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

type ReferralsComposerProps = {
  userEmail: string;
  userName: string;
  isAdmin: boolean;
  initialApplications: ApplicationDto[];
  initialPeople: PersonDto[];
  initialTemplates: TemplateDto[];
  initialFollowUps: FollowUpDto[];
};

function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return vars[key] ?? "";
  });
}

function loadColumnOrder(): ColumnId[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_ORDER;
    const ids = parsed.filter((id): id is ColumnId => DEFAULT_ORDER.includes(id as ColumnId));
    for (const id of DEFAULT_ORDER) {
      if (!ids.includes(id)) ids.push(id);
    }
    return ids.slice(0, 3) as ColumnId[];
  } catch {
    return DEFAULT_ORDER;
  }
}

export function ReferralsComposer({
  userEmail,
  userName,
  isAdmin,
  initialApplications,
  initialPeople,
  initialTemplates,
  initialFollowUps,
}: ReferralsComposerProps) {
  const [applications] = useState(initialApplications);
  const [people, setPeople] = useState(initialPeople);
  const [templates, setTemplates] = useState(initialTemplates);
  const [followUps, setFollowUps] = useState(initialFollowUps);

  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(DEFAULT_ORDER);
  const [dragCol, setDragCol] = useState<ColumnId | null>(null);

  const [appReferralTab, setAppReferralTab] = useState<AppReferralTab>(() => {
    const applied = initialApplications.filter((app) => app.status === "applied");
    const needs = applied.some((app) => !hasSuccessfulReferral(app.id, initialFollowUps));
    return needs ? "needs" : "sent";
  });
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplates.find((t) => t.kind === "outreach")?.id ?? initialTemplates[0]?.id ?? null,
  );
  const [checkedPeople, setCheckedPeople] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeOptions, setResumeOptions] = useState<
    Array<{ id: string; displayName: string; status: string }>
  >([]);
  const [resumePickerOpen, setResumePickerOpen] = useState(false);
  const [countdownVisible, setCountdownVisible] = useState(false);
  const [countdown, setCountdown] = useState(20);
  const [countdownArmed, setCountdownArmed] = useState(false);
  const sendToastIdRef = useRef<string | null>(null);

  const [manageOpen, setManageOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [personDraft, setPersonDraft] = useState({
    name: "",
    email: "",
    company: "",
    roleTitle: "",
  });

  useEffect(() => {
    setColumnOrder(loadColumnOrder());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/resumes");
        const data = (await res.json()) as {
          resumes?: Array<{ id: string; displayName: string; status: string }>;
        };
        if (res.ok) setResumeOptions(data.resumes ?? []);
      } catch {
        /* optional */
      }
    })();
  }, []);

  const sendToastDescription = useCallback(() => {
    const count = checkedPeople.size;
    return `${count} recipient${count === 1 ? "" : "s"}${
      resumeId ? " · resume attached" : ""
    } via Gmail`;
  }, [checkedPeople.size, resumeId]);

  const dismissSendToast = useCallback(() => {
    const id = sendToastIdRef.current;
    // Clear before dismiss so onDismiss does not treat this as a user cancel.
    sendToastIdRef.current = null;
    if (id) toast.dismiss(id);
  }, []);

  const cancelCountdown = useCallback(() => {
    dismissSendToast();
    setCountdownVisible(false);
    setCountdownArmed(false);
    setCountdown(20);
    toast.add({
      title: "Send cancelled",
      description: "Nothing was queued.",
      type: "info",
    });
  }, [dismissSendToast]);

  useEffect(() => {
    if (!countdownVisible || !countdownArmed) return;
    if (countdown <= 0) {
      setCountdownArmed(false);
      dismissSendToast();
      void finalizeQueuedSend();
      return;
    }
    const id = sendToastIdRef.current;
    if (id) {
      toast.update(id, {
        title: `Sending in ${countdown}s`,
        description: sendToastDescription(),
        type: "loading",
        actionProps: {
          children: "Undo",
          onClick: cancelCountdown,
        },
      });
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- countdown tick only
  }, [countdownVisible, countdown, countdownArmed]);

  const appliedApplications = useMemo(
    () => applications.filter((app) => app.status === "applied"),
    [applications],
  );

  /** Needs tab keeps every applied job even after some referrals were sent. */
  const needsReferralApps = appliedApplications;

  const referredApps = useMemo(
    () => appliedApplications.filter((app) => hasSuccessfulReferral(app.id, followUps)),
    [appliedApplications, followUps],
  );

  const visibleApplications = appReferralTab === "needs" ? needsReferralApps : referredApps;

  const openFollowUps = useMemo(
    () =>
      followUps.filter(
        (f) => f.status === "pending" || f.status === "queued" || f.status === "failed",
      ),
    [followUps],
  );

  const selectedApp = useMemo(
    () => appliedApplications.find((a) => a.id === selectedAppId) ?? null,
    [appliedApplications, selectedAppId],
  );

  useEffect(() => {
    if (visibleApplications.some((app) => app.id === selectedAppId)) return;
    setSelectedAppId(visibleApplications[0]?.id ?? null);
  }, [visibleApplications, selectedAppId]);

  const companyPeople = useMemo(() => {
    if (!selectedApp) return [] as PersonDto[];
    const company = selectedApp.companyName.trim().toLowerCase();
    return people.filter((person) => {
      if (person.applicationId === selectedApp.id) return true;
      const personCompany = person.company?.trim().toLowerCase() ?? "";
      return Boolean(company) && personCompany === company;
    });
  }, [people, selectedApp]);

  const appFollowUps = useMemo(() => {
    if (!selectedAppId) return [] as FollowUpDto[];
    return followUps.filter((f) => f.applicationId === selectedAppId);
  }, [followUps, selectedAppId]);

  const peopleForColumn = useMemo(() => {
    if (appReferralTab === "sent") {
      const sentPersonIds = new Set(
        appFollowUps
          .filter((f) => mailKindOf(f) === "outreach" && isSuccessfulSend(f))
          .map((f) => f.personId)
          .filter((id): id is string => Boolean(id)),
      );
      return companyPeople.filter((p) => sentPersonIds.has(p.id));
    }
    return companyPeople;
  }, [appReferralTab, appFollowUps, companyPeople]);

  function personOutreachBlocked(personId: string): boolean {
    return appFollowUps.some((f) => f.personId === personId && isBlockingOutreach(f));
  }

  function personFollowupCooldown(personId: string): { blocked: boolean; lastAt: string | null } {
    const sends = appFollowUps
      .filter((f) => f.personId === personId && isSuccessfulSend(f))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      );
    const last = sends[0];
    if (!last) return { blocked: false, lastAt: null };
    const lastAt = last.updatedAt || last.createdAt;
    const blocked = Date.now() - new Date(lastAt).getTime() < FOLLOWUP_COOLDOWN_MS;
    return { blocked, lastAt };
  }

  function personMailMeta(personId: string) {
    const outreach = appFollowUps
      .filter((f) => f.personId === personId && mailKindOf(f) === "outreach" && isSuccessfulSend(f))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      )[0];
    const followup = appFollowUps
      .filter((f) => f.personId === personId && mailKindOf(f) === "followup" && isSuccessfulSend(f))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      )[0];
    return { outreach, followup };
  }

  const selectablePeople = useMemo(() => {
    if (appReferralTab === "sent") {
      return peopleForColumn.filter(
        (p) => !personFollowupCooldown(p.id).blocked && Boolean(p.email),
      );
    }
    return peopleForColumn.filter((p) => !personOutreachBlocked(p.id) && Boolean(p.email));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers close over appFollowUps
  }, [appReferralTab, peopleForColumn, appFollowUps]);

  useEffect(() => {
    setCheckedPeople((prev) => {
      const allowed = new Set(selectablePeople.map((p) => p.id));
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setConfirmed(false);
  }, [selectedAppId, appReferralTab, selectablePeople]);

  const baseVars = useMemo(
    () => ({
      company: selectedApp?.companyName ?? "",
      role: selectedApp?.role ?? "",
      location: selectedApp?.location ?? "",
      user_name: userName || userEmail.split("@")[0] || "",
      person_name: "",
      person_email: "",
    }),
    [selectedApp, userName, userEmail],
  );

  const outreachTemplates = useMemo(
    () => templates.filter((t) => t.kind === "outreach"),
    [templates],
  );
  const followupTemplates = useMemo(
    () => templates.filter((t) => t.kind === "followup"),
    [templates],
  );
  const activeTemplates = appReferralTab === "sent" ? followupTemplates : outreachTemplates;
  const activeMailKind: MailKind = appReferralTab === "sent" ? "followup" : "outreach";

  useEffect(() => {
    if (activeTemplates.some((t) => t.id === selectedTemplateId)) return;
    setSelectedTemplateId(activeTemplates[0]?.id ?? null);
  }, [activeTemplates, selectedTemplateId]);

  const selectedTemplate = useMemo(
    () => activeTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [activeTemplates, selectedTemplateId],
  );

  const subject = selectedTemplate?.subject?.trim()
    ? selectedTemplate.subject
    : selectedTemplate
      ? activeMailKind === "followup"
        ? "Following up — {{role}} at {{company}}"
        : "Referral ask — {{role}} at {{company}}"
      : "";
  const body = selectedTemplate?.body ?? "";

  const previewSubject = useMemo(() => renderTemplate(subject, baseVars), [subject, baseVars]);
  const previewBody = useMemo(() => renderTemplate(body, baseVars), [body, baseVars]);

  const persistOrder = useCallback((order: ColumnId[]) => {
    setColumnOrder(order);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch {
      /* ignore */
    }
  }, []);

  function onColDragStart(id: ColumnId) {
    setDragCol(id);
  }

  function onColDrop(target: ColumnId) {
    if (!dragCol || dragCol === target) {
      setDragCol(null);
      return;
    }
    const next = [...columnOrder];
    const from = next.indexOf(dragCol);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) {
      setDragCol(null);
      return;
    }
    next.splice(from, 1);
    next.splice(to, 0, dragCol);
    persistOrder(next);
    setDragCol(null);
  }

  function togglePerson(id: string) {
    if (!selectablePeople.some((p) => p.id === id)) return;
    setCheckedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmed(false);
  }

  function toggleSelectAll() {
    const allIds = selectablePeople.map((p) => p.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => checkedPeople.has(id));
    setCheckedPeople(allSelected ? new Set() : new Set(allIds));
    setConfirmed(false);
  }

  async function queueFollowUps() {
    setError(null);
    setNotice(null);
    if (!selectedAppId) {
      setError("Select an application for context.");
      return;
    }
    if (checkedPeople.size === 0) {
      setError("Check at least one recipient.");
      return;
    }
    if (!selectedTemplateId || !selectedTemplate) {
      setError("Select a saved cold-email template first.");
      return;
    }
    if (!confirmed) {
      setError("Confirm recipients before queueing.");
      return;
    }
    dismissSendToast();
    setCountdown(20);
    setCountdownArmed(true);
    setCountdownVisible(true);
    sendToastIdRef.current = toast.add({
      title: "Sending in 20s",
      description: sendToastDescription(),
      type: "loading",
      actionProps: {
        children: "Undo",
        onClick: () => cancelCountdown(),
      },
      onDismiss: () => {
        // × / Escape — only cancel if this toast is still the active countdown.
        if (sendToastIdRef.current) {
          sendToastIdRef.current = null;
          setCountdownVisible(false);
          setCountdownArmed(false);
          setCountdown(20);
          toast.add({
            title: "Send cancelled",
            description: "Nothing was queued.",
            type: "info",
          });
        }
      },
    });
  }

  async function finalizeQueuedSend() {
    if (!selectedAppId) return;
    setPending(true);
    setCountdownVisible(false);
    dismissSendToast();
    try {
      const due = new Date();
      due.setUTCDate(due.getUTCDate() + 3);
      const dueDate = due.toISOString().slice(0, 10);
      const personIds = Array.from(checkedPeople);
      const res = await fetch("/api/referrals/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: selectedAppId,
          personIds,
          subject,
          body,
          dueDate,
          confirmed: true,
          sendAfterSeconds: 0,
          resumeId,
          mailKind: activeMailKind,
        }),
      });
      const data = (await res.json()) as {
        followUps?: FollowUpDto[];
        count?: number;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (data.code === "gmail_not_authorized") {
          throw new Error(data.error || "Authorize Gmail send before queueing.");
        }
        throw new Error(data.error || "Queue failed.");
      }
      const queuedIds = new Set((data.followUps ?? []).map((f) => f.id));
      if (data.followUps?.length) {
        setFollowUps((list) => [...data.followUps!, ...list]);
      }
      const sendRes = await fetch("/api/referrals/process-queue", { method: "POST" });
      const sendData = (await sendRes.json()) as {
        error?: string;
        sent?: number;
        failed?: number;
        code?: string;
      };
      if (!sendRes.ok) {
        if (sendData.code === "gmail_reconnect" || /gmail|authoriz/i.test(sendData.error || "")) {
          throw new Error(
            sendData.error || "Gmail send failed — reconnect Google with send permission.",
          );
        }
        throw new Error(sendData.error || "Could not send queued mail.");
      }
      const sent = sendData.sent ?? 0;
      const failed = sendData.failed ?? 0;
      if (sent > 0 && queuedIds.size > 0) {
        setFollowUps((list) =>
          list.map((f) =>
            queuedIds.has(f.id) ? { ...f, status: "sent" as const, mailKind: activeMailKind } : f,
          ),
        );
      }
      if (sent === 0 && failed > 0) {
        const message = `Gmail could not send ${failed} message${failed === 1 ? "" : "s"}. Check Outreach.`;
        setError(message);
        toast.add({ title: "Send failed", description: message, type: "error" });
      } else {
        const message = `Sent ${sent} via Gmail${failed ? ` · ${failed} failed` : ""}${
          resumeId ? " (resume attached)" : ""
        }.`;
        setNotice(message);
        toast.add({
          title: sent > 0 ? "Email sent" : "Send finished",
          description: message,
          type: failed ? "warning" : "success",
        });
      }
      setCheckedPeople(new Set());
      setConfirmed(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Queue failed.";
      setError(message);
      toast.add({ title: "Send failed", description: message, type: "error" });
    } finally {
      setPending(false);
    }
  }

  async function addPerson() {
    setError(null);
    if (!personDraft.name.trim()) {
      setError("Person name is required.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: personDraft.name,
          email: personDraft.email || null,
          company: personDraft.company || null,
          roleTitle: personDraft.roleTitle || null,
          applicationId: selectedAppId,
        }),
      });
      const data = (await res.json()) as { person?: PersonDto; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not add person.");
      if (data.person) {
        setPeople((list) => [data.person!, ...list]);
        setPersonDraft({ name: "", email: "", company: "", roleTitle: "" });
        setManageOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add person.");
    } finally {
      setPending(false);
    }
  }

  function renderColumn(id: ColumnId) {
    const meta = COLUMN_META[id];
    return (
      <section
        key={id}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onColDrop(id)}
        style={{
          flex: `${DEFAULT_WIDTHS[id]} 1 0%`,
          minWidth: 240,
        }}
        className={cn(
          "border-border/80 bg-card relative flex h-[min(70vh,44rem)] min-w-0 flex-col rounded-xl border shadow-sm",
          dragCol === id && "ring-primary/40 opacity-70 ring-2",
        )}
      >
        <header className="border-border/60 flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-foreground text-[13px] font-semibold tracking-tight">{meta.title}</p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">{meta.blurb}</p>
          </div>
          <button
            type="button"
            draggable
            onDragStart={() => onColDragStart(id)}
            onDragEnd={() => setDragCol(null)}
            className="text-muted-foreground hover:text-foreground inline-flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
            aria-label={`Drag to reorder ${meta.title} column`}
            title="Drag to reorder"
          >
            <GripVerticalIcon className="size-4" />
          </button>
        </header>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-x-hidden p-3",
            id === "template" ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          {id === "applications" ? (
            <Tabs
              value={appReferralTab}
              onValueChange={(value) => setAppReferralTab(value as AppReferralTab)}
              className="gap-2.5"
            >
              <TabsList className="h-auto w-full" variant="default">
                <TabsTrigger
                  value="needs"
                  className="min-w-0 flex-1 cursor-pointer px-1.5 text-[11px]"
                >
                  Needs referral
                  {needsReferralApps.length > 0 ? (
                    <span className="text-muted-foreground tabular-nums">
                      {needsReferralApps.length}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger
                  value="sent"
                  className="min-w-0 flex-1 cursor-pointer px-1.5 text-[11px]"
                >
                  Already sent
                  {referredApps.length > 0 ? (
                    <span className="text-muted-foreground tabular-nums">
                      {referredApps.length}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="needs" className="mt-0 outline-none focus-visible:ring-0">
                <ul className="space-y-1.5">
                  {appliedApplications.length === 0 ? (
                    <li className="text-muted-foreground text-[12px]">
                      No applied jobs yet. Move an application to Applied on the job tracker.
                    </li>
                  ) : (
                    needsReferralApps.map((app) => {
                      const selected = app.id === selectedAppId;
                      const needsBadge = !hasSuccessfulReferral(app.id, followUps);
                      return (
                        <li key={app.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedAppId(app.id)}
                            className={cn(
                              "w-full cursor-pointer rounded-xl border px-2.5 py-2 text-left transition-colors",
                              selected
                                ? "border-primary/40 bg-primary/10"
                                : "border-border/70 bg-muted/30 hover:bg-muted/50",
                            )}
                          >
                            <p className="text-foreground truncate text-[12px] font-medium">
                              {app.companyName}
                            </p>
                            <p className="text-muted-foreground truncate text-[11px]">
                              {app.role} · {app.location}
                            </p>
                            {needsBadge ? (
                              <Badge variant="secondary" className="mt-1 h-5 text-[10px]">
                                Needs referral
                              </Badge>
                            ) : null}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </TabsContent>
              <TabsContent value="sent" className="mt-0 outline-none focus-visible:ring-0">
                <ul className="space-y-1.5">
                  {referredApps.length === 0 ? (
                    <li className="text-muted-foreground text-[12px]">
                      No referral emails sent yet for applied jobs.
                    </li>
                  ) : (
                    referredApps.map((app) => {
                      const selected = app.id === selectedAppId;
                      return (
                        <li key={app.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedAppId(app.id)}
                            className={cn(
                              "w-full cursor-pointer rounded-xl border px-2.5 py-2 text-left transition-colors",
                              selected
                                ? "border-primary/40 bg-primary/10"
                                : "border-border/70 bg-muted/30 hover:bg-muted/50",
                            )}
                          >
                            <p className="text-foreground truncate text-[12px] font-medium">
                              {app.companyName}
                            </p>
                            <p className="text-muted-foreground truncate text-[11px]">
                              {app.role} · {app.location}
                            </p>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </TabsContent>
            </Tabs>
          ) : null}

          {id === "template" ? (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
              <label className="block shrink-0 space-y-1">
                <span className="text-muted-foreground text-[11px] font-medium">From</span>
                <input
                  readOnly
                  value={userEmail}
                  className="border-border bg-muted/40 text-foreground h-8 w-full cursor-not-allowed rounded-lg border px-2.5 text-[12px]"
                />
              </label>
              <div className="shrink-0 space-y-1">
                <span className="text-muted-foreground text-[11px] font-medium">To</span>
                <div className="border-border bg-muted/30 flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5">
                  {checkedPeople.size === 0 ? (
                    <p className="text-muted-foreground text-[11px]">
                      Select people in the People column — emails appear here.
                    </p>
                  ) : (
                    people
                      .filter((p) => checkedPeople.has(p.id))
                      .map((p) => (
                        <Badge
                          key={p.id}
                          variant="secondary"
                          className="h-6 max-w-full truncate px-2 text-[10px] font-medium"
                          title={p.name}
                        >
                          {p.email?.trim() || `${p.name} (no email)`}
                        </Badge>
                      ))
                  )}
                </div>
              </div>
              <div className="shrink-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-[11px] font-medium">
                    {activeMailKind === "followup"
                      ? "Follow-up email template"
                      : "Referral email template"}
                  </span>
                  {activeMailKind === "outreach" ? (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      onClick={() => setTemplatesOpen(true)}
                      className="cursor-pointer text-[11px]"
                    >
                      Manage templates
                    </Button>
                  ) : (
                    <Link
                      href="/documents"
                      className="text-primary cursor-pointer text-[11px] font-medium hover:underline"
                    >
                      Manage on Documents
                    </Link>
                  )}
                </div>
                <Select
                  value={selectedTemplateId ?? undefined}
                  onValueChange={(v) => setSelectedTemplateId(v || null)}
                  disabled={activeTemplates.length === 0}
                >
                  <SelectTrigger className="border-border bg-background text-foreground h-8 w-full cursor-pointer rounded-lg border px-2 text-[12px]">
                    <SelectValue
                      placeholder={
                        activeTemplates.length === 0
                          ? "No saved templates"
                          : "Choose a saved template"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="z-[240]">
                    {activeTemplates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-muted-foreground shrink-0 text-[11px] leading-relaxed">
                {activeTemplates.length === 0
                  ? activeMailKind === "followup"
                    ? "Create a follow-up template on Documents → Follow-up Email."
                    : "Create a referral template via Manage templates / Documents → Referral Email."
                  : "Subject and body come from the selected saved template (read-only here)."}
              </p>
              <div className="border-border/60 bg-muted/30 flex min-h-0 flex-1 flex-col space-y-2.5 rounded-xl border p-2.5">
                <div className="shrink-0">
                  <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                    Subject
                  </p>
                  <p className="text-foreground mt-1 text-[12px] font-medium">
                    {selectedTemplate
                      ? previewSubject || "(empty subject)"
                      : "Select a saved template"}
                  </p>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  <p className="text-muted-foreground shrink-0 text-[10px] font-medium uppercase tracking-wide">
                    Body preview
                  </p>
                  <pre className="text-muted-foreground mt-1 min-h-0 flex-1 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed">
                    {selectedTemplate
                      ? previewBody || "(empty body)"
                      : "Choose a template to preview filled subject and body."}
                  </pre>
                </div>
                <div className="border-border/50 flex shrink-0 flex-wrap items-center gap-2 border-t pt-2.5">
                  <button
                    type="button"
                    onClick={() => setResumePickerOpen(true)}
                    className="border-border bg-background text-foreground hover:bg-muted/60 inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-[12px] font-medium"
                  >
                    {resumeId ? "Change resume" : "Attach resume"}
                  </button>
                  {resumeId ? (
                    <>
                      <span className="text-muted-foreground truncate text-[11px]">
                        {resumeOptions.find((resume) => resume.id === resumeId)?.displayName ||
                          "resume"}
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground cursor-pointer text-[11px] underline"
                        onClick={() => setResumeId(null)}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-[11px]">
                      Optional · pick one uploaded resume
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {id === "people" ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-[11px]">
                  {checkedPeople.size} selected
                  {appReferralTab === "sent" ? " · follow-up" : " · referral"}
                </p>
                <button
                  type="button"
                  onClick={() => setManageOpen(true)}
                  className="text-primary cursor-pointer text-[11px] font-medium hover:underline"
                >
                  Add person
                </button>
              </div>
              {selectedApp && peopleForColumn.length > 0 ? (
                <label
                  className={cn(
                    "border-border/70 bg-muted/20 flex items-center gap-2 rounded-xl border px-2.5 py-2",
                    selectablePeople.length === 0
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer",
                  )}
                >
                  <Checkbox
                    checked={
                      selectablePeople.length > 0 &&
                      selectablePeople.every((p) => checkedPeople.has(p.id))
                    }
                    indeterminate={
                      checkedPeople.size > 0 &&
                      !selectablePeople.every((p) => checkedPeople.has(p.id))
                    }
                    disabled={selectablePeople.length === 0}
                    onChange={() => toggleSelectAll()}
                  />
                  <span className="text-foreground text-[12px] font-medium">Select all</span>
                  <span className="text-muted-foreground text-[11px]">
                    ({selectablePeople.length} available)
                  </span>
                </label>
              ) : null}
              <ul className="space-y-1.5">
                {!selectedApp ? (
                  <li className="text-muted-foreground text-[12px]">
                    Select an application to see people at that company.
                  </li>
                ) : peopleForColumn.length === 0 ? (
                  <li className="text-muted-foreground text-[12px]">
                    {appReferralTab === "sent"
                      ? "No referral emails sent for this job yet."
                      : `No people at ${selectedApp.companyName} yet — add a contact for this company.`}
                  </li>
                ) : (
                  peopleForColumn.map((person) => {
                    const checked = checkedPeople.has(person.id);
                    const outreachBlocked =
                      appReferralTab === "needs" && personOutreachBlocked(person.id);
                    const cooldown =
                      appReferralTab === "sent" ? personFollowupCooldown(person.id) : null;
                    const disabled =
                      outreachBlocked ||
                      Boolean(cooldown?.blocked) ||
                      !person.email ||
                      (appReferralTab === "sent" && !personMailMeta(person.id).outreach);
                    const meta = personMailMeta(person.id);
                    return (
                      <li key={person.id}>
                        <label
                          className={cn(
                            "flex items-start gap-2 rounded-xl border px-2.5 py-2",
                            disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                            checked
                              ? "border-primary/40 bg-primary/10"
                              : "border-border/70 bg-muted/30",
                          )}
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => togglePerson(person.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="text-foreground block truncate text-[12px] font-medium">
                              {person.name}
                            </span>
                            <span className="text-muted-foreground block truncate text-[11px]">
                              {person.email ?? "No email"}
                              {person.company ? ` · ${person.company}` : ""}
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              {appReferralTab === "needs" && outreachBlocked ? (
                                <Badge variant="outline" className="h-5 text-[10px]">
                                  Referral already sent
                                </Badge>
                              ) : null}
                              {appReferralTab === "sent" && meta.outreach ? (
                                <Badge variant="secondary" className="h-5 text-[10px]">
                                  Referral email sent{" "}
                                  {formatRelativeAgo(
                                    meta.outreach.updatedAt || meta.outreach.createdAt,
                                  )}
                                </Badge>
                              ) : null}
                              {appReferralTab === "sent" && meta.followup ? (
                                <Badge variant="outline" className="h-5 text-[10px]">
                                  Last follow-up{" "}
                                  {formatRelativeAgo(
                                    meta.followup.updatedAt || meta.followup.createdAt,
                                  )}
                                </Badge>
                              ) : null}
                              {cooldown?.blocked ? (
                                <Badge variant="outline" className="h-5 text-[10px]">
                                  Wait 1 hour before another follow-up
                                </Badge>
                              ) : null}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <ShellWidth className="aavedak-fade-up space-y-6 py-8 sm:py-10">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
            आवेदक
          </p>
          <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Referrals</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            Compose cold outreach against an application, pick people at that company, confirm, then
            wait 20 seconds on screen before the batch sends from {userEmail} through Gmail.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isAdmin ? (
            <Badge variant="secondary" className="h-7 px-2.5 text-[11px]">
              Admin
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={() => persistOrder(DEFAULT_ORDER)}
            className="border-border bg-card text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
          >
            Reset column order
          </button>
        </div>
      </header>

      <GmailConnectBanner callbackURL="/referrals" />

      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      {notice ? <p className="text-primary text-[13px] font-medium">{notice}</p> : null}

      <div className="flex w-full gap-3 overflow-x-auto pb-1">
        {columnOrder.map((id) => renderColumn(id))}
      </div>

      <section className="border-border/80 bg-card space-y-3 rounded-xl border p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              {activeMailKind === "followup"
                ? "Confirm & send follow-ups"
                : "Confirm & send referral emails"}
            </h2>
            <div className="border-border/70 bg-muted/40 rounded-lg border px-3 py-2">
              <p className="text-foreground text-[12px] font-medium leading-relaxed">
                {activeMailKind === "followup"
                  ? "Queues follow-up emails to people who already got a referral for this job, then shows a 20s countdown before Gmail sends."
                  : "One referral email per person per job. Creates tasks, then shows a 20s countdown before Gmail sends."}
              </p>
              {resumeId ? (
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-relaxed">
                  Resume attached:{" "}
                  <span className="text-foreground font-medium">
                    {resumeOptions.find((resume) => resume.id === resumeId)?.displayName ||
                      "resume"}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-relaxed">
                  Attach a resume in the email preview if you want a PDF on the send.
                </p>
              )}
            </div>
          </div>
          <label className="text-foreground flex shrink-0 cursor-pointer items-center gap-2 text-[12px]">
            <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I
            confirm these {checkedPeople.size} recipient(s)
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {checkedPeople.size === 0 ? (
            <p className="text-muted-foreground text-[12px]">No recipients selected yet.</p>
          ) : (
            people
              .filter((p) => checkedPeople.has(p.id))
              .map((p) => (
                <Badge
                  key={p.id}
                  variant="secondary"
                  className="h-7 max-w-full truncate px-2.5 text-[11px] font-medium"
                >
                  {p.name} | {p.email || "no email"}
                </Badge>
              ))
          )}
        </div>
        <button
          type="button"
          disabled={
            pending ||
            !confirmed ||
            checkedPeople.size === 0 ||
            !selectedAppId ||
            !selectedTemplateId ||
            countdownVisible
          }
          onClick={() => void queueFollowUps()}
          className="aavedak-btn bg-primary text-primary-foreground inline-flex h-9 cursor-pointer items-center rounded-lg px-4 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Sending…"
            : activeMailKind === "followup"
              ? "Queue follow-up (20s)"
              : "Queue referral (20s)"}
        </button>
      </section>

      <section className="border-border/80 bg-card space-y-2 rounded-xl border p-4">
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
          Pending follow-ups
        </h2>
        {openFollowUps.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">None queued yet.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {openFollowUps.slice(0, 12).map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-foreground truncate text-[12px] font-medium">{f.title}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {f.sendAfter
                      ? `Send after ${formatDateTimeReadable(f.sendAfter)}`
                      : f.dueDate
                        ? `Due ${f.dueDate.slice(0, 10)}`
                        : "No schedule"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {f.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={resumePickerOpen}
        onClose={() => setResumePickerOpen(false)}
        title="Attach resume"
        description="Pick one uploaded resume to attach as a PDF. Upload new files on Documents."
        footer={
          <>
            <button
              type="button"
              onClick={() => setResumePickerOpen(false)}
              className="border-border text-muted-foreground inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-[12px]"
            >
              Cancel
            </button>
            {resumeId ? (
              <button
                type="button"
                onClick={() => {
                  setResumeId(null);
                  setResumePickerOpen(false);
                }}
                className="border-border text-foreground inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-[12px]"
              >
                Remove attachment
              </button>
            ) : null}
          </>
        }
      >
        {resumeOptions.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            No resumes uploaded yet — add one on Documents first.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {resumeOptions.map((resume) => {
              const selected = resumeId === resume.id;
              return (
                <li key={resume.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setResumeId(resume.id);
                      setResumePickerOpen(false);
                    }}
                    className={cn(
                      "w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/70 bg-muted/30 hover:bg-muted/50",
                    )}
                  >
                    <p className="text-foreground truncate text-[13px] font-medium">
                      {resume.displayName}
                    </p>
                    <p className="text-muted-foreground text-[11px]">{resume.status}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <Modal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title="Add person"
        description="Contacts stay user-scoped. Use them as outreach recipients."
        footer={
          <>
            <button
              type="button"
              onClick={() => setManageOpen(false)}
              className="border-border text-muted-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void addPerson()}
              className="aavedak-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add"}
            </button>
          </>
        }
      >
        <div className="space-y-2.5">
          <label className="block space-y-1">
            <span className="text-foreground text-[12px] font-medium">Name *</span>
            <input
              value={personDraft.name}
              onChange={(e) => setPersonDraft((d) => ({ ...d, name: e.target.value }))}
              className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-foreground text-[12px] font-medium">Email</span>
            <input
              value={personDraft.email}
              onChange={(e) => setPersonDraft((d) => ({ ...d, email: e.target.value }))}
              className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-foreground text-[12px] font-medium">Company</span>
            <CompanySelect
              value={personDraft.company}
              onChange={(name) => setPersonDraft((d) => ({ ...d, company: name }))}
              placeholder="Select or add company"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-foreground text-[12px] font-medium">Role</span>
            <input
              value={personDraft.roleTitle}
              onChange={(e) => setPersonDraft((d) => ({ ...d, roleTitle: e.target.value }))}
              className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title="Manage templates"
        description="Same editor as Documents → Referral Email. Preview uses a dummy application."
        size="xl"
        footer={
          <button
            type="button"
            onClick={() => setTemplatesOpen(false)}
            className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
          >
            Close
          </button>
        }
      >
        <ColdEmailTemplatesPanel
          lockedKind="outreach"
          listTitle="My referral templates"
          newButtonLabel="New referral template"
          templates={outreachTemplates}
          onTemplatesChange={(next) =>
            setTemplates((prev) => [...prev.filter((t) => t.kind !== "outreach"), ...next])
          }
          fromEmail={userEmail}
          userName={userName}
        />
      </Modal>
    </ShellWidth>
  );
}

function GripVerticalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="9" cy="5" r="1.65" />
      <circle cx="9" cy="12" r="1.65" />
      <circle cx="9" cy="19" r="1.65" />
      <circle cx="15" cy="5" r="1.65" />
      <circle cx="15" cy="12" r="1.65" />
      <circle cx="15" cy="19" r="1.65" />
    </svg>
  );
}
