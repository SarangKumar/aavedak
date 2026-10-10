"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { FriendsInviteCard } from "@/components/friends-invite-card";
import { GmailConnectBanner } from "@/components/gmail-connect-banner";
import {
  CareerProfileFields,
  careerToFormState,
  formStateToCareerPatch,
  type CareerFormState,
} from "@/components/career-profile-fields";
import { ShellWidth } from "@/components/shell-width";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PROFILE_BIO_MAX } from "@/lib/profile-limits";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
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
import { emptyCareerProfile, type CareerProfile } from "@/lib/career-profile";
import {
  emptyProfileLinks,
  MAX_CUSTOM_PROFILE_LINKS,
  PROFILE_LINK_KEYS,
  PROFILE_LINK_META,
  profileLinkUrlFromUsername,
  profileLinkUsernameFromUrl,
  type ProfileCustomLink,
  type ProfileLinkKey,
  type ProfileLinks,
} from "@/lib/profile-links";
import {
  emptyProfileProject,
  MAX_PROFILE_PROJECTS,
  MAX_PROJECT_DESCRIPTION,
  type ProfileProject,
} from "@/lib/profile-projects";
import { cn } from "@/lib/utils";

export type ProfileSettingsProfile = {
  username: string;
  name: string | null;
  bio: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  links?: ProfileLinks;
  customLinks?: ProfileCustomLink[];
  projects?: ProfileProject[];
  career?: CareerProfile;
};

export type ProfileSettingsResume = {
  id: string;
  displayName: string;
  status: "active" | "inactive" | "archived";
  originalFilename: string;
  byteSize: number;
};

type Props = {
  profile: ProfileSettingsProfile;
  initialResumes: ProfileSettingsResume[];
  /** Daily job discovery preference (defaults to on). */
  initialDiscoveryEnabled?: boolean;
  /** When set (inline edit from profile page), show Cancel back to view. */
  onCancel?: () => void;
};

type SettingsSection =
  "public" | "links" | "projects" | "career" | "discovery" | "resume" | "access" | "danger";

const SETTINGS_NAV: Array<{
  group: string;
  items: Array<{ id: SettingsSection; label: string }>;
}> = [
  {
    group: "Profile",
    items: [
      { id: "public", label: "Public profile" },
      { id: "links", label: "Links" },
      { id: "projects", label: "Projects" },
    ],
  },
  {
    group: "Preferences",
    items: [
      { id: "career", label: "Career" },
      { id: "discovery", label: "Job discovery" },
      { id: "resume", label: "Showcase resume" },
    ],
  },
  {
    group: "Account",
    items: [
      { id: "access", label: "Access & Gmail" },
      { id: "danger", label: "Danger zone" },
    ],
  },
];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function linksFromProfile(profile: ProfileSettingsProfile): ProfileLinks {
  const base = emptyProfileLinks();
  const fromApi = profile.links ?? {};
  for (const key of PROFILE_LINK_KEYS) {
    base[key] = fromApi[key] ?? null;
  }
  if (!base.portfolio) base.portfolio = profile.portfolioUrl;
  if (!base.linkedin) base.linkedin = profile.linkedinUrl;
  return base;
}

function usernameDraftsFromLinks(links: ProfileLinks): Partial<Record<ProfileLinkKey, string>> {
  const drafts: Partial<Record<ProfileLinkKey, string>> = {};
  for (const key of PROFILE_LINK_KEYS) {
    if (PROFILE_LINK_META[key].baseUrl) {
      drafts[key] = profileLinkUsernameFromUrl(key, links[key]);
    }
  }
  return drafts;
}

function SettingsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-5">
      <div className="border-border space-y-1 border-b pb-4">
        <h2 className="text-foreground text-xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SettingsBlock({
  title,
  description,
  children,
  danger,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-3 border-b py-5 first:pt-0 last:border-b-0 last:pb-0",
        danger ? "border-destructive/30" : "border-border",
      )}
    >
      <div className="space-y-0.5">
        <h3
          className={cn(
            "text-[13px] font-semibold tracking-tight",
            danger ? "text-destructive" : "text-foreground",
          )}
        >
          {title}
        </h3>
        {description ? (
          <p className="text-muted-foreground text-[11px] leading-relaxed">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function ProfileSettings({
  profile,
  initialResumes,
  initialDiscoveryEnabled = true,
  onCancel,
}: Props) {
  const router = useRouter();
  const [section, setSection] = useState<SettingsSection>("public");
  const [name, setName] = useState(profile.name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const initialLinks = useMemo(() => linksFromProfile(profile), [profile]);
  const [links, setLinks] = useState<ProfileLinks>(() => initialLinks);
  const [usernameDrafts, setUsernameDrafts] = useState(() => usernameDraftsFromLinks(initialLinks));
  const [customLinks, setCustomLinks] = useState<ProfileCustomLink[]>(() =>
    (profile.customLinks ?? []).map((c) => ({ title: c.title, url: c.url })),
  );
  const [projects, setProjects] = useState<ProfileProject[]>(() =>
    (profile.projects ?? []).map((p) => ({ ...p })),
  );
  const [previewPending, setPreviewPending] = useState<string | null>(null);
  const faviconTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [career, setCareer] = useState<CareerFormState>(() =>
    careerToFormState(profile.career ?? emptyCareerProfile()),
  );
  const [resumes, setResumes] = useState(initialResumes);
  const [discoveryEnabled, setDiscoveryEnabled] = useState(initialDiscoveryEnabled);
  const [discoveryPending, setDiscoveryPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [careerPending, setCareerPending] = useState(false);
  const [resumePending, setResumePending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [careerSaved, setCareerSaved] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeSaved, setWipeSaved] = useState(false);

  const showcaseId = useMemo(
    () => resumes.find((r) => r.status === "active")?.id ?? null,
    [resumes],
  );

  function setLink(key: ProfileLinkKey, value: string) {
    setLinks((prev) => ({ ...prev, [key]: value }));
  }

  function setUsernameDraft(key: ProfileLinkKey, username: string) {
    setUsernameDrafts((prev) => ({ ...prev, [key]: username }));
    setLinks((prev) => ({
      ...prev,
      [key]: profileLinkUrlFromUsername(key, username),
    }));
  }

  function setCustomLink(index: number, patch: Partial<ProfileCustomLink>) {
    setCustomLinks((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addCustomLink() {
    setCustomLinks((prev) => {
      if (prev.length >= MAX_CUSTOM_PROFILE_LINKS) return prev;
      return [...prev, { title: "", url: "" }];
    });
  }

  function removeCustomLink(index: number) {
    setCustomLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function setProject(index: number, patch: Partial<ProfileProject>) {
    setProjects((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addProject() {
    setProjects((prev) => {
      if (prev.length >= MAX_PROFILE_PROJECTS) return prev;
      return [...prev, emptyProfileProject()];
    });
  }

  function removeProject(index: number) {
    setProjects((prev) => prev.filter((_, i) => i !== index));
  }

  async function fetchProjectFavicon(projectId: string, url: string) {
    const trimmed = url.trim();
    if (!trimmed) {
      setProjects((prev) =>
        prev.map((row) => (row.id === projectId ? { ...row, faviconUrl: null } : row)),
      );
      return;
    }
    setPreviewPending(projectId);
    try {
      const res = await fetch("/api/link-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json()) as {
        error?: string;
        preview?: { faviconUrl: string | null };
      };
      if (!res.ok) return;
      setProjects((prev) =>
        prev.map((row) =>
          row.id === projectId
            ? {
                ...row,
                imageUrl: null,
                faviconUrl: data.preview?.faviconUrl ?? null,
              }
            : row,
        ),
      );
    } catch {
      // Keep the form calm — favicon is best-effort.
    } finally {
      setPreviewPending((cur) => (cur === projectId ? null : cur));
    }
  }

  function scheduleFaviconFetch(projectId: string, url: string) {
    const existing = faviconTimers.current.get(projectId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      faviconTimers.current.delete(projectId);
      void fetchProjectFavicon(projectId, url);
    }, 450);
    faviconTimers.current.set(projectId, timer);
  }

  function setProjectUrl(index: number, projectId: string, url: string) {
    setProjects((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, url, faviconUrl: url.trim() ? row.faviconUrl : null } : row,
      ),
    );
    scheduleFaviconFetch(projectId, url);
  }

  function buildPayloadLinks(): ProfileLinks {
    const payloadLinks: ProfileLinks = {};
    for (const key of PROFILE_LINK_KEYS) {
      if (PROFILE_LINK_META[key].baseUrl) {
        payloadLinks[key] = profileLinkUrlFromUsername(key, usernameDrafts[key] ?? "");
      } else {
        payloadLinks[key] = links[key]?.trim() || null;
      }
    }
    return payloadLinks;
  }

  async function savePublicProfile() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const payloadCustom = customLinks
        .map((c) => ({ title: c.title.trim(), url: c.url.trim() }))
        .filter((c) => c.title && c.url);
      const payloadProjects = projects
        .map((p) => ({
          ...p,
          title: p.title.trim(),
          url: p.url.trim(),
          description: p.description.trim(),
          imageUrl: null,
        }))
        .filter((p) => p.title);
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          bio: bio.trim() || null,
          links: buildPayloadLinks(),
          customLinks: payloadCustom,
          projects: payloadProjects,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save profile.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setPending(false);
    }
  }

  async function saveCareer() {
    setCareerPending(true);
    setError(null);
    setCareerSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ career: formStateToCareerPatch(career) }),
      });
      const data = (await res.json()) as {
        error?: string;
        rerank?: { rescored: number; dropped: number; added: number } | { error: string } | null;
      };
      if (!res.ok) throw new Error(data.error || "Could not save career preferences.");
      setCareerSaved(true);
      if (data.rerank && "error" in data.rerank) {
        setError(`Career preferences saved, but jobs were not re-ranked: ${data.rerank.error}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save career preferences.");
    } finally {
      setCareerPending(false);
    }
  }

  async function setResumeStatus(id: string, status: "active" | "inactive") {
    setResumePending(id);
    setError(null);
    try {
      const res = await fetch(`/api/resumes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as {
        error?: string;
        resume?: ProfileSettingsResume;
      };
      if (!res.ok) throw new Error(data.error || "Could not update resume.");
      const listRes = await fetch("/api/resumes");
      const listData = (await listRes.json()) as { resumes?: ProfileSettingsResume[] };
      if (listRes.ok) setResumes(listData.resumes ?? []);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update resume.");
    } finally {
      setResumePending(null);
    }
  }

  async function saveDiscovery(next: boolean) {
    setDiscoveryPending(true);
    setDiscoveryEnabled(next);
    try {
      const res = await fetch("/api/preferences/tracker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discoveryEnabled: next }),
      });
      if (!res.ok) throw new Error("Could not save.");
      toast.add({
        title: next ? "Daily discovery on" : "Daily discovery paused",
        description: next
          ? "New matching roles will appear on Jobs → Discover."
          : "No new recommendations until you turn it back on. Existing ones stay.",
        type: "success",
      });
    } catch {
      setDiscoveryEnabled(!next);
      toast.add({ title: "Could not update discovery", type: "error" });
    } finally {
      setDiscoveryPending(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: deleteConfirm.trim() }),
      });
      const data = (await res.json()) as { error?: string; redirectTo?: string };
      if (!res.ok) throw new Error(data.error || "Could not delete account.");
      window.location.assign(data.redirectTo || "/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete account.");
      setDeleting(false);
    }
  }

  async function wipeAccountData() {
    setWiping(true);
    setWipeError(null);
    setWipeSaved(false);
    try {
      const res = await fetch("/api/account/wipe-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: wipeConfirm.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not delete account data.");
      setWipeOpen(false);
      setWipeConfirm("");
      setWipeSaved(true);
      setResumes([]);
      router.refresh();
    } catch (err) {
      setWipeError(err instanceof Error ? err.message : "Could not delete account data.");
    } finally {
      setWiping(false);
    }
  }

  const canDelete = deleteConfirm.trim().toLowerCase() === profile.username.toLowerCase();
  const canWipe = wipeConfirm.trim().toLowerCase() === profile.username.toLowerCase();

  const sectionTitle =
    SETTINGS_NAV.flatMap((g) => g.items).find((i) => i.id === section)?.label ?? "Settings";

  return (
    <ShellWidth className="aavedak-fade-up py-7 sm:py-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            @{profile.username}
          </p>
          <h1 className="aavedak-display text-foreground text-xl tracking-tight sm:text-2xl">
            Settings
          </h1>
          <p className="text-muted-foreground max-w-xl text-[13px]">
            Manage your public profile, projects, and account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onCancel ? (
            <Button variant="outline" size="sm" type="button" onClick={onCancel}>
              Done
            </Button>
          ) : (
            <Link
              href={`/${profile.username}`}
              className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-md border px-2.5 text-[12px]"
            >
              View profile
            </Link>
          )}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {saved ? (
        <Alert className="mb-4">
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      ) : null}
      {careerSaved ? (
        <p className="text-primary mb-4 text-[12px]">Career preferences saved.</p>
      ) : null}

      <div className="flex flex-col gap-2 lg:flex-row lg:gap-2">
        <aside className="lg:w-52 lg:shrink-0">
          <nav className="border-border/80 bg-card ring-ring/10 hidden space-y-4 rounded-lg border p-2 shadow-sm ring-1 lg:sticky lg:top-20 lg:block">
            {SETTINGS_NAV.map((group) => (
              <div key={group.group} className="space-y-1">
                <p className="text-muted-foreground px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide">
                  {group.group}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = section === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSection(item.id);
                            setError(null);
                            setSaved(false);
                            setCareerSaved(false);
                          }}
                          className={cn(
                            "flex w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors",
                            active
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            item.id === "danger" && !active ? "text-destructive/80" : null,
                            item.id === "danger" && active ? "text-destructive" : null,
                          )}
                        >
                          {item.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          {/* Mobile section select */}
          <div className="mt-3 lg:hidden">
            <Select
              value={section}
              onValueChange={(v) => {
                if (!v) return;
                setSection(v as SettingsSection);
              }}
            >
              <SelectTrigger className="border-border bg-background h-9 w-full rounded-md border text-[12px]">
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent className="z-[240]">
                {SETTINGS_NAV.flatMap((g) => g.items).map((item) => (
                  <SelectItem key={item.id} value={item.id} className="text-[12px]">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </aside>

        <main className="border-border/80 bg-card ring-ring/10 min-w-0 flex-1 rounded-lg border p-4 shadow-sm ring-1 sm:p-5">
          {section === "public" ? (
            <SettingsPanel
              title={sectionTitle}
              description="How you appear on your shareable Aavedak profile."
            >
              <SettingsBlock title="Display name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="John Doe"
                />
              </SettingsBlock>
              <SettingsBlock title="Bio" description="A short intro shown on your public profile.">
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={PROFILE_BIO_MAX}
                  showCount
                  maxRows={12}
                  rows={3}
                  placeholder="A short intro for your shareable profile"
                  className="py-2"
                />
              </SettingsBlock>
              <div className="pt-1">
                <Button
                  type="button"
                  size="sm"
                  loading={pending}
                  onClick={() => void savePublicProfile()}
                >
                  Save changes
                </Button>
              </div>
            </SettingsPanel>
          ) : null}

          {section === "links" ? (
            <SettingsPanel
              title={sectionTitle}
              description="Platform links only need your username. Empty fields stay hidden on your public profile."
            >
              <SettingsBlock title="Platforms">
                <div className="grid gap-3 sm:grid-cols-2">
                  {PROFILE_LINK_KEYS.map((key) => {
                    const meta = PROFILE_LINK_META[key];
                    const baseUrl = meta.baseUrl;
                    if (baseUrl) {
                      return (
                        <label key={key} className="space-y-1">
                          <span className="text-muted-foreground text-[11px] font-medium">
                            {meta.label}
                          </span>
                          <InputGroup className="h-8 min-h-8 gap-0 overflow-hidden px-0">
                            <InputGroupText
                              className="bg-muted/60 border-border flex h-full max-w-[55%] items-center truncate border-r px-2 text-[10px] leading-none sm:max-w-none sm:text-[11px]"
                              title={baseUrl}
                            >
                              {baseUrl}
                            </InputGroupText>
                            <InputGroupInput
                              value={usernameDrafts[key] ?? ""}
                              onChange={(e) => setUsernameDraft(key, e.target.value)}
                              className="h-full px-2 text-[12px]"
                              placeholder={meta.placeholder}
                              autoComplete="off"
                              spellCheck={false}
                            />
                          </InputGroup>
                        </label>
                      );
                    }
                    return (
                      <label key={key} className="space-y-1">
                        <span className="text-muted-foreground text-[11px] font-medium">
                          {meta.label}
                        </span>
                        <Input
                          value={links[key] ?? ""}
                          onChange={(e) => setLink(key, e.target.value)}
                          placeholder={meta.placeholder}
                          inputMode="url"
                          autoComplete="url"
                        />
                      </label>
                    );
                  })}
                </div>
              </SettingsBlock>

              <SettingsBlock
                title="Other links"
                description="Add any link with your own title (blog, Behance, personal site, …)."
              >
                <div className="space-y-2">
                  {customLinks.length === 0 ? (
                    <p className="text-muted-foreground text-[11px]">No custom links yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {customLinks.map((row, index) => (
                        <li
                          key={`custom-${index}`}
                          className="grid gap-2 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,1fr)_auto]"
                        >
                          <Input
                            value={row.title}
                            onChange={(e) => setCustomLink(index, { title: e.target.value })}
                            placeholder="Title"
                            maxLength={80}
                            autoComplete="off"
                          />
                          <Input
                            value={row.url}
                            onChange={(e) => setCustomLink(index, { url: e.target.value })}
                            placeholder="https://…"
                            inputMode="url"
                            autoComplete="url"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeCustomLink(index)}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={customLinks.length >= MAX_CUSTOM_PROFILE_LINKS}
                    onClick={addCustomLink}
                  >
                    Add link
                  </Button>
                </div>
              </SettingsBlock>

              <div className="pt-1">
                <Button
                  type="button"
                  size="sm"
                  loading={pending}
                  onClick={() => void savePublicProfile()}
                >
                  Save changes
                </Button>
              </div>
            </SettingsPanel>
          ) : null}

          {section === "projects" ? (
            <SettingsPanel
              title={sectionTitle}
              description="Name the project, optionally link the live site, then add a short blurb."
            >
              <SettingsBlock title="Your projects">
                <div className="space-y-3">
                  {projects.length === 0 ? (
                    <p className="text-muted-foreground text-[11px]">No projects yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {projects.map((project, index) => (
                        <li
                          key={project.id}
                          className="border-border/70 space-y-3 rounded-md border p-3"
                        >
                          {/* Remove sits on the title row, lined up with the title field. */}
                          <div className="flex items-end gap-2">
                            <label className="block min-w-0 flex-1 space-y-1">
                              <span className="text-muted-foreground text-[11px] font-medium">
                                Title
                              </span>
                              <Input
                                value={project.title}
                                onChange={(e) => setProject(index, { title: e.target.value })}
                                placeholder="Project name"
                                maxLength={120}
                              />
                            </label>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => removeProject(index)}
                              aria-label={`Remove ${project.title.trim() || "project"}`}
                              title="Remove project"
                              className="text-destructive hover:text-destructive"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="size-4"
                                aria-hidden
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M6 6l1 14h10l1-14" />
                              </svg>
                            </Button>
                          </div>

                          <label className="block space-y-1">
                            <span className="text-muted-foreground text-[11px] font-medium">
                              Website <span className="font-normal opacity-70">(optional)</span>
                            </span>
                            <InputGroup className="h-8 min-h-8 gap-0 overflow-hidden px-0">
                              <InputGroupAddon className="bg-muted/60 border-border flex h-full w-9 justify-center border-r">
                                {previewPending === project.id ? (
                                  <Spinner
                                    className="text-muted-foreground size-3.5"
                                    label="Fetching favicon"
                                  />
                                ) : project.faviconUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={project.faviconUrl}
                                    alt=""
                                    className="size-4 object-contain"
                                  />
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">◈</span>
                                )}
                              </InputGroupAddon>
                              <InputGroupInput
                                value={project.url}
                                onChange={(e) => setProjectUrl(index, project.id, e.target.value)}
                                className="h-full px-2.5 text-[12px]"
                                placeholder="https://your-app.com"
                                inputMode="url"
                                autoComplete="url"
                              />
                            </InputGroup>
                          </label>

                          <label className="block space-y-1">
                            <span className="text-muted-foreground text-[11px] font-medium">
                              Description
                            </span>
                            <Textarea
                              value={project.description}
                              onChange={(e) =>
                                setProject(index, {
                                  description: e.target.value.slice(0, MAX_PROJECT_DESCRIPTION),
                                })
                              }
                              maxLength={MAX_PROJECT_DESCRIPTION}
                              placeholder="One or two lines on what it does…"
                              className="h-16 resize-y py-2"
                            />
                            <span className="text-muted-foreground block text-right text-[10px] tabular-nums">
                              {project.description.length}/{MAX_PROJECT_DESCRIPTION}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={projects.length >= MAX_PROFILE_PROJECTS}
                    onClick={addProject}
                  >
                    Add project
                  </Button>
                </div>
              </SettingsBlock>
              <div className="pt-1">
                <Button
                  type="button"
                  size="sm"
                  loading={pending}
                  onClick={() => void savePublicProfile()}
                >
                  Save changes
                </Button>
              </div>
            </SettingsPanel>
          ) : null}

          {section === "career" ? (
            <SettingsPanel
              title={sectionTitle}
              description="Used for job selection and matching. Same fields you set during onboarding."
            >
              <CareerProfileFields
                value={career}
                onChange={setCareer}
                compact
                idPrefix="settings-career"
              />
              <div className="border-border border-t pt-4">
                <Button
                  type="button"
                  size="sm"
                  loading={careerPending}
                  onClick={() => void saveCareer()}
                >
                  Save career preferences
                </Button>
              </div>
            </SettingsPanel>
          ) : null}

          {section === "discovery" ? (
            <SettingsPanel
              title={sectionTitle}
              description="Aavedak scans company career pages daily for junior engineering roles in India and recommends up to 50 new matches a day, ranked against your resume and career preferences."
            >
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[13px]">
                    Daily recommendations
                    <Badge variant={discoveryEnabled ? "default" : "secondary"}>
                      {discoveryEnabled ? "On" : "Paused"}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-[12px]">
                    Recommendations stay on Jobs → Discover until you apply or ignore them. Jobs
                    older than 30 days from posting leave both tabs automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-[12px]">
                    <Switch
                      id="discovery-enabled"
                      checked={discoveryEnabled}
                      disabled={discoveryPending}
                      onCheckedChange={(next) => void saveDiscovery(next)}
                      aria-label="Enable daily job discovery"
                    />
                    <label htmlFor="discovery-enabled" className="text-foreground cursor-pointer">
                      Enable daily job discovery
                    </label>
                    {discoveryPending ? <Spinner className="size-3.5" label="Saving" /> : null}
                  </div>
                </CardContent>
              </Card>
            </SettingsPanel>
          ) : null}

          {section === "resume" ? (
            <SettingsPanel
              title={`${sectionTitle} (${resumes.length})`}
              description="Exactly one resume can be Active for your public profile. Activating another demotes the current showcase."
            >
              <div className="mb-3">
                <Link
                  href="/documents"
                  className="text-muted-foreground hover:text-foreground text-[11px] font-medium"
                >
                  Upload in Documents →
                </Link>
              </div>
              {resumes.length === 0 ? (
                <div className="border-border/70 text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-[12px]">
                  No resumes yet — upload a PDF from Documents.
                </div>
              ) : (
                <ul className="space-y-2">
                  {resumes.map((resume) => {
                    const isShowcase = resume.id === showcaseId;
                    return (
                      <li
                        key={resume.id}
                        className="border-border/70 bg-background/50 flex flex-col gap-2 rounded-md border p-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-[12px] font-medium">
                            {resume.displayName}
                            {isShowcase ? (
                              <span className="bg-primary/15 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                Showcase
                              </span>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground truncate text-[11px]">
                            {resume.originalFilename} · {formatBytes(resume.byteSize)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {resumePending === resume.id ? (
                            <Spinner
                              className="text-muted-foreground size-3.5"
                              label="Updating resume"
                            />
                          ) : null}
                          <a
                            href={`/api/resumes/${resume.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="border-border text-muted-foreground hover:text-foreground inline-flex h-7 items-center rounded-md border px-2 text-[11px]"
                          >
                            Open
                          </a>
                          <Select
                            value={resume.status === "active" ? "active" : "inactive"}
                            onValueChange={(v) => {
                              if (!v || v === resume.status) return;
                              void setResumeStatus(resume.id, v as "active" | "inactive");
                            }}
                            disabled={resumePending === resume.id}
                          >
                            <SelectTrigger className="border-border bg-background text-foreground h-7 w-[7.5rem] rounded-md border px-2 text-[11px]">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="z-[240]">
                              <SelectItem value="active" className="text-[12px]">
                                Active (showcase)
                              </SelectItem>
                              <SelectItem value="inactive" className="text-[12px]">
                                Inactive
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SettingsPanel>
          ) : null}

          {section === "access" ? (
            <SettingsPanel
              title={sectionTitle}
              description="Friends invites and Gmail authorization for queued referral follow-ups."
            >
              <SettingsBlock title="Friends">
                <FriendsInviteCard />
              </SettingsBlock>
              <SettingsBlock
                title="Gmail send"
                description="Queued referral follow-ups send from your Google inbox after ~10 minutes. Re-authorize if send fails or you previously signed in without the gmail.send scope."
              >
                <GmailConnectBanner callbackURL={`/${profile.username}/settings`} />
              </SettingsBlock>
            </SettingsPanel>
          ) : null}

          {section === "danger" ? (
            <SettingsPanel
              title={sectionTitle}
              description="Irreversible actions. People you added for referrals are never removed from the shared directory."
            >
              {wipeSaved ? (
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  Account data deleted. Your account and people contacts were kept.
                </p>
              ) : null}
              <SettingsBlock
                title="Delete all account data"
                description="Remove applications, resumes, jobs, templates, cover letters, and follow-ups. Keeps your account and people you added."
                danger
              >
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setWipeConfirm("");
                    setWipeError(null);
                    setWipeSaved(false);
                    setWipeOpen(true);
                  }}
                >
                  Delete data
                </Button>
              </SettingsBlock>
              <SettingsBlock
                title="Delete account"
                description="Permanently delete your account and all personal data. You will be signed out."
                danger
              >
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDeleteConfirm("");
                    setDeleteError(null);
                    setDeleteOpen(true);
                  }}
                >
                  Delete account
                </Button>
              </SettingsBlock>
            </SettingsPanel>
          ) : null}
        </main>
      </div>

      <Dialog
        open={wipeOpen}
        onOpenChange={(next) => {
          if (!next) (() => (!wiping ? setWipeOpen(false) : undefined))();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all account data</DialogTitle>
            <DialogDescription>
              This cannot be undone. Applications, resumes, jobs, and related data will be removed.
              Your account and people contacts stay.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-muted-foreground text-[12px] leading-relaxed">
              Type your username{" "}
              <span className="text-foreground font-semibold">@{profile.username}</span> to confirm.
            </p>
            <Input
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value)}
              placeholder={profile.username}
              autoComplete="off"
              className="h-9 rounded-md text-[13px]"
              disabled={wiping}
            />
            {wipeError ? (
              <Alert variant="destructive">
                <AlertDescription>{wipeError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={wiping}
                onClick={() => setWipeOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                loading={wiping}
                loadingText="Deleting…"
                disabled={!canWipe}
                onClick={() => void wipeAccountData()}
              >
                Delete data
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (!next) (() => (!deleting ? setDeleteOpen(false) : undefined))();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              This cannot be undone. Resumes in storage and all tracker data will be removed. Shared
              people contacts are kept.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-muted-foreground text-[12px] leading-relaxed">
              Type your username{" "}
              <span className="text-foreground font-semibold">@{profile.username}</span> to confirm.
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={profile.username}
              autoComplete="off"
              className="h-9 rounded-md text-[13px]"
              disabled={deleting}
            />
            {deleteError ? (
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                loading={deleting}
                loadingText="Deleting…"
                disabled={!canDelete}
                onClick={() => void deleteAccount()}
              >
                Delete forever
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ShellWidth>
  );
}
