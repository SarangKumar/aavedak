"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";

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
  const [displayName, setDisplayName] = useState(name ? `${name} Resume` : "Primary Resume");
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);
  const selectedPdf = useMemo(() => {
    const item = uploadFiles.find((entry) => !entry.error);
    return item?.file ?? null;
  }, [uploadFiles]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (selectedPdf.size > 5 * 1024 * 1024) {
      setError("PDF must be 5MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", selectedPdf);
      body.set("displayName", displayName.trim() || selectedPdf.name.replace(/\.pdf$/i, ""));
      body.set("makeActive", "true");
      const uploadRes = await fetch("/api/resumes", { method: "POST", body });
      const uploadData = (await uploadRes.json()) as {
        error?: string;
        resume?: { atsScore?: number };
      };
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed.");

      const completeRes = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const completeData = (await completeRes.json()) as { error?: string; redirectTo?: string };
      if (!completeRes.ok) throw new Error(completeData.error || "Could not finish onboarding.");

      router.push(completeData.redirectTo || "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploading(false);
    }
  }

  return (
    <div className="aavedak-fade-up mx-auto w-full max-w-lg space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-1.5 text-center sm:text-left">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Welcome to Aavedak</h1>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Signed in as <span className="text-foreground font-medium">{email}</span>
          {" · "}
          profile <span className="text-foreground font-medium">/{username}</span>
        </p>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Upload one PDF resume (max 5MB). After a successful upload you go straight to the
          dashboard. You can add more resumes later from Documents (20 per day).
        </p>
      </header>

      <form
        onSubmit={onUpload}
        className="border-border/80 bg-card ring-ring/10 space-y-3 rounded-xl border p-4 shadow-sm ring-1 backdrop-blur-sm sm:p-5"
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
        </div>

        <div className="space-y-1.5">
          <p className="text-foreground text-[12px] font-medium">Resume PDF</p>
          <FileUpload
            accept="application/pdf,.pdf"
            multiple={false}
            maxSize={5 * 1024 * 1024}
            files={uploadFiles}
            onFilesChange={setUploadFiles}
            disabled={uploading}
          >
            <FileUploadDropzone className="min-h-40 rounded-xl text-[13px]">
              Drop one PDF resume here, or browse
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
          className="aavedak-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-9 w-full items-center justify-center rounded-lg px-3.5 text-[13px] font-semibold shadow-md shadow-black/15 ring-1 hover:opacity-90 disabled:opacity-60"
        >
          {uploading ? "Uploading and opening dashboard…" : "Upload resume and continue"}
        </button>
      </form>

      {error ? <p className="text-destructive text-center text-[13px]">{error}</p> : null}
    </div>
  );
}
