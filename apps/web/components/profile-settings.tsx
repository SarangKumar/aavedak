"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FriendsInviteCard } from "@/components/friends-invite-card";
import { GmailConnectBanner } from "@/components/gmail-connect-banner";
import {
  CareerProfileFields,
  careerToFormState,
  formStateToCareerPatch,
  type CareerFormState,
} from "@/components/career-profile-fields";
import { ShellWidth } from "@/components/shell-width";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
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
  PROFILE_LINK_KEYS,
  PROFILE_LINK_META,
  type ProfileLinks,
} from "@/lib/profile-links";
import { cn } from "@/lib/utils";

export type ProfileSettingsProfile = {
  username: string;
  name: string | null;
  bio: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  links?: ProfileLinks;
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
  /** When set (inline edit from profile page), show Cancel back to view. */
  onCancel?: () => void;
};

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

export function ProfileSettings({ profile, initialResumes, onCancel }: Props) {
  const router = useRouter();
  const [name, setName] = useState(profile.name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [links, setLinks] = useState<ProfileLinks>(() => linksFromProfile(profile));
  const [career, setCareer] = useState<CareerFormState>(() =>
    careerToFormState(profile.career ?? emptyCareerProfile()),
  );
  const [resumes, setResumes] = useState(initialResumes);
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

  const showcaseId = useMemo(
    () => resumes.find((r) => r.status === "active")?.id ?? null,
    [resumes],
  );

  function setLink(key: (typeof PROFILE_LINK_KEYS)[number], value: string) {
    setLinks((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const payloadLinks: ProfileLinks = {};
      for (const key of PROFILE_LINK_KEYS) {
        payloadLinks[key] = links[key]?.trim() || null;
      }
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          bio: bio.trim() || null,
          links: payloadLinks,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save profile.");
      setSaved(true);
      router.refresh();
      if (onCancel) onCancel();
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
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save career preferences.");
      setCareerSaved(true);
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

  const fieldClass =
    "border-border bg-background text-foreground h-8 w-full rounded-lg border px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

  const canDelete =
    deleteConfirm.trim() === "DELETE" ||
    deleteConfirm.trim().toLowerCase() === profile.username.toLowerCase();

  return (
    <ShellWidth className="aavedak-fade-up space-y-4 py-7 sm:py-9">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            @{profile.username}
          </p>
          <h1 className="aavedak-display text-foreground text-xl tracking-tight sm:text-2xl">
            Edit profile
          </h1>
          <p className="text-muted-foreground max-w-xl text-[13px]">
            Edit how you appear on Aavedak and your career preferences for job matching. Only one
            resume can be the active showcase on your public profile.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 cursor-pointer items-center rounded-lg border px-2.5 text-[12px]"
            >
              Cancel
            </button>
          ) : (
            <Link
              href={`/${profile.username}`}
              className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
            >
              View profile
            </Link>
          )}
        </div>
      </div>

      {error ? <p className="text-destructive text-[12px]">{error}</p> : null}
      {saved ? <p className="text-primary text-[12px]">Profile saved.</p> : null}
      {careerSaved ? <p className="text-primary text-[12px]">Career preferences saved.</p> : null}

      <section className="border-border/80 bg-card ring-ring/10 space-y-3 rounded-lg border p-4 shadow-sm ring-1">
        <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Public details</h2>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-muted-foreground text-[11px] font-medium">Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              maxLength={120}
              placeholder="John Doe"
            />
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-muted-foreground text-[11px] font-medium">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={cn(fieldClass, "h-20 resize-y py-2")}
              maxLength={600}
              placeholder="A short intro for your shareable profile"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="text-foreground text-[12px] font-semibold tracking-tight">Links</h3>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Add as many as you want — empty fields stay hidden on your public profile and are
              disabled in cover-letter footers.
            </p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {PROFILE_LINK_KEYS.map((key) => (
              <label key={key} className="space-y-1">
                <span className="text-muted-foreground text-[11px] font-medium">
                  {PROFILE_LINK_META[key].label}
                </span>
                <input
                  value={links[key] ?? ""}
                  onChange={(e) => setLink(key, e.target.value)}
                  className={fieldClass}
                  placeholder={PROFILE_LINK_META[key].placeholder}
                  inputMode="url"
                  autoComplete="url"
                />
              </label>
            ))}
          </div>
        </div>

        <Button type="button" size="sm" loading={pending} onClick={() => void saveProfile()}>
          Save profile
        </Button>
      </section>

      <section className="border-border/80 bg-card ring-ring/10 space-y-3 rounded-lg border p-4 shadow-sm ring-1">
        <div>
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
            Career preferences
          </h2>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Used for job selection and matching. Same fields you set during onboarding.
          </p>
        </div>
        <CareerProfileFields
          value={career}
          onChange={setCareer}
          compact
          idPrefix="settings-career"
        />
        <Button type="button" size="sm" loading={careerPending} onClick={() => void saveCareer()}>
          Save career preferences
        </Button>
      </section>

      <section className="border-border/80 bg-card ring-ring/10 space-y-3 rounded-lg border p-4 shadow-sm ring-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              Showcase resume ({resumes.length})
            </h2>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Exactly one resume can be <span className="text-foreground font-medium">Active</span>{" "}
              for your public profile. Activating another demotes the current showcase.
            </p>
          </div>
          <Link
            href="/documents"
            className="text-muted-foreground hover:text-foreground text-[11px] font-medium"
          >
            Upload in Documents →
          </Link>
        </div>

        {resumes.length === 0 ? (
          <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-[12px]">
            No resumes yet — upload a PDF from Documents.
          </div>
        ) : (
          <ul className="space-y-2">
            {resumes.map((resume) => {
              const isShowcase = resume.id === showcaseId;
              return (
                <li
                  key={resume.id}
                  className="border-border/70 bg-background/50 flex flex-col gap-2 rounded-lg border p-2.5 sm:flex-row sm:items-center sm:justify-between"
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
                      <Spinner className="text-muted-foreground size-3.5" label="Updating resume" />
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
      </section>

      <FriendsInviteCard />

      <section className="border-border/80 bg-card space-y-3 rounded-lg border p-4 shadow-sm">
        <div>
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Gmail send</h2>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Queued referral follow-ups send from your Google inbox after ~10 minutes. Re-authorize
            if send fails or you previously signed in without the gmail.send scope.
          </p>
        </div>
        <GmailConnectBanner callbackURL={`/${profile.username}/settings`} />
      </section>

      <section className="border-destructive/40 bg-card ring-destructive/10 space-y-3 rounded-lg border p-4 shadow-sm ring-1">
        <div>
          <h2 className="text-destructive text-[13px] font-semibold tracking-tight">Danger zone</h2>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Permanently delete your account and personal data (resumes, templates, cover letters,
            applications, jobs, follow-ups). People you added for referrals stay in the shared
            directory.
          </p>
        </div>
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
      </section>

      <Modal
        open={deleteOpen}
        onClose={() => (!deleting ? setDeleteOpen(false) : undefined)}
        title="Delete account"
        description="This cannot be undone. Resumes in storage and all tracker data will be removed. Shared people contacts are kept."
        footer={
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
        }
      >
        <div className="space-y-3">
          <p className="text-muted-foreground text-[12px] leading-relaxed">
            Type <span className="text-foreground font-semibold">DELETE</span> or your username{" "}
            <span className="text-foreground font-semibold">@{profile.username}</span> to confirm.
          </p>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="h-9 rounded-lg text-[13px]"
            disabled={deleting}
          />
          {deleteError ? <p className="text-destructive text-[12px]">{deleteError}</p> : null}
        </div>
      </Modal>
    </ShellWidth>
  );
}
