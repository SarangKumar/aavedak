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
    setPending(true);
    try {
      const due = new Date();
      due.setUTCDate(due.getUTCDate() + 3);
      const dueDate = due.toISOString().slice(0, 10);

      const personIds = Array.from(checkedPeople);
      // Render per-person body into notes via server using raw template + we send already-rendered with person vars
      // Send subject/body with company/role filled; person_name left for notes per person on server from people table
      // Actually server stores subject/body as-is; better fill person on client per-request — API takes one body.
      // Fill person_name as "{{person_name}}" still in body; server uses people names in title only.
      // For richer notes, render each on client and batch — API currently one body. Keep one body with company vars;
      // person_name in preview empty; follow-up notes still useful with subject/body.

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
          sendAfterMinutes: 10,
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
      setNotice(
        `Queued ${data.count ?? personIds.length} follow-up(s) for ~10 min — Gmail will send when due.`,
      );
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
          "border-border/80 bg-card relative flex h-[min(70vh,40rem)] min-w-0 flex-col rounded-xl border shadow-sm",
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
              <div className="border-border/60 bg-muted/30 space-y-2 rounded-xl border p-2.5">
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
            queue follow-ups (~10 min delay). Mail sends from your Gmail ({userEmail}) after the
            delay.
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
                Creates pending follow-up tasks (linked to application + person).
              </p>
              <p className="text-muted-foreground mt-0.5 text-[12px] font-semibold leading-relaxed">
                Queued sends wait ~10 minutes, then the cron (or Process due queue) sends each
                message via your Gmail. Authorize Gmail above if the banner asks for consent.
              </p>
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
            !selectedTemplateId
          }
          onClick={() => void queueFollowUps()}
          className="aavedak-btn bg-primary text-primary-foreground inline-flex h-9 items-center rounded-lg px-4 text-[12px] font-semibold disabled:opacity-50"
        >
          {pending ? "Queueing…" : "Queue follow-ups"}
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
          {(
            [
              ["name", "Name *"],
              ["email", "Email"],
              ["company", "Company"],
              ["roleTitle", "Role"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1">
              <span className="text-foreground text-[12px] font-medium">{label}</span>
              <input
                value={personDraft[key]}
                onChange={(e) => setPersonDraft((d) => ({ ...d, [key]: e.target.value }))}
                className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
              />
            </label>
          ))}
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
