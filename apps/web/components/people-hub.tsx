"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ShellWidth } from "@/components/shell-width";
import { Badge } from "@/components/ui/badge";
import { PersonEmail, PersonSourceBadges } from "@/components/person-source-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompanySelect } from "@/components/company-select";
import { PersonVote, personInitials, type VoteSummaryDto } from "@/components/person-vote";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/search-input";

export type PersonDto = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  roleTitle: string | null;
  notes: string | null;
  applicationId: string | null;
  status: "active" | "archived";
  /** `system` = added by admin bulk discovery. */
  origin?: "system" | "user";
  linkedin?: string | null;
  /** Public GitHub profile (people discovered from GitHub). */
  githubUrl?: string | null;
  discoverySource?: string | null;
  confidence?: number | null;
  inferredEmail?: string | null;
  inferredEmailConfidence?: number | null;
  /** Absent on single-person API responses; merged from the existing row. */
  votes?: VoteSummaryDto;
  createdAt: string;
  updatedAt: string;
};

/** `octocat` from https://github.com/octocat. */
function githubHandle(url: string | null | undefined): string | null {
  const m = url?.match(/github\.com\/([A-Za-z0-9-]+)\/?$/i);
  return m ? m[1]! : null;
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-3.5 fill-current", className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const NO_VOTES: VoteSummaryDto = { up: 0, down: 0, mine: 0, replies: 0 };

export type ApplicationLite = {
  id: string;
  companyName: string;
  role: string;
};

type Draft = {
  name: string;
  email: string;
  company: string;
  roleTitle: string;
  linkedin: string;
  notes: string;
  applicationId: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  email: "",
  company: "",
  roleTitle: "",
  linkedin: "",
  notes: "",
  applicationId: "",
});

type Props = {
  initialPeople: PersonDto[];
  applications: ApplicationLite[];
};

export function PeopleHub({ initialPeople, applications }: Props) {
  const [people, setPeople] = useState(initialPeople);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PersonDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appsById = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (!showArchived && p.status === "archived") return false;
      if (!q) return true;
      const hay = [p.name, p.email ?? "", p.company ?? "", p.roleTitle ?? "", p.notes ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [people, query, showArchived]);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
    setDrawerOpen(true);
  }

  function openEdit(person: PersonDto) {
    setEditingId(person.id);
    setDraft({
      name: person.name,
      email: person.email ?? "",
      company: person.company ?? "",
      roleTitle: person.roleTitle ?? "",
      linkedin: person.linkedin ?? "",
      notes: person.notes ?? "",
      applicationId: person.applicationId ?? "",
    });
    setError(null);
    setDrawerOpen(true);
  }

  async function savePerson() {
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: draft.name.trim(),
      email: draft.email.trim() || null,
      company: draft.company.trim() || null,
      roleTitle: draft.roleTitle.trim() || null,
      linkedin: draft.linkedin.trim() || null,
      notes: draft.notes.trim() || null,
      applicationId: draft.applicationId || null,
    };
    try {
      if (editingId) {
        const res = await fetch(`/api/people/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { person?: PersonDto; error?: string };
        if (!res.ok || !data.person) throw new Error(data.error || "Update failed.");
        setPeople((list) => list.map((p) => (p.id === editingId ? { ...p, ...data.person! } : p)));
      } else {
        const res = await fetch("/api/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { person?: PersonDto; error?: string };
        if (!res.ok || !data.person) throw new Error(data.error || "Create failed.");
        setPeople((list) => [data.person!, ...list]);
      }
      setDrawerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function archivePerson(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/people/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { person?: PersonDto; error?: string };
      if (!res.ok || !data.person) throw new Error(data.error || "Archive failed.");
      setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...data.person! } : p)));
      if (editingId === id) setDrawerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function deletePersonForever(person: PersonDto): Promise<boolean> {
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${person.id}?permanent=1`, { method: "DELETE" });
      const data = (await res.json()) as { deleted?: boolean; error?: string };
      if (!res.ok || !data.deleted) throw new Error(data.error || "Delete failed.");
      setPeople((list) => list.filter((p) => p.id !== person.id));
      if (editingId === person.id) setDrawerOpen(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      return false;
    } finally {
      setDeleteBusy(false);
    }
  }

  async function restorePerson(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/people/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const data = (await res.json()) as { person?: PersonDto; error?: string };
      if (!res.ok || !data.person) throw new Error(data.error || "Restore failed.");
      setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...data.person! } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ShellWidth className="aavedak-fade-up space-y-6 py-8 sm:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-primary/90 font-mono text-[12px] tracking-wide">CRM</p>
          <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">People</h1>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            Shared referral directory — contacts stay available even if the person who added them
            deletes their account.
          </p>
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            Contacts for warm intros and cold outreach. Use them from{" "}
            <Link href="/referrals" className="text-primary hover:underline">
              Referrals
            </Link>{" "}
            and track asks on{" "}
            <Link href="/outreach" className="text-primary hover:underline">
              Outreach
            </Link>
            .
          </p>
        </div>
        <Button onClick={openCreate}>+ New person</Button>
      </header>

      {error ? (
        <p
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12px]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          className="h-9 sm:max-w-sm"
          placeholder="Search name, email, company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
        />
        <Button
          size="sm"
          variant={showArchived ? "default" : "outline"}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Showing archived" : "Show archived"}
        </Button>
      </div>

      <Card className="border-border/80 bg-card gap-0 overflow-hidden rounded-lg border p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>GitHub</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Linked app</TableHead>
              <TableHead>Status</TableHead>
              <TableHead title="Community signal — not proof they will refer">Community</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground py-8 text-center text-[13px]"
                >
                  No people yet. Add a contact to use in referrals.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((person) => {
                const app = person.applicationId ? appsById.get(person.applicationId) : null;
                const busy = busyId === person.id;
                return (
                  <TableRow key={person.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-[10px]">
                            {personInitials(person.name)}
                          </AvatarFallback>
                        </Avatar>
                        {person.githubUrl || person.linkedin ? (
                          <a
                            href={person.githubUrl || person.linkedin || undefined}
                            target="_blank"
                            rel="noreferrer"
                            title={
                              person.githubUrl ? "Open GitHub profile" : "Open LinkedIn profile"
                            }
                            className="text-foreground cursor-pointer text-[13px] font-medium hover:underline"
                          >
                            {person.name}
                          </a>
                        ) : (
                          <span className="text-foreground text-[13px] font-medium">
                            {person.name}
                          </span>
                        )}
                        <PersonSourceBadges person={person} />
                        {person.linkedin ? (
                          <a
                            href={person.linkedin}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground text-[11px]"
                          >
                            in
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[12px]">
                      {githubHandle(person.githubUrl) ? (
                        <a
                          href={person.githubUrl ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-foreground inline-flex cursor-pointer items-center gap-1"
                        >
                          <GitHubMark />@{githubHandle(person.githubUrl)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[12px]">
                      <PersonEmail email={person.email} person={person} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[12px]">
                      {person.company ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[12px]">
                      {person.roleTitle ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-40 truncate text-[12px]">
                      {app ? `${app.companyName} · ${app.role}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={person.status === "active" ? "secondary" : "outline"}>
                        {person.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PersonVote personId={person.id} initial={person.votes ?? NO_VOTES} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        <Button size="xs" variant="outline" onClick={() => openEdit(person)}>
                          Edit
                        </Button>
                        {person.status === "active" ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void archivePerson(person.id)}
                          >
                            {busy ? "…" : "Archive"}
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void restorePerson(person.id)}
                          >
                            {busy ? "…" : "Restore"}
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() => setDeleting(person)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet
        open={drawerOpen}
        onOpenChange={(next) => {
          if (!next) setDrawerOpen(false);
        }}
      >
        <SheetContent className="w-full max-w-md sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="aavedak-display text-lg font-normal">
              {editingId ? "Edit person" : "New person"}
            </SheetTitle>
            <SheetDescription className="text-[12px] leading-relaxed">
              Contacts are scoped to your account and usable in Referrals.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <div className="space-y-3 pt-2">
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Name
                </span>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Jane Doe"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Email
                </span>
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                  placeholder="jane@example.com"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Company
                </span>
                <CompanySelect
                  value={draft.company}
                  onChange={(name) => setDraft((d) => ({ ...d, company: name }))}
                  placeholder="e.g. Acme"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Role
                </span>
                <Input
                  value={draft.roleTitle}
                  onChange={(e) => setDraft((d) => ({ ...d, roleTitle: e.target.value }))}
                  placeholder="Engineering Manager"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  LinkedIn
                </span>
                <Input
                  type="url"
                  inputMode="url"
                  value={draft.linkedin}
                  onChange={(e) => setDraft((d) => ({ ...d, linkedin: e.target.value }))}
                  placeholder="linkedin.com/in/jane-doe"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Linked application
                </span>
                <select
                  className="border-border bg-input text-foreground box-border flex h-9 w-full rounded-md border px-3 text-sm"
                  value={draft.applicationId}
                  onChange={(e) => setDraft((d) => ({ ...d, applicationId: e.target.value }))}
                >
                  <option value="">None</option>
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.companyName} · {a.role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Notes
                </span>
                <Textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  rows={3}
                  placeholder="How you met, what to ask…"
                  className="min-h-22 resize-y py-2"
                />
              </label>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={() => void savePerson()} loading={saving}>
                  {editingId ? "Save changes" : "Create person"}
                </Button>
                <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                {editingId ? (
                  <Button
                    variant="destructive"
                    className={cn("ml-auto")}
                    disabled={saving || busyId === editingId}
                    onClick={() => void archivePerson(editingId)}
                  >
                    Archive
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the person, and their Inbox chats, replies and queued
              follow-ups will be removed too. Emails already sent through Gmail can&apos;t be
              recalled; they only disappear from Aavedak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="cursor-pointer"
              loading={deleteBusy}
              onClick={(e) => {
                e.preventDefault();
                if (!deleting) return;
                void deletePersonForever(deleting).then((ok) => {
                  if (ok) setDeleting(null);
                });
              }}
            >
              Delete person and chats
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShellWidth>
  );
}
