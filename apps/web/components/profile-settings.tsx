"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ShellWidth } from "@/components/shell-width";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function ProfileSettings({ profile, initialResumes }: Props) {
  const router = useRouter();
  const [name, setName] = useState(profile.name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [links, setLinks] = useState<ProfileLinks>(() => linksFromProfile(profile));
  const [resumes, setResumes] = useState(initialResumes);
  const [pending, setPending] = useState(false);
  const [resumePending, setResumePending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setPending(false);
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

  const fieldClass =
    "border-border bg-background text-foreground h-8 w-full rounded-lg border px-2.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

  return (
    <ShellWidth className="aavedak-fade-up space-y-4 py-7 sm:py-9">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            @{profile.username}
          </p>
          <h1 className="aavedak-display text-foreground text-xl tracking-tight sm:text-2xl">
            Profile settings
          </h1>
          <p className="text-muted-foreground max-w-xl text-[13px]">
            Edit how you appear on Aavedak. Only one resume can be the active showcase on your
            public profile.
          </p>
        </div>
        <Link
          href={`/${profile.username}`}
          className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
        >
          View public profile
        </Link>
      </div>

      {error ? <p className="text-destructive text-[12px]">{error}</p> : null}
      {saved ? <p className="text-primary text-[12px]">Profile saved.</p> : null}

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
              placeholder="Your name"
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

        <button
          type="button"
          disabled={pending}
          onClick={() => void saveProfile()}
          className="aavedak-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-8 items-center justify-center rounded-lg px-3 text-[12px] font-semibold shadow-sm ring-1 hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
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
    </ShellWidth>
  );
}
