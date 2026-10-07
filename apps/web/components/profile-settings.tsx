"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ShellWidth } from "@/components/shell-width";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ProfileSettingsProfile = {
  username: string;
  name: string | null;
  bio: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
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

export function ProfileSettings({ profile, initialResumes }: Props) {
  const router = useRouter();
  const [name, setName] = useState(profile.name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(profile.portfolioUrl ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedinUrl ?? "");
  const [resumes, setResumes] = useState(initialResumes);
  const [pending, setPending] = useState(false);
  const [resumePending, setResumePending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function saveProfile() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          bio: bio.trim() || null,
          portfolioUrl: portfolioUrl.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
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
    <ShellWidth className="avsar-fade-up space-y-4 py-7 sm:py-9">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            @{profile.username}
          </p>
          <h1 className="avsar-display text-foreground text-xl tracking-tight sm:text-2xl">
            Profile settings
          </h1>
          <p className="text-muted-foreground max-w-xl text-[13px]">
            Edit how you appear on Arambh. Multiple resumes can be active; activate/deactivate
            reuses Documents APIs.
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

      <section className="border-border/80 bg-card/80 ring-ring/10 space-y-3 rounded-2xl border p-4 shadow-sm ring-1">
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

          <label className="space-y-1">
            <span className="text-muted-foreground text-[11px] font-medium">Portfolio URL</span>
            <input
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              className={fieldClass}
              placeholder="https://…"
            />
          </label>

          <label className="space-y-1">
            <span className="text-muted-foreground text-[11px] font-medium">LinkedIn URL</span>
            <input
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className={fieldClass}
              placeholder="https://linkedin.com/in/…"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => void saveProfile()}
          className="avsar-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-8 items-center justify-center rounded-lg px-3 text-[12px] font-semibold shadow-sm ring-1 hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </section>

      <section className="border-border/80 bg-card/80 ring-ring/10 space-y-3 rounded-2xl border p-4 shadow-sm ring-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
            Resumes ({resumes.length})
          </h2>
          <Link
            href="/documents"
            className="text-muted-foreground hover:text-foreground text-[11px] font-medium"
          >
            Upload in Documents →
          </Link>
        </div>

        {resumes.length === 0 ? (
          <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-3 py-6 text-center text-[12px]">
            No resumes yet — upload a PDF from Documents.
          </div>
        ) : (
          <ul className="space-y-2">
            {resumes.map((resume) => (
              <li
                key={resume.id}
                className="border-border/70 bg-background/50 flex flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-[12px] font-medium">
                    {resume.displayName}
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
                        Active
                      </SelectItem>
                      <SelectItem value="inactive" className="text-[12px]">
                        Inactive
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ShellWidth>
  );
}
