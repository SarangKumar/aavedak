"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import { cn } from "@/lib/utils";

type ResumeDto = {
  id: string;
  displayName: string;
  status: "active" | "inactive" | "archived";
  originalFilename: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
};

type OnboardingFormProps = {
  username: string;
  email: string;
  name: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function OnboardingForm({ username, email, name }: OnboardingFormProps) {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeDto[]>([]);
  const [displayName, setDisplayName] = useState(name ? `${name} Resume` : "Primary Resume");
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);
  const selectedPdf = useMemo(() => {
    const item = uploadFiles.find((entry) => !entry.error);
    return item?.file ?? null;
  }, [uploadFiles]);
  const [loadingList, setLoadingList] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/resumes");
      const data = (await res.json()) as { resumes?: ResumeDto[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load resumes.");
      setResumes(data.resumes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resumes.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onUpload(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selectedPdf) {
      setError("Choose a PDF resume to upload.");
      return;
    }
    if (
      selectedPdf.type !== "application/pdf" &&
      !selectedPdf.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Only PDF files are accepted.");
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", selectedPdf);
      body.set("displayName", displayName.trim() || selectedPdf.name.replace(/\.pdf$/i, ""));
      body.set("makeActive", "true");
      const res = await fetch("/api/resumes", { method: "POST", body });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploadFiles([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function setActive(id: string) {
    setError(null);
    const res = await fetch(`/api/resumes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not activate resume.");
      return;
    }
    await refresh();
  }

  async function archive(id: string) {
    setError(null);
    const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not archive resume.");
      return;
    }
    await refresh();
  }

  async function continueToDashboard() {
    setError(null);
    setContinuing(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { error?: string; redirectTo?: string };
      if (!res.ok) throw new Error(data.error || "Cannot continue yet.");
      router.push(data.redirectTo || "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot continue yet.");
      setContinuing(false);
    }
  }

  const canContinue = resumes.some((r) => r.status === "active" || r.status === "inactive");

  return (
    <div className="avsar-fade-up mx-auto w-full max-w-lg space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-1.5 text-center sm:text-left">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आरंभ
        </p>
        <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Welcome to Arambh</h1>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Signed in as <span className="text-foreground font-medium">{email}</span>
          {" · "}
          profile <span className="text-foreground font-medium">/{username}</span>
        </p>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Upload at least one PDF resume to unlock your dashboard. Deletes archive only — nothing is
          hard-deleted in v1.
        </p>
      </header>

      <form
        onSubmit={onUpload}
        className="border-border/80 bg-card/70 ring-ring/10 space-y-3 rounded-2xl border p-4 shadow-sm ring-1 backdrop-blur-sm sm:p-5"
      >
        <div className="space-y-1.5">
          <label htmlFor="displayName" className="text-foreground text-[12px] font-medium">
            Display name
          </label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-[13px] outline-none focus-visible:ring-2"
            placeholder="e.g. Primary Resume"
            maxLength={120}
            required
          />
          <p className="text-muted-foreground text-[11px]">Must be unique among your resumes.</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-foreground text-[12px] font-medium">Resume PDF</p>
          <FileUpload
            accept="application/pdf,.pdf"
            multiple={false}
            maxSize={10 * 1024 * 1024}
            files={uploadFiles}
            onFilesChange={setUploadFiles}
            disabled={uploading}
          >
            <FileUploadDropzone className="min-h-24 rounded-xl text-[13px]">
              Drop a PDF resume here, or browse
            </FileUploadDropzone>
            <FileUploadList />
          </FileUpload>
          {selectedPdf ? (
            <p className="text-muted-foreground text-[11px]">
              {selectedPdf.name} · {formatBytes(selectedPdf.size)}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={uploading || !selectedPdf}
          className="avsar-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-9 w-full items-center justify-center rounded-lg px-3.5 text-[13px] font-semibold shadow-md shadow-black/15 ring-1 hover:opacity-90 disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Upload PDF resume"}
        </button>
      </form>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Your resumes</h2>
          <span className="text-muted-foreground text-[11px]">
            {loadingList ? "Loading…" : `${resumes.length} on file`}
          </span>
        </div>

        {resumes.length === 0 && !loadingList ? (
          <div className="border-border/70 bg-card/50 text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-[13px]">
            No resumes yet — upload a PDF to continue.
          </div>
        ) : (
          <ul className="space-y-2">
            {resumes.map((resume) => (
              <li
                key={resume.id}
                className="border-border/80 bg-card/70 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-[13px] font-medium">
                    {resume.displayName}
                    {resume.status === "active" ? (
                      <span className="bg-primary/15 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        Active
                      </span>
                    ) : (
                      <span className="bg-muted text-muted-foreground ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        Inactive
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-[11px]">
                    {resume.originalFilename} · {formatBytes(resume.byteSize)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {resume.status !== "active" ? (
                    <button
                      type="button"
                      onClick={() => void setActive(resume.id)}
                      className="avsar-btn text-foreground hover:text-primary border-border inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                    >
                      Make active
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void archive(resume.id)}
                    className="avsar-btn text-muted-foreground hover:text-foreground border-border inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                  >
                    Archive
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? <p className="text-destructive text-center text-[13px]">{error}</p> : null}

      <button
        type="button"
        disabled={!canContinue || continuing}
        onClick={() => void continueToDashboard()}
        className={cn(
          "avsar-btn inline-flex h-9 w-full items-center justify-center rounded-lg px-3.5 text-[13px] font-semibold ring-1 transition",
          canContinue
            ? "bg-primary text-primary-foreground ring-primary/30 shadow-md shadow-black/15 hover:opacity-90"
            : "bg-muted text-muted-foreground ring-border cursor-not-allowed",
        )}
      >
        {continuing ? "Opening dashboard…" : "Continue to dashboard"}
      </button>
    </div>
  );
}
