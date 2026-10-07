"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/application-status";
import { CompanySelect } from "@/components/company-select";
import { ColdEmailTemplatesPanel } from "@/components/cold-email-templates-panel";
import { GmailConnectBanner } from "@/components/gmail-connect-banner";
import { ShellWidth } from "@/components/shell-width";
import { cn } from "@/lib/utils";

export type ApplicationDto = {
  id: string;
  companyName: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  updatedAt: string;
};

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
  kind: "outreach" | "cover" | "other";
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
  createdAt: string;
  updatedAt: string;
};

type ColumnId = "applications" | "template" | "people";

const DEFAULT_ORDER: ColumnId[] = ["applications", "template", "people"];
const STORAGE_KEY = "aavedak-referrals-column-order";
const DEFAULT_WIDTHS: Record<ColumnId, number> = {
  applications: 1,
  template: 2,
  people: 1,
};

const COLUMN_META: Record<ColumnId, { title: string; blurb: string }> = {
  applications: { title: "Applications", blurb: "Context for {{company}} / {{role}}" },
  template: { title: "Cold email", blurb: "Template · From = your Gmail" },
  people: { title: "People", blurb: "Check recipients, then confirm" },
};

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

  const [selectedAppId, setSelectedAppId] = useState<string | null>(
    initialApplications[0]?.id ?? null,
  );
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

  useEffect(() => {
    if (!countdownVisible || !countdownArmed) return;
    if (countdown <= 0) {
      setCountdownArmed(false);
      void finalizeQueuedSend();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- countdown tick only
  }, [countdownVisible, countdown, countdownArmed]);

  function cancelCountdown() {
    setCountdownVisible(false);
    setCountdownArmed(false);
    setCountdown(20);
    setNotice("Send cancelled. Nothing was queued.");
  }

  const selectedApp = useMemo(
    () => applications.find((a) => a.id === selectedAppId) ?? null,
    [applications, selectedAppId],
  );

  const companyPeople = useMemo(() => {
    if (!selectedApp) return [] as PersonDto[];
    const company = selectedApp.companyName.trim().toLowerCase();
    return people.filter((person) => {
      if (person.applicationId === selectedApp.id) return true;
      const personCompany = person.company?.trim().toLowerCase() ?? "";
      return Boolean(company) && personCompany === company;
    });
  }, [people, selectedApp]);

  useEffect(() => {
    setCheckedPeople((prev) => {
      const allowed = new Set(companyPeople.map((p) => p.id));
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setConfirmed(false);
  }, [selectedAppId, companyPeople]);

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

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const subject = selectedTemplate?.subject?.trim()
    ? selectedTemplate.subject
    : selectedTemplate
      ? "Referral ask — {{role}} at {{company}}"
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
    setCheckedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    setCountdown(20);
    setCountdownArmed(true);
    setCountdownVisible(true);
  }

  async function finalizeQueuedSend() {
    if (!selectedAppId) return;
    setPending(true);
    setCountdownVisible(false);
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
      if (sent === 0 && failed > 0) {
        setError(
          `Gmail could not send ${failed} message${failed === 1 ? "" : "s"}. Check Follow-ups.`,
        );
      } else {
        setNotice(
          `Sent ${sent} via Gmail${failed ? ` · ${failed} failed` : ""}${
            resumeId ? " (resume attached)" : ""
          }.`,
        );
      }
      setCheckedPeople(new Set());
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue failed.");
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
          "border-border/80 bg-card relative flex h-[min(70vh,42rem)] min-w-0 flex-col rounded-xl border shadow-sm",
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

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
          {id === "applications" ? (
            <ul className="space-y-1.5">
              {applications.length === 0 ? (
                <li className="text-muted-foreground text-[12px]">No applications yet.</li>
              ) : (
                applications.map((app) => {
                  const selected = app.id === selectedAppId;
                  return (
                    <li key={app.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAppId(app.id)}
                        className={cn(
                          "w-full rounded-xl border px-2.5 py-2 text-left transition-colors",
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
                        <Badge variant="secondary" className="mt-1 h-5 text-[10px]">
                          {STATUS_LABELS[app.status]}
                        </Badge>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}

          {id === "template" ? (
            <div className="space-y-2.5">
              <label className="block space-y-1">
                <span className="text-muted-foreground text-[11px] font-medium">From</span>
                <input
                  readOnly
                  value={userEmail}
                  className="border-border bg-muted/40 text-foreground h-8 w-full cursor-not-allowed rounded-lg border px-2.5 text-[12px]"
                />
              </label>
              <div className="space-y-1">
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
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-[11px] font-medium">
                    Cold email template
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={() => setTemplatesOpen(true)}
                    className="text-[11px]"
                  >
                    Manage templates
                  </Button>
                </div>
                <Select
                  value={selectedTemplateId ?? undefined}
                  onValueChange={(v) => setSelectedTemplateId(v || null)}
                  disabled={templates.length === 0}
                >
                  <SelectTrigger className="border-border bg-background text-foreground h-8 w-full cursor-pointer rounded-lg border px-2 text-[12px]">
                    <SelectValue
                      placeholder={
                        templates.length === 0 ? "No saved templates" : "Choose a saved template"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="z-[240]">
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {templates.length === 0 ? (
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Template options are fixed to your saved templates only. Create one via Manage
                  templates.
                </p>
              ) : (
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Subject and body come from the selected saved template (read-only here). Edit copy
                  in Manage templates / Documents.
                </p>
              )}
              <div className="border-border/60 bg-muted/30 space-y-2.5 rounded-xl border p-2.5">
                <div>
                  <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                    Subject
                  </p>
                  <p className="text-foreground mt-1 text-[12px] font-medium">
                    {selectedTemplate
                      ? previewSubject || "(empty subject)"
                      : "Select a saved template"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                    Body preview
                  </p>
                  <pre className="text-muted-foreground mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed">
                    {selectedTemplate
                      ? previewBody || "(empty body)"
                      : "Choose a template to preview filled subject and body."}
                  </pre>
                </div>
                <div className="border-border/50 space-y-2 border-t pt-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setResumePickerOpen((open) => !open)}
                      className="border-border bg-background text-foreground hover:bg-muted/60 inline-flex h-8 items-center rounded-lg border px-3 text-[12px] font-medium"
                    >
                      {resumeId ? "Change resume" : "Attach resume"}
                    </button>
                    {resumeId ? (
                      <span className="text-muted-foreground truncate text-[11px]">
                        {resumeOptions.find((resume) => resume.id === resumeId)?.displayName ||
                          "resume"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">
                        Optional · pick one uploaded resume
                      </span>
                    )}
                  </div>
                  {resumePickerOpen ? (
                    <div className="space-y-2">
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        Attach one of your uploaded resumes as a PDF. Prefer a different file?
                        Upload it on Documents first.
                      </p>
                      {resumeOptions.length === 0 ? (
                        <p className="text-muted-foreground text-[11px]">
                          No resumes uploaded yet — add one on Documents.
                        </p>
                      ) : (
                        <Select
                          value={resumeId ?? ""}
                          onValueChange={(value) => {
                            setResumeId(value || null);
                            setResumePickerOpen(false);
                          }}
                        >
                          <SelectTrigger className="h-9 w-full text-[12px]">
                            <SelectValue placeholder="Choose a resume" />
                          </SelectTrigger>
                          <SelectContent className="z-[240]">
                            {resumeOptions.map((resume) => (
                              <SelectItem key={resume.id} value={resume.id}>
                                {resume.displayName} ({resume.status})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {resumeId ? (
                        <button
                          type="button"
                          className="text-muted-foreground text-[11px] underline"
                          onClick={() => setResumeId(null)}
                        >
                          Remove attachment
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {id === "people" ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-[11px]">{checkedPeople.size} selected</p>
                <button
                  type="button"
                  onClick={() => setManageOpen(true)}
                  className="text-primary text-[11px] font-medium hover:underline"
                >
                  Add person
                </button>
              </div>
              <ul className="space-y-1.5">
                {!selectedApp ? (
                  <li className="text-muted-foreground text-[12px]">
                    Select an application to see people at that company.
                  </li>
                ) : companyPeople.length === 0 ? (
                  <li className="text-muted-foreground text-[12px]">
                    No people at {selectedApp.companyName} yet — add a contact for this company.
                  </li>
                ) : (
                  companyPeople.map((person) => {
                    const checked = checkedPeople.has(person.id);
                    return (
                      <li key={person.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2",
                            checked
                              ? "border-primary/40 bg-primary/10"
                              : "border-border/70 bg-muted/30",
                          )}
                        >
                          <Checkbox checked={checked} onChange={() => togglePerson(person.id)} />
                          <span className="min-w-0">
                            <span className="text-foreground block truncate text-[12px] font-medium">
                              {person.name}
                            </span>
                            <span className="text-muted-foreground block truncate text-[11px]">
                              {person.email ?? "No email"}
                              {person.company ? ` · ${person.company}` : ""}
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
              Confirm & queue follow-ups
            </h2>
            <div className="border-border/70 bg-muted/40 rounded-lg border px-3 py-2">
              <p className="text-foreground text-[12px] font-medium leading-relaxed">
                Creates follow-up tasks (linked to application + person), then shows a 20 second
                countdown before Gmail sends the batch.
              </p>
              {resumeId ? (
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-relaxed">
                  Resume attached from Cold email:{" "}
                  <span className="text-foreground font-medium">
                    {resumeOptions.find((resume) => resume.id === resumeId)?.displayName ||
                      "resume"}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground mt-0.5 text-[12px] leading-relaxed">
                  Attach a resume in the Cold email preview if you want a PDF on the send.
                </p>
              )}
            </div>
          </div>
          <label className="text-foreground flex shrink-0 items-center gap-2 text-[12px]">
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
          className="aavedak-btn bg-primary text-primary-foreground inline-flex h-9 items-center rounded-lg px-4 text-[12px] font-semibold disabled:opacity-50"
        >
          {pending ? "Sending…" : "Queue & send (20s)"}
        </button>
      </section>

      <section className="border-border/80 bg-card space-y-2 rounded-xl border p-4">
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
          Pending follow-ups
        </h2>
        {followUps.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">None queued yet.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {followUps.slice(0, 12).map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-foreground truncate text-[12px] font-medium">{f.title}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {f.sendAfter
                      ? `Send after ${new Date(f.sendAfter).toLocaleString()}`
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

      {countdownVisible ? (
        <div
          role="status"
          aria-live="polite"
          className="border-border bg-card fixed bottom-4 right-4 z-[300] flex w-[min(28rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border px-3.5 py-3 shadow-lg"
        >
          <div className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <span className="aavedak-display text-lg tabular-nums leading-none">{countdown}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-[13px] font-semibold tracking-tight">
              Sending in {countdown}s
            </p>
            <p className="text-muted-foreground truncate text-[11px] leading-relaxed">
              {checkedPeople.size} recipient{checkedPeople.size === 1 ? "" : "s"}
              {resumeId ? " · resume attached" : ""} via Gmail
            </p>
          </div>
          <button
            type="button"
            onClick={cancelCountdown}
            className="border-border text-foreground hover:bg-muted/60 inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-[12px] font-semibold"
          >
            Undo
          </button>
        </div>
      ) : null}

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
        description="Same editor as Documents → Cold email templates. Preview uses a dummy application."
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
          templates={templates}
          onTemplatesChange={(next) => setTemplates(next)}
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
