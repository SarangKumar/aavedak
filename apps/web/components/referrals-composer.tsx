"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DragDrop,
  DragDropHandle,
  DragDropItem,
  DragDropList,
  type DragDropItems,
} from "@/components/ui/drag-and-drop";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import type { ApplicationStatus } from "@/lib/application-status";
import { CompanySelect } from "@/components/company-select";
import { ColdEmailTemplatesPanel } from "@/components/cold-email-templates-panel";
import { BoardToggleLink, FullscreenBoard } from "@/components/fullscreen-board";
import { JOB_CARD_BADGE, JobCardContent, jobCardClassName } from "@/components/job-card";
import { GmailConnectBanner } from "@/components/gmail-connect-banner";
import { ShellWidth } from "@/components/shell-width";
import { formatDateTimeReadable } from "@/lib/format-datetime";
import { STATUS_LABELS } from "@/lib/application-status";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ApplicationDto = {
  id: string;
  companyName: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  /** Set when the application was created from a job on the Jobs page. */
  jobId?: string | null;
  /**
   * A Jobs-page job with no application yet (id = `job:<jobId>`). Picking it and sending
   * creates a Bookmarked application first, because referral mail attaches to an application.
   */
  jobOnly?: boolean;
  updatedAt: string;
};

export type DiscoverJobLite = { id: string; title: string; company: string; location: string };

/** Filter keys for the status toggles: real statuses plus jobs not applied to yet. */
type StatusKey = ApplicationStatus | "not_applied";

const STATUS_FILTERS: Array<{ value: StatusKey; label: string }> = [
  { value: "not_applied", label: "Not applied" },
  { value: "bookmarked", label: "Bookmarked" },
  { value: "preparing", label: "Preparing" },
  { value: "applied", label: "Applied" },
  { value: "under_review", label: "Under review" },
  { value: "assessment", label: "Assessment" },
  { value: "interview", label: "Interview" },
  { value: "ghosted", label: "Ghosted" },
];

const statusKeyOf = (app: ApplicationDto): StatusKey => (app.jobOnly ? "not_applied" : app.status);

/** Statuses where asking for a referral can still help (everything still open). */
const REFERRAL_ACTIVE_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "bookmarked",
  "preparing",
  "applied",
  "under_review",
  "assessment",
  "interview",
  "ghosted",
]);

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
    title: "Active applications",
    blurb: "Open applications from your tracker and Jobs",
  },
  template: { title: "Email", blurb: "Template · From = your Gmail" },
  people: {
    title: "People",
    blurb: "Select recipients · confirm & send below",
  },
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
  /** "board" = full-screen columns only (/referrals/board). */
  variant?: "page" | "board";
  userEmail: string;
  userName: string;
  /** Kept for the page contract; no admin-only UI on this page now. */
  isAdmin?: boolean;
  initialApplications: ApplicationDto[];
  /** Jobs-page jobs (recommended or added) the user hasn't applied to or bookmarked yet. */
  initialDiscoverJobs?: DiscoverJobLite[];
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
  variant = "page",
  userEmail,
  userName,
  initialApplications,
  initialDiscoverJobs = [],
  initialPeople,
  initialTemplates,
  initialFollowUps,
}: ReferralsComposerProps) {
  const [applications, setApplications] = useState<ApplicationDto[]>(() => [
    ...initialApplications,
    ...initialDiscoverJobs.map((job): ApplicationDto => ({
      id: `job:${job.id}`,
      companyName: job.company,
      role: job.title,
      location: job.location,
      status: "bookmarked",
      jobId: job.id,
      jobOnly: true,
      updatedAt: "",
    })),
  ]);
  const [listQuery, setListQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(() => new Set());
  const [people, setPeople] = useState(initialPeople);
  const [templates, setTemplates] = useState(initialTemplates);
  const [followUps, setFollowUps] = useState(initialFollowUps);

  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(DEFAULT_ORDER);

  const [appReferralTab, setAppReferralTab] = useState<AppReferralTab>(() => {
    const applied = initialApplications.filter((app) => REFERRAL_ACTIVE_STATUSES.has(app.status));
    const needs = applied.some((app) => !hasSuccessfulReferral(app.id, initialFollowUps));
    return needs ? "needs" : "sent";
  });
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplates.find((t) => t.kind === "outreach")?.id ?? initialTemplates[0]?.id ?? null,
  );
  const [checkedPeople, setCheckedPeople] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  // Which action is running, so only the pressed button shows a spinner.
  const [pendingAction, setPendingAction] = useState<"queue" | "addPerson" | null>(null);
  const pending = pendingAction !== null;
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

  /** Every open application (tracker + Jobs page), not just status "applied". */
  const appliedApplications = useMemo(
    () => applications.filter((app) => REFERRAL_ACTIVE_STATUSES.has(app.status)),
    [applications],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<StatusKey, number>();
    for (const app of appliedApplications) {
      counts.set(statusKeyOf(app), (counts.get(statusKeyOf(app)) ?? 0) + 1);
    }
    return counts;
  }, [appliedApplications]);

  /** Search + status toggles (an empty toggle selection means all statuses). */
  const filteredApplications = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return appliedApplications.filter((app) => {
      if (statusFilter.size > 0 && !statusFilter.has(statusKeyOf(app))) return false;
      if (!q) return true;
      return `${app.companyName} ${app.role} ${app.location}`.toLowerCase().includes(q);
    });
  }, [appliedApplications, listQuery, statusFilter]);

  /** Needs tab keeps every active application even after some referrals were sent. */
  const needsReferralApps = filteredApplications;

  const referredApps = useMemo(
    () => filteredApplications.filter((app) => hasSuccessfulReferral(app.id, followUps)),
    [filteredApplications, followUps],
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

  function onColumnReorder(next: DragDropItems) {
    if (!Array.isArray(next)) return;
    const order = next.filter((id): id is ColumnId => DEFAULT_ORDER.includes(id as ColumnId));
    if (order.length !== DEFAULT_ORDER.length) return;
    persistOrder(order);
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
      // The countdown below ends this toast; the default 5s auto-dismiss must not.
      duration: Infinity,
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

  /**
   * Referral mail attaches to an application. For a Jobs-page job with no application yet,
   * create a Bookmarked one (linked to the job) and swap it into the list.
   */
  async function ensureApplicationId(id: string): Promise<string> {
    const app = applications.find((a) => a.id === id);
    if (!app?.jobOnly) return id;
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: app.companyName,
        role: app.role,
        location: app.location || "Remote",
        jobId: app.jobId,
        status: "bookmarked",
      }),
    });
    const data = (await res.json()) as { application?: { id: string }; error?: string };
    if (!res.ok || !data.application) {
      throw new Error(data.error || "Could not create an application for this job.");
    }
    const realId = data.application.id;
    setApplications((list) =>
      list.map((a) =>
        a.id === id
          ? {
              ...a,
              id: realId,
              jobOnly: false,
              status: "bookmarked",
              updatedAt: new Date().toISOString(),
            }
          : a,
      ),
    );
    setSelectedAppId(realId);
    return realId;
  }

  async function finalizeQueuedSend() {
    if (!selectedAppId) return;
    setPendingAction("queue");
    setCountdownVisible(false);
    dismissSendToast();
    try {
      const applicationId = await ensureApplicationId(selectedAppId);
      const due = new Date();
      due.setUTCDate(due.getUTCDate() + 3);
      const dueDate = due.toISOString().slice(0, 10);
      const personIds = Array.from(checkedPeople);
      const res = await fetch("/api/referrals/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
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
      // The undo window is over and the mail is saved: confirm that before Gmail sending
      // (a separate step whose result gets its own toast below).
      const queuedCount = data.count ?? queuedIds.size;
      toast.add({
        title: activeMailKind === "followup" ? "Follow-up queued" : "Mail queued",
        description: `${queuedCount} email${queuedCount === 1 ? "" : "s"} queued${
          resumeId ? " · resume attached" : ""
        } · sending via Gmail now`,
        type: "success",
      });
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
      setPendingAction(null);
    }
  }

  async function addPerson() {
    setError(null);
    if (!personDraft.name.trim()) {
      setError("Person name is required.");
      return;
    }
    setPendingAction("addPerson");
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
      setPendingAction(null);
    }
  }

  function renderColumnDragHandle(title: string) {
    return (
      <DragDropHandle
        aria-label={`Drag to reorder ${title} column`}
        title="Drag to reorder"
        className="size-8"
      >
        <GripVerticalIcon className="size-4" />
      </DragDropHandle>
    );
  }

  function renderConfirmPanel() {
    return (
      <Card className="border-border/80 bg-card shrink-0 gap-0 space-y-2.5 rounded-xl border p-3 shadow-sm">
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
          {activeMailKind === "followup"
            ? "Confirm & send follow-ups"
            : "Confirm & send referral emails"}
        </h2>
        <label className="text-foreground flex cursor-pointer items-center gap-2 text-[12px]">
          <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm
          these {checkedPeople.size} recipient(s)
        </label>
        <Button
          type="button"
          loading={pendingAction === "queue"}
          loadingText="Sending…"
          disabled={
            pending ||
            !confirmed ||
            checkedPeople.size === 0 ||
            !selectedAppId ||
            !selectedTemplateId ||
            countdownVisible
          }
          onClick={() => void queueFollowUps()}
          className="w-full"
        >
          {activeMailKind === "followup" ? "Queue follow-up (20s)" : "Queue referral (20s)"}
        </Button>
      </Card>
    );
  }

  function renderColumn(id: ColumnId) {
    const meta = COLUMN_META[id];

    // Right column: People + Confirm as two stacked cards, one drag unit
    if (id === "people") {
      return (
        <div className="relative flex h-full min-w-0 flex-col gap-3">
          <Card className="border-border/80 bg-card flex min-h-0 flex-1 flex-col gap-0 rounded-xl border p-0 shadow-sm">
            <header className="border-border/60 flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-foreground text-[13px] font-semibold tracking-tight">
                  {meta.title}
                </p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">{meta.blurb}</p>
              </div>
              {renderColumnDragHandle(`${meta.title} & confirm`)}
            </header>
            <ScrollArea className="min-h-0 flex-1 space-y-2.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-[11px]">
                  {checkedPeople.size} selected
                  {appReferralTab === "sent" ? " · follow-up" : " · referral"}
                </p>
                <Button variant="link" size="xs" type="button" onClick={() => setManageOpen(true)}>
                  Add person
                </Button>
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
                    const mailMeta = personMailMeta(person.id);
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
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-foreground min-w-0 truncate text-[12px] font-medium">
                                {person.name}
                              </span>
                              {appReferralTab === "sent" &&
                              (mailMeta.outreach || mailMeta.followup || cooldown?.blocked) ? (
                                <HoverCard openDelay={80} closeDelay={100}>
                                  <HoverCardTrigger>
                                    <Button
                                      variant="outline"
                                      size="icon-xs"
                                      className="text-muted-foreground hover:text-foreground border-border/70 hover:border-border size-5 min-h-5 min-w-5 shrink-0 rounded-full"
                                      aria-label="Mail status details"
                                      onClick={(e) => e.preventDefault()}
                                    >
                                      <QuestionMarkIcon className="size-3" />
                                    </Button>
                                  </HoverCardTrigger>
                                  <HoverCardContent side="top" align="end" className="space-y-1.5">
                                    <p className="text-foreground text-[11px] font-semibold tracking-tight">
                                      Mail status
                                    </p>
                                    {mailMeta.outreach ? (
                                      <p className="text-muted-foreground leading-snug">
                                        Referral email sent{" "}
                                        <span className="text-foreground">
                                          {formatRelativeAgo(
                                            mailMeta.outreach.updatedAt ||
                                              mailMeta.outreach.createdAt,
                                          )}
                                        </span>
                                      </p>
                                    ) : null}
                                    {mailMeta.followup ? (
                                      <p className="text-muted-foreground leading-snug">
                                        Last follow-up{" "}
                                        <span className="text-foreground">
                                          {formatRelativeAgo(
                                            mailMeta.followup.updatedAt ||
                                              mailMeta.followup.createdAt,
                                          )}
                                        </span>
                                      </p>
                                    ) : (
                                      <p className="text-muted-foreground leading-snug">
                                        No follow-up sent yet
                                      </p>
                                    )}
                                    {cooldown?.blocked ? (
                                      <p className="text-primary leading-snug">
                                        Wait 1 hour before another follow-up
                                      </p>
                                    ) : (
                                      <p className="text-muted-foreground leading-snug">
                                        Ready for another follow-up
                                      </p>
                                    )}
                                  </HoverCardContent>
                                </HoverCard>
                              ) : null}
                            </span>
                            <span className="text-muted-foreground block truncate text-[11px]">
                              {person.email ?? "No email"}
                              {person.company ? ` · ${person.company}` : ""}
                            </span>
                            {appReferralTab === "needs" && outreachBlocked ? (
                              <span className="mt-1 block">
                                <Badge variant="outline" className="h-5 text-[10px]">
                                  Referral already sent
                                </Badge>
                              </span>
                            ) : null}
                            {appReferralTab === "sent" && cooldown?.blocked ? (
                              <span className="mt-1 block">
                                <Badge variant="outline" className="h-5 text-[10px]">
                                  Wait 1 hour before another follow-up
                                </Badge>
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </ScrollArea>
          </Card>
          {renderConfirmPanel()}
        </div>
      );
    }

    return (
      <Card
        className={cn(
          "border-border/80 relative flex h-full min-w-0 flex-col gap-0 rounded-xl border p-0 shadow-sm",
          // The applications column holds cards, so it takes the section colour.
          id === "applications" ? "bg-muted" : "bg-card",
        )}
      >
        <header className="border-border/60 flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-foreground text-[13px] font-semibold tracking-tight">{meta.title}</p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">{meta.blurb}</p>
          </div>
          {renderColumnDragHandle(meta.title)}
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
                <ul className="space-y-2">
                  {needsReferralApps.length === 0 ? (
                    <li className="text-muted-foreground text-[12px]">
                      {appliedApplications.length === 0
                        ? "No active applications or jobs yet. Add one on the job tracker or find jobs on Jobs."
                        : "Nothing matches this search or status filter."}
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
                            className={jobCardClassName({ selected, className: "cursor-pointer" })}
                          >
                            <JobCardContent
                              company={app.companyName}
                              title={app.role}
                              subtitle={`${app.companyName} · ${app.location}`}
                            >
                              <AppTags app={app} needsReferral={needsBadge} />
                            </JobCardContent>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </TabsContent>
              <TabsContent value="sent" className="mt-0 outline-none focus-visible:ring-0">
                <ul className="space-y-2">
                  {referredApps.length === 0 ? (
                    <li className="text-muted-foreground text-[12px]">
                      No referral emails sent yet for your active applications.
                    </li>
                  ) : (
                    referredApps.map((app) => {
                      const selected = app.id === selectedAppId;
                      return (
                        <li key={app.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedAppId(app.id)}
                            className={jobCardClassName({ selected, className: "cursor-pointer" })}
                          >
                            <JobCardContent
                              company={app.companyName}
                              title={app.role}
                              subtitle={`${app.companyName} · ${app.location}`}
                            >
                              <AppTags app={app} />
                            </JobCardContent>
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
                <Input
                  readOnly
                  value={userEmail}
                  className="h-8 max-h-8 min-h-8 cursor-not-allowed text-[12px]"
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
                  <SelectTrigger className="text-foreground h-8 w-full cursor-pointer rounded-lg border px-2 text-[12px]">
                    <SelectValue
                      placeholder={
                        activeTemplates.length === 0
                          ? "No saved templates"
                          : "Choose a saved template"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="z-240">
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
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => setResumePickerOpen(true)}
                  >
                    {resumeId ? "Change resume" : "Attach resume"}
                  </Button>
                  {resumeId ? (
                    <>
                      <span className="text-muted-foreground truncate text-[11px]">
                        {resumeOptions.find((resume) => resume.id === resumeId)?.displayName ||
                          "resume"}
                      </span>
                      <Button
                        variant="link"
                        size="xs"
                        type="button"
                        onClick={() => setResumeId(null)}
                      >
                        Remove
                      </Button>
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
        </div>
      </Card>
    );
  }

  const toolbar = (
    <Card size="sm" className="mb-4 flex-row flex-wrap items-center gap-2 p-2">
      <SearchInput
        value={listQuery}
        onChange={(e) => setListQuery(e.target.value)}
        placeholder="Search company, role, location…"
        aria-label="Search applications and jobs"
        className="w-full sm:max-w-xs"
      />
      <ToggleGroup
        aria-label="Filter by status"
        multiple
        variant="outline"
        size="sm"
        spacing={1}
        className="flex-wrap"
        value={[...statusFilter]}
        onValueChange={(next) => setStatusFilter(new Set(next as StatusKey[]))}
      >
        {STATUS_FILTERS.filter((f) => (statusCounts.get(f.value) ?? 0) > 0).map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="rounded-full text-[11px]">
            {f.label}
            <span className="tabular-nums opacity-70">{statusCounts.get(f.value) ?? 0}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Tooltip content="Open outreach inbox" className="z-70 text-[12px]">
          <Link
            href={variant === "board" ? "/outreach/board" : "/outreach"}
            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
            aria-label="Open outreach inbox"
          >
            <InboxIcon />
          </Link>
        </Tooltip>
        <BoardToggleLink
          expanded={variant === "board"}
          href={variant === "board" ? "/referrals" : "/referrals/board"}
          label="referrals board"
        />
      </div>
    </Card>
  );

  const columns = (
    <DragDrop
      items={columnOrder}
      orientation="horizontal"
      onReorder={onColumnReorder}
      className={cn("w-full min-w-0", variant === "board" && "min-h-0 flex-1")}
    >
      <DragDropList
        className={cn(
          "w-full gap-3 overflow-x-auto pb-1",
          variant === "board" ? "h-full" : "h-[min(70vh,44rem)]",
        )}
      >
        {columnOrder.map((id) => (
          <DragDropItem
            key={id}
            id={id}
            style={{
              flex: `${DEFAULT_WIDTHS[id]} 1 0%`,
              minWidth: 240,
              height: "100%",
            }}
            className="border-border/0 data-dragging:opacity-40 bg-transparent p-0 shadow-none hover:bg-transparent"
          >
            {renderColumn(id)}
          </DragDropItem>
        ))}
      </DragDropList>
    </DragDrop>
  );

  const modals = (
    <>
      <Dialog
        open={resumePickerOpen}
        onOpenChange={(next) => {
          if (!next) (() => setResumePickerOpen(false))();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach resume</DialogTitle>
            <DialogDescription>
              Pick one uploaded resume to attach as a PDF. Upload new files on Documents.
            </DialogDescription>
          </DialogHeader>

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

          <DialogFooter>
            <>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setResumePickerOpen(false)}
              >
                Cancel
              </Button>
              {resumeId ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setResumeId(null);
                    setResumePickerOpen(false);
                  }}
                >
                  Remove attachment
                </Button>
              ) : null}
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageOpen}
        onOpenChange={(next) => {
          if (!next) (() => setManageOpen(false))();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add person</DialogTitle>
            <DialogDescription>
              Contacts stay user-scoped. Use them as outreach recipients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            <label className="block space-y-1">
              <span className="text-foreground text-[12px] font-medium">Name *</span>
              <Input
                value={personDraft.name}
                onChange={(e) => setPersonDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-foreground text-[12px] font-medium">Email</span>
              <Input
                value={personDraft.email}
                onChange={(e) => setPersonDraft((d) => ({ ...d, email: e.target.value }))}
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
              <Input
                value={personDraft.roleTitle}
                onChange={(e) => setPersonDraft((d) => ({ ...d, roleTitle: e.target.value }))}
              />
            </label>
          </div>

          <DialogFooter>
            <>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setManageOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                type="button"
                loading={pendingAction === "addPerson"}
                disabled={pending}
                onClick={() => void addPerson()}
              >
                Add
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={templatesOpen}
        onOpenChange={(next) => {
          if (!next) (() => setTemplatesOpen(false))();
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Manage templates</DialogTitle>
            <DialogDescription>
              Same editor as Documents → Referral Email. Preview uses a dummy application.
            </DialogDescription>
          </DialogHeader>

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

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setTemplatesOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (variant === "board") {
    return (
      <FullscreenBoard className="gap-2">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {toolbar}
        {columns}
        {modals}
      </FullscreenBoard>
    );
  }

  return (
    <ShellWidth className="aavedak-fade-up space-y-6 py-8 sm:py-10">
      <header>
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
      </header>

      <GmailConnectBanner callbackURL="/referrals" />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        {toolbar}
        {columns}
      </div>

      <Card className="border-border/80 bg-card gap-0 space-y-2 rounded-xl border p-4">
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
      </Card>

      {modals}
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

function QuestionMarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M5.75 5.6c0-1.2 1-2.1 2.25-2.1S10.25 4.4 10.25 5.6c0 .85-.45 1.45-1.2 1.85-.7.35-1.05.7-1.05 1.4v.35"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r="0.85" fill="currentColor" />
    </svg>
  );
}

/** Status + origin chips on an application in the Active applications column. */
function AppTags({ app, needsReferral = false }: { app: ApplicationDto; needsReferral?: boolean }) {
  return (
    <>
      <Badge variant={app.jobOnly ? "outline" : "default"} className={JOB_CARD_BADGE}>
        {app.jobOnly ? "Not applied" : STATUS_LABELS[app.status]}
      </Badge>
      {app.jobId ? (
        <Badge variant="outline" className={JOB_CARD_BADGE}>
          From Jobs
        </Badge>
      ) : null}
      {needsReferral ? (
        <Badge variant="secondary" className={JOB_CARD_BADGE}>
          Needs referral
        </Badge>
      ) : null}
    </>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
      <path
        d="M22 12h-6l-2 3h-4l-2-3H2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
