"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type Tab = "people" | "follow_ups";

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

type ReferralsHubProps = {
  initialPeople: PersonDto[];
  initialFollowUps: FollowUpDto[];
  userEmail: string;
};

export function ReferralsHub({ initialPeople, initialFollowUps, userEmail }: ReferralsHubProps) {
  const [tab, setTab] = useState<Tab>("people");
  const [people, setPeople] = useState(initialPeople);
  const [followUps, setFollowUps] = useState(initialFollowUps);
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [personForm, setPersonForm] = useState({
    name: "",
    email: "",
    company: "",
    roleTitle: "",
    notes: "",
  });
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);

  const [fuForm, setFuForm] = useState({
    title: "",
    dueDate: "",
    personId: "",
    notes: "",
  });

  const peopleById = useMemo(() => {
    const map = new Map<string, PersonDto>();
    for (const p of people) map.set(p.id, p);
    return map;
  }, [people]);

  const visibleFollowUps = useMemo(() => {
    if (showClosed) return followUps;
    return followUps.filter((f) => f.status === "pending");
  }, [followUps, showClosed]);

  async function savePerson() {
    setError(null);
    if (!personForm.name.trim()) {
      setError("Name is required.");
      return;
    }
    setPending(true);
    try {
      if (editingPersonId) {
        const res = await fetch(`/api/people/${editingPersonId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: personForm.name,
            email: personForm.email || null,
            company: personForm.company || null,
            roleTitle: personForm.roleTitle || null,
            notes: personForm.notes || null,
          }),
        });
        const data = (await res.json()) as { person?: PersonDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Update failed.");
        if (data.person) {
          setPeople((list) => list.map((p) => (p.id === editingPersonId ? data.person! : p)));
        }
      } else {
        const res = await fetch("/api/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: personForm.name,
            email: personForm.email || null,
            company: personForm.company || null,
            roleTitle: personForm.roleTitle || null,
            notes: personForm.notes || null,
          }),
        });
        const data = (await res.json()) as { person?: PersonDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Create failed.");
        if (data.person) setPeople((list) => [data.person!, ...list]);
      }
      setPersonForm({ name: "", email: "", company: "", roleTitle: "", notes: "" });
      setEditingPersonId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setPending(false);
    }
  }

  async function archivePerson(id: string) {
    setError(null);
    const res = await fetch(`/api/people/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not archive.");
      return;
    }
    setPeople((list) => list.filter((p) => p.id !== id));
    if (editingPersonId === id) {
      setEditingPersonId(null);
      setPersonForm({ name: "", email: "", company: "", roleTitle: "", notes: "" });
    }
  }

  async function createFollowUp() {
    setError(null);
    if (!fuForm.title.trim()) {
      setError("Follow-up title is required.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fuForm.title,
          dueDate: fuForm.dueDate || null,
          personId: fuForm.personId || null,
          notes: fuForm.notes || null,
        }),
      });
      const data = (await res.json()) as { followUp?: FollowUpDto; error?: string };
      if (!res.ok) throw new Error(data.error || "Create failed.");
      if (data.followUp) setFollowUps((list) => [data.followUp!, ...list]);
      setFuForm({ title: "", dueDate: "", personId: "", notes: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setPending(false);
    }
  }

  async function setFollowUpStatus(id: string, status: FollowUpDto["status"]) {
    setError(null);
    const res = await fetch(`/api/follow-ups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await res.json()) as { followUp?: FollowUpDto; error?: string };
    if (!res.ok) {
      setError(data.error || "Could not update follow-up.");
      return;
    }
    if (data.followUp) {
      setFollowUps((list) => list.map((f) => (f.id === id ? data.followUp! : f)));
    }
  }

  async function reloadFollowUps(includeClosed: boolean) {
    const res = await fetch(`/api/follow-ups?includeClosed=${includeClosed ? "1" : "0"}`);
    const data = (await res.json()) as { followUps?: FollowUpDto[]; error?: string };
    if (!res.ok) {
      setError(data.error || "Failed to load follow-ups.");
      return;
    }
    setFollowUps(data.followUps ?? []);
  }

  return (
    <div className="avsar-fade-up mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-1">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          अवसर
        </p>
        <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Referrals</h1>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Track people and follow-ups. Outreach later sends from your Gmail (
          <span className="text-foreground font-medium">{userEmail}</span>
          ). Contacts here are private to you — global Person sync comes later.
        </p>
      </header>

      <div className="border-border bg-card/70 inline-flex h-8 items-center rounded-lg border p-0.5">
        {(
          [
            { id: "people", label: "People" },
            { id: "follow_ups", label: "Follow-ups" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setError(null);
            }}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors",
              tab === item.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-destructive text-[13px]">{error}</p> : null}

      {tab === "people" ? (
        <section className="space-y-4">
          <div className="border-border/80 bg-card/70 space-y-2.5 rounded-2xl border p-4">
            <p className="text-foreground text-[12px] font-medium">
              {editingPersonId ? "Edit person" : "Add person"}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field
                label="Name *"
                value={personForm.name}
                onChange={(v) => setPersonForm((f) => ({ ...f, name: v }))}
              />
              <Field
                label="Email (your outreach override)"
                value={personForm.email}
                onChange={(v) => setPersonForm((f) => ({ ...f, email: v }))}
              />
              <Field
                label="Company"
                value={personForm.company}
                onChange={(v) => setPersonForm((f) => ({ ...f, company: v }))}
              />
              <Field
                label="Role / title"
                value={personForm.roleTitle}
                onChange={(v) => setPersonForm((f) => ({ ...f, roleTitle: v }))}
              />
            </div>
            <label className="block space-y-1">
              <span className="text-foreground text-[12px] font-medium">Notes</span>
              <textarea
                value={personForm.notes}
                onChange={(e) => setPersonForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px]"
              />
            </label>
            <div className="flex gap-2">
              {editingPersonId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPersonId(null);
                    setPersonForm({
                      name: "",
                      email: "",
                      company: "",
                      roleTitle: "",
                      notes: "",
                    });
                  }}
                  className="border-border text-muted-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => void savePerson()}
                className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
              >
                {pending ? "Saving…" : editingPersonId ? "Update" : "Add person"}
              </button>
            </div>
          </div>

          {people.length === 0 ? (
            <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-[13px]">
              No people yet — add a contact to track referral asks.
            </div>
          ) : (
            <ul className="space-y-2">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="border-border/80 bg-card/70 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-foreground text-[13px] font-medium">{person.name}</p>
                    <p className="text-muted-foreground text-[12px]">
                      {[person.roleTitle, person.company].filter(Boolean).join(" · ") ||
                        "No company / role"}
                    </p>
                    {person.email ? (
                      <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                        {person.email}
                      </p>
                    ) : (
                      <p className="text-muted-foreground/80 mt-0.5 text-[11px]">
                        No outreach email set
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPersonId(person.id);
                        setPersonForm({
                          name: person.name,
                          email: person.email ?? "",
                          company: person.company ?? "",
                          roleTitle: person.roleTitle ?? "",
                          notes: person.notes ?? "",
                        });
                      }}
                      className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void archivePerson(person.id)}
                      className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                    >
                      Archive
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "follow_ups" ? (
        <section className="space-y-4">
          <div className="border-border/80 bg-card/70 space-y-2.5 rounded-2xl border p-4">
            <p className="text-foreground text-[12px] font-medium">New follow-up</p>
            <Field
              label="Title *"
              value={fuForm.title}
              onChange={(v) => setFuForm((f) => ({ ...f, title: v }))}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-foreground text-[12px] font-medium">Due date</span>
                <input
                  type="date"
                  value={fuForm.dueDate}
                  onChange={(e) => setFuForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-foreground text-[12px] font-medium">Linked person</span>
                <select
                  value={fuForm.personId}
                  onChange={(e) => setFuForm((f) => ({ ...f, personId: e.target.value }))}
                  className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-2.5 text-[13px]"
                >
                  <option value="">None</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-foreground text-[12px] font-medium">Notes</span>
              <textarea
                value={fuForm.notes}
                onChange={(e) => setFuForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px]"
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() => void createFollowUp()}
              className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add follow-up"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              Tasks ({visibleFollowUps.length})
            </h2>
            <label className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShowClosed(next);
                  void reloadFollowUps(next);
                }}
              />
              Show done / dismissed
            </label>
          </div>

          {visibleFollowUps.length === 0 ? (
            <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-[13px]">
              No follow-ups yet — add a reminder after a referral ask.
            </div>
          ) : (
            <ul className="space-y-2">
              {visibleFollowUps.map((task) => {
                const person = task.personId ? peopleById.get(task.personId) : null;
                return (
                  <li
                    key={task.id}
                    className="border-border/80 bg-card/70 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-foreground text-[13px] font-medium">
                        {task.title}
                        <span
                          className={cn(
                            "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            task.status === "pending"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {task.status}
                        </span>
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-[12px]">
                        {task.dueDate ? `Due ${task.dueDate}` : "No due date"}
                        {person ? ` · ${person.name}` : ""}
                      </p>
                      {task.notes ? (
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-[12px]">
                          {task.notes}
                        </p>
                      ) : null}
                    </div>
                    {task.status === "pending" ? (
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => void setFollowUpStatus(task.id, "done")}
                          className="border-border text-foreground hover:text-primary inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          onClick={() => void setFollowUpStatus(task.id, "dismissed")}
                          className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void setFollowUpStatus(task.id, "pending")}
                        className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                      >
                        Reopen
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-foreground text-[12px] font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
      />
    </label>
  );
}
