"use client";

import { FeatureHeading } from "@/components/feature-heading";
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
import React, { useMemo, useState } from "react";

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
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Archive, ArchiveRestore, Check, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { CompanySelect } from "@/components/company-select";
import { PersonVote, personInitials, type VoteSummaryDto } from "@/components/person-vote";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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
  /** "City, Country" from discovery's parsed location; null when unknown. */
  location?: string | null;
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

type PersonRow = {
  id: string;
  person: PersonDto;
  name: string;
  company: string;
  role: string;
  email: string;
  location: string;
  github: string;
  source: string;
  linkedApp: string;
  status: PersonDto["status"];
};

/** Plain text for sorting/searching the Source column (badges render the visual). */
function sourceLabel(p: PersonDto): string {
  return [p.origin === "system" ? "discovered" : "added", p.discoverySource ?? ""]
    .filter(Boolean)
    .join(" ");
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground block truncate text-[12px]">{children}</span>;
}

function CopyIconButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy email"}
      title={copied ? "Copied" : "Copy email"}
      className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-0.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked; nothing to do.
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function PersonActions({
  person,
  busy,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  person: PersonDto;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Actions for ${person.name}`}
          disabled={busy}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-3.5" />
          Edit
        </DropdownMenuItem>
        {person.status === "active" ? (
          <DropdownMenuItem onClick={onArchive}>
            <Archive className="size-3.5" />
            Archive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onRestore}>
            <ArchiveRestore className="size-3.5" />
            Restore
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

  const rows = useMemo<PersonRow[]>(
    () =>
      people
        .filter((p) => showArchived || p.status !== "archived")
        .map((p) => {
          const app = p.applicationId ? appsById.get(p.applicationId) : null;
          return {
            id: p.id,
            person: p,
            name: p.name,
            company: p.company ?? "",
            role: p.roleTitle ?? "",
            email: p.email ?? p.inferredEmail ?? "",
            location: p.location ?? "",
            github: githubHandle(p.githubUrl) ?? "",
            source: sourceLabel(p),
            linkedApp: app ? `${app.companyName} · ${app.role}` : "",
            status: p.status,
          };
        }),
    [people, showArchived, appsById],
  );

  const columns = useMemo<DataTableColumn<PersonRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
        sortable: true,
        searchable: true,
        enableHiding: false,
        width: "15rem",
        cell: (row) => {
          const p = row.person;
          const href = p.githubUrl || p.linkedin || undefined;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className="text-[10px]">{personInitials(p.name)}</AvatarFallback>
              </Avatar>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  title={p.githubUrl ? "Open GitHub profile" : "Open LinkedIn profile"}
                  className="text-foreground truncate text-[13px] font-medium hover:underline"
                >
                  {p.name}
                </a>
              ) : (
                <span className="text-foreground truncate text-[13px] font-medium">{p.name}</span>
              )}
              {p.linkedin ? (
                <a
                  href={p.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground shrink-0 text-[11px]"
                >
                  in
                </a>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "company",
        header: "Company",
        accessorKey: "company",
        sortable: true,
        searchable: true,
        cell: (row) => <Muted>{row.company || "—"}</Muted>,
      },
      {
        id: "role",
        header: "Role",
        accessorKey: "role",
        sortable: true,
        searchable: true,
        cell: (row) => <Muted>{row.role || "—"}</Muted>,
      },
      {
        id: "email",
        header: "Email",
        accessorKey: "email",
        sortable: true,
        searchable: true,
        width: "14rem",
        cell: (row) => (
          <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-[12px]">
            <span className="min-w-0 truncate">
              <PersonEmail email={row.person.email} person={row.person} />
            </span>
            {row.email ? <CopyIconButton text={row.email} /> : null}
          </span>
        ),
      },
      {
        id: "location",
        header: "Location",
        accessorKey: "location",
        sortable: true,
        searchable: true,
        cell: (row) => <Muted>{row.location || "—"}</Muted>,
      },
      {
        id: "github",
        header: "GitHub",
        accessorKey: "github",
        sortable: true,
        searchable: true,
        cell: (row) =>
          row.github ? (
            <a
              href={row.person.githubUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[12px]"
            >
              <GitHubMark />@{row.github}
            </a>
          ) : (
            <Muted>—</Muted>
          ),
      },
      {
        id: "source",
        header: "Source",
        accessorKey: "source",
        sortable: true,
        searchable: true,
        width: "9rem",
        cell: (row) => <PersonSourceBadges person={row.person} />,
      },
      {
        id: "linkedApp",
        header: "Linked app",
        accessorKey: "linkedApp",
        sortable: true,
        cell: (row) => <Muted>{row.linkedApp || "—"}</Muted>,
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        sortable: true,
        width: "6rem",
        cell: (row) => (
          <Badge variant={row.status === "active" ? "secondary" : "outline"}>{row.status}</Badge>
        ),
      },
      {
        id: "community",
        header: <span title="Community signal — not proof they will refer">Community</span>,
        width: "8rem",
        cell: (row) => <PersonVote personId={row.id} initial={row.person.votes ?? NO_VOTES} />,
      },
    ],
    [],
  );

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
          <FeatureHeading feature="people" />
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

      <div className="flex justify-end">
        <Button
          size="sm"
          variant={showArchived ? "default" : "outline"}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Showing archived" : "Show archived"}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchable
        searchPlaceholder="Search name, company, role, email, location…"
        pagination={20}
        pageSizeOptions={[10, 20, 50]}
        columnVisibility
        emptyMessage="No people yet. Add a contact to use in referrals."
        renderRowActions={(row) => (
          <PersonActions
            person={row.person}
            busy={busyId === row.id}
            onEdit={() => openEdit(row.person)}
            onArchive={() => void archivePerson(row.id)}
            onRestore={() => void restorePerson(row.id)}
            onDelete={() => setDeleting(row.person)}
          />
        )}
        actionsWidth="3rem"
      />

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
