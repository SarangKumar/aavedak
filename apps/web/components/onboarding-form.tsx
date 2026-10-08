"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CareerProfileFields,
  careerToFormState,
  formStateToCareerPatch,
  type CareerFormState,
} from "@/components/career-profile-fields";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { emptyCareerProfile, type CareerProfile } from "@/lib/career-profile";
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
  initialCareer?: CareerProfile;
  careerComplete?: boolean;
  hasResume?: boolean;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function OnboardingForm({
  username,
  email,
  name,
  initialCareer,
  careerComplete = false,
  hasResume = false,
}: OnboardingFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(
    careerComplete && !hasResume ? 2 : careerComplete ? 2 : 1,
  );
  const [career, setCareer] = useState<CareerFormState>(() =>
    careerToFormState(initialCareer ?? emptyCareerProfile()),
  );
  const [careerSaved, setCareerSaved] = useState(careerComplete);
  const [resumes, setResumes] = useState<ResumeDto[]>([]);
  const [displayName, setDisplayName] = useState(name ? `${name} Resume` : "Primary Resume");
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);
  const selectedPdf = useMemo(() => {
    const item = uploadFiles.find((entry) => !entry.error);
    return item?.file ?? null;
  }, [uploadFiles]);
  const [loadingList, setLoadingList] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingCareer, setSavingCareer] = useState(false);
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

  async function saveCareerAndNext() {
    setError(null);
    setSavingCareer(true);
    try {
      const patch = formStateToCareerPatch(career);
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ career: patch }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save career preferences.");
      setCareerSaved(true);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save career preferences.");
    } finally {
      setSavingCareer(false);
    }
  }

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
      if (!careerSaved) {
        const patch = formStateToCareerPatch(career);
        const careerRes = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ career: patch }),
        });
        const careerData = (await careerRes.json()) as { error?: string };
        if (!careerRes.ok) {
          throw new Error(careerData.error || "Complete career preferences first.");
        }
        setCareerSaved(true);
      }
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

  const canContinue =
    careerSaved && resumes.some((r) => r.status === "active" || r.status === "inactive");

  return (
    <div className="aavedak-fade-up mx-auto w-full max-w-2xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
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
          Set up career preferences for job matching, then upload at least one PDF resume.
        </p>
      </header>

      <div className="flex items-center gap-2 text-[12px]">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={cn(
            "rounded-full px-3 py-1 font-medium",
            step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          1 · Career
        </button>
        <span className="text-border">→</span>
        <button
          type="button"
          onClick={() => careerSaved && setStep(2)}
          disabled={!careerSaved}
          className={cn(
            "rounded-full px-3 py-1 font-medium",
            step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            !careerSaved && "cursor-not-allowed opacity-60",
          )}
        >
          2 · Resume
        </button>
      </div>

      {step === 1 ? (
        <section className="border-border/80 bg-card ring-ring/10 space-y-4 rounded-xl border p-4 shadow-sm ring-1 sm:p-5">
          <div>
            <h2 className="text-foreground text-[14px] font-semibold tracking-tight">
              Career preferences
            </h2>
            <p className="text-muted-foreground text-[12px] leading-relaxed">
              YC-style basics so we can match roles, package, and locations. You can edit these
              later on your profile.
            </p>
          </div>
          <CareerProfileFields value={career} onChange={setCareer} idPrefix="onboarding" />
          {error ? <p className="text-destructive text-[13px]">{error}</p> : null}
          <Button
            type="button"
            loading={savingCareer}
            onClick={() => void saveCareerAndNext()}
            className="w-full sm:w-auto"
          >
            Save & continue to resume
          </Button>
        </section>
      ) : (
        <>
          <form
            onSubmit={onUpload}
            className="border-border/80 bg-card ring-ring/10 space-y-3 rounded-xl border p-4 shadow-sm ring-1 backdrop-blur-sm sm:p-5"
          >
            <div className="space-y-1.5">
              <label htmlFor="displayName" className="text-foreground text-[12px] font-medium">
                Display name
              </label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Primary Resume"
                maxLength={120}
                required
                className="h-9 rounded-lg text-[13px]"
              />
              <p className="text-muted-foreground text-[11px]">
                Must be unique among your resumes.
              </p>
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
                <FileUploadDropzone className="min-h-40 rounded-xl text-[13px]">
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

            <Button
              type="submit"
              loading={uploading}
              loadingText="Uploading…"
              disabled={!selectedPdf}
              className="w-full"
            >
              Upload PDF resume
            </Button>
          </form>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
                Your resumes
              </h2>
              <span className="text-muted-foreground text-[11px]">
                {loadingList ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner className="size-3" /> Loading…
                  </span>
                ) : (
                  `${resumes.length} on file`
                )}
              </span>
            </div>

            {loadingList ? (
              <ul className="space-y-2" aria-busy="true" aria-label="Loading resumes">
                {[0, 1].map((i) => (
                  <li
                    key={i}
                    className="border-border/80 bg-card flex items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56 max-w-full" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </li>
                ))}
              </ul>
            ) : resumes.length === 0 ? (
              <div className="border-border/70 bg-card text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-[13px]">
                No resumes yet — upload a PDF to continue.
              </div>
            ) : (
              <ul className="space-y-2">
                {resumes.map((resume) => (
                  <li
                    key={resume.id}
                    className="border-border/80 bg-card flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
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
                          className="aavedak-btn text-foreground hover:text-primary border-border inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                        >
                          Make active
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void archive(resume.id)}
                        className="aavedak-btn text-muted-foreground hover:text-foreground border-border inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              className="sm:w-auto"
            >
              Back to career
            </Button>
            <Button
              type="button"
              loading={continuing}
              disabled={!canContinue}
              onClick={() => void continueToDashboard()}
              className="flex-1"
            >
              {continuing ? "Opening dashboard…" : "Continue to dashboard"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
