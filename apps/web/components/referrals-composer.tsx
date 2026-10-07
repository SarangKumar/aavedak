"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/application-status";
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
  status: "pending" | "done" | "dismissed";
  personId: string | null;
  applicationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ColumnId = "applications" | "template" | "people";

const DEFAULT_ORDER: ColumnId[] = ["applications", "template", "people"];
const STORAGE_KEY = "arambh-referrals-column-order";

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
  const [subject, setSubject] = useState("Referral ask — {{role}} at {{company}}");
  const [body, setBody] = useState("");
  const [checkedPeople, setCheckedPeople] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [manageOpen, setManageOpen] = useState(false);
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
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (tpl) setBody(tpl.body);
  }, [selectedTemplateId, templates]);

  const selectedApp = useMemo(
    () => applications.find((a) => a.id === selectedAppId) ?? null,
    [applications, selectedAppId],
  );

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

  async function saveTemplateBody() {
    if (!selectedTemplateId) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${selectedTemplateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json()) as { template?: TemplateDto; error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed.");
      if (data.template) {
        setTemplates((list) => list.map((t) => (t.id === data.template!.id ? data.template! : t)));
        setNotice("Template saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setPending(false);
    }
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
        }),
      });
      const data = (await res.json()) as {
        followUps?: FollowUpDto[];
        count?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Queue failed.");
      if (data.followUps?.length) {
        setFollowUps((list) => [...data.followUps!, ...list]);
      }
      setNotice(`Queued ${data.count ?? personIds.length} follow-up(s). No email was sent.`);
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
        className={cn(
          "border-border/80 bg-card/90 flex min-h-[28rem] min-w-0 flex-1 flex-col rounded-2xl border shadow-sm",
          dragCol === id && "ring-primary/40 opacity-70 ring-2",
        )}
      >
        <header
          draggable
          onDragStart={() => onColDragStart(id)}
          onDragEnd={() => setDragCol(null)}
          className="border-border/60 flex cursor-grab items-start justify-between gap-2 border-b px-3 py-2.5 active:cursor-grabbing"
        >
          <div className="min-w-0">
            <p className="text-foreground text-[13px] font-semibold tracking-tight">{meta.title}</p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">{meta.blurb}</p>
          </div>
          <Badge variant="outline" className="text-muted-foreground shrink-0 text-[10px]">
            drag
          </Badge>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
              <label className="block space-y-1">
                <span className="text-muted-foreground text-[11px] font-medium">Template</span>
                <Select
                  value={selectedTemplateId ?? undefined}
                  onValueChange={(v) => setSelectedTemplateId(v || null)}
                >
                  <SelectTrigger className="border-border bg-background text-foreground h-8 w-full rounded-lg border px-2 text-[12px]">
                    <SelectValue placeholder="Template" />
                  </SelectTrigger>
                  <SelectContent className="z-[240]">
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.title} ({tpl.kind})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="text-muted-foreground text-[11px] font-medium">Subject</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="border-border bg-background text-foreground h-8 w-full rounded-lg border px-2.5 text-[12px]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-muted-foreground text-[11px] font-medium">Body</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="border-border bg-background text-foreground w-full rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed"
                />
              </label>
              <p className="text-muted-foreground text-[10px] leading-relaxed">
                Placeholders: {"{{company}}"} {"{{role}}"} {"{{location}}"} {"{{person_name}}"}{" "}
                {"{{person_email}}"} {"{{user_name}}"}
              </p>
              <div className="border-border/60 bg-muted/30 rounded-xl border p-2.5">
                <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                  Preview (app context)
                </p>
                <p className="text-foreground mt-1 text-[12px] font-medium">{previewSubject}</p>
                <pre className="text-muted-foreground mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed">
                  {previewBody}
                </pre>
              </div>
              <button
                type="button"
                disabled={pending || !selectedTemplateId}
                onClick={() => void saveTemplateBody()}
                className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] disabled:opacity-50"
              >
                Save template body
              </button>
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
                {people.length === 0 ? (
                  <li className="text-muted-foreground text-[12px]">
                    No people yet — add contacts to check as recipients.
                  </li>
                ) : (
                  people.map((person) => {
                    const checked = checkedPeople.has(person.id);
                    return (
                      <li key={person.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-2 rounded-xl border px-2.5 py-2",
                            checked
                              ? "border-primary/40 bg-primary/10"
                              : "border-border/70 bg-muted/30",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePerson(person.id)}
                            className="mt-0.5"
                          />
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
    <ShellWidth className="avsar-fade-up space-y-6 py-8 sm:py-10">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
            आरंभ
          </p>
          <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Referrals</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            Compose cold outreach against an application, pick people, confirm, then queue
            follow-ups. No mail is sent yet — From stays your Gmail ({userEmail}).
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
            className="border-border bg-card/70 text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
          >
            Reset columns
          </button>
        </div>
      </header>

      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
      {notice ? <p className="text-primary text-[13px] font-medium">{notice}</p> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        {columnOrder.map((id) => renderColumn(id))}
      </div>

      <section className="border-border/80 bg-card/80 space-y-3 rounded-2xl border p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              Confirm & queue follow-ups
            </h2>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Creates pending follow-up tasks (linked to application + person). Does not send Gmail.
            </p>
          </div>
          <label className="text-foreground flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm these {checkedPeople.size} recipient(s)
          </label>
        </div>
        <button
          type="button"
          disabled={pending || !confirmed || checkedPeople.size === 0 || !selectedAppId}
          onClick={() => void queueFollowUps()}
          className="avsar-btn bg-primary text-primary-foreground inline-flex h-9 items-center rounded-lg px-4 text-[12px] font-semibold disabled:opacity-50"
        >
          {pending ? "Queueing…" : "Queue follow-ups"}
        </button>
      </section>

      <section className="border-border/80 bg-card/70 space-y-2 rounded-2xl border p-4">
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
                    {f.dueDate ? `Due ${f.dueDate.slice(0, 10)}` : "No due date"}
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
              className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
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
    </ShellWidth>
  );
}
