"use client";

import { useCallback, useMemo, useState } from "react";

import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import { ColdEmailTemplatesPanel } from "@/components/cold-email-templates-panel";
import { ShellWidth } from "@/components/shell-width";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadCoverLetterDocx, downloadCoverLetterPdf } from "@/lib/cover-letter-download";
import { cn } from "@/lib/utils";

type Tab = "resumes" | "cover_letters" | "templates";

export type ResumeDto = {
  id: string;
  displayName: string;
  status: "active" | "inactive" | "archived";
  originalFilename: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
};

export type CoverLetterDto = {
  id: string;
  title: string;
  body: string;
  applicationId: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type TemplateDto = {
  id: string;
  title: string;
  body: string;
  kind: "outreach" | "cover" | "other";
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type ApplicationOptionDto = {
  id: string;
  companyName: string;
  role: string;
  location: string;
};

type DocumentsHubProps = {
  initialResumes: ResumeDto[];
  initialCoverLetters: CoverLetterDto[];
  initialTemplates: TemplateDto[];
  initialApplications: ApplicationOptionDto[];
  userEmail?: string;
  userName?: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsHub({
  initialResumes,
  initialCoverLetters,
  initialTemplates,
  initialApplications,
  userEmail,
  userName,
}: DocumentsHubProps) {
  const [tab, setTab] = useState<Tab>("resumes");
  const [resumes, setResumes] = useState(initialResumes);
  const [coverLetters, setCoverLetters] = useState(initialCoverLetters);
  const [templates, setTemplates] = useState(initialTemplates);
  const [applications] = useState(initialApplications);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  // Resume upload state
  const [displayName, setDisplayName] = useState("Primary Resume");
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);

  // Cover / template editors
  const [clTitle, setClTitle] = useState("");
  const [clBody, setClBody] = useState("");
  const [clApplicationId, setClApplicationId] = useState<string>(initialApplications[0]?.id ?? "");
  const [clTemplateId, setClTemplateId] = useState<string>("");
  const [editingClId, setEditingClId] = useState<string | null>(null);

  const coverTemplates = useMemo(() => templates.filter((t) => t.kind === "cover"), [templates]);

  const appsById = useMemo(() => {
    const map = new Map(applications.map((a) => [a.id, a]));
    return map;
  }, [applications]);

  function resetCoverDraft() {
    setEditingClId(null);
    setClTitle("");
    setClBody("");
    setClTemplateId("");
    setClApplicationId(applications[0]?.id ?? "");
  }

  async function downloadCl(cl: CoverLetterDto, format: "pdf" | "docx") {
    setError(null);
    setDownloadBusy(`${cl.id}-${format}`);
    try {
      const company = cl.applicationId ? appsById.get(cl.applicationId)?.companyName : undefined;
      if (format === "pdf") {
        await downloadCoverLetterPdf({ title: cl.title, body: cl.body, companyName: company });
      } else {
        await downloadCoverLetterDocx({ title: cl.title, body: cl.body, companyName: company });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloadBusy(null);
    }
  }

  const selectedPdf = useMemo(() => {
    const item = uploadFiles.find((f) => !f.error);
    return item?.file ?? null;
  }, [uploadFiles]);

  const refreshResumes = useCallback(async () => {
    const res = await fetch("/api/resumes");
    const data = (await res.json()) as { resumes?: ResumeDto[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Failed to load resumes.");
    setResumes(data.resumes ?? []);
  }, []);

  async function uploadResume() {
    setError(null);
    if (!selectedPdf) {
      setError("Choose a PDF resume to upload.");
      return;
    }
    setPending(true);
    try {
      const body = new FormData();
      body.set("file", selectedPdf);
      body.set("displayName", displayName.trim() || selectedPdf.name.replace(/\.pdf$/i, ""));
      body.set("makeActive", "true");
      const res = await fetch("/api/resumes", { method: "POST", body });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploadFiles([]);
      await refreshResumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  async function patchResume(id: string, patch: { status?: string; displayName?: string }) {
    setError(null);
    const res = await fetch(`/api/resumes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not update resume.");
      return;
    }
    await refreshResumes();
  }

  async function archiveResume(id: string) {
    setError(null);
    const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not archive resume.");
      return;
    }
    await refreshResumes();
  }

  async function saveCoverLetter() {
    setError(null);
    if (!clTitle.trim()) {
      setError("Cover letter title is required.");
      return;
    }
    if (!clApplicationId) {
      setError("Pick a company / application — cover letters are always company-specific.");
      return;
    }
    setPending(true);
    try {
      if (editingClId) {
        const res = await fetch(`/api/cover-letters/${editingClId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: clTitle,
            body: clBody,
            applicationId: clApplicationId,
          }),
        });
        const data = (await res.json()) as { coverLetter?: CoverLetterDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Update failed.");
        if (data.coverLetter) {
          setCoverLetters((list) =>
            list.map((c) => (c.id === editingClId ? data.coverLetter! : c)),
          );
        }
      } else {
        const res = await fetch("/api/cover-letters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: clTitle,
            body: clBody,
            applicationId: clApplicationId,
          }),
        });
        const data = (await res.json()) as { coverLetter?: CoverLetterDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Create failed.");
        if (data.coverLetter) setCoverLetters((list) => [data.coverLetter!, ...list]);
      }
      resetCoverDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setPending(false);
    }
  }

  async function archiveCoverLetter(id: string) {
    setError(null);
    const res = await fetch(`/api/cover-letters/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not archive.");
      return;
    }
    setCoverLetters((list) => list.filter((c) => c.id !== id));
    if (editingClId === id) {
      resetCoverDraft();
    }
  }

  return (
    <ShellWidth className="aavedak-fade-up space-y-6 py-8 sm:py-10">
      <header className="space-y-1">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आवेदक
        </p>
        <h1 className="aavedak-display text-foreground text-2xl sm:text-3xl">Documents</h1>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Resumes (PDF), company-specific cover letters (PDF/DOCX download), and cold-email
          templates. Multiple resumes can be active. Resume delete archives only.
        </p>
      </header>

      <div className="border-border bg-card/70 inline-flex h-8 items-center rounded-lg border p-0.5">
        {(
          [
            { id: "resumes", label: "Resumes" },
            { id: "cover_letters", label: "Cover letters" },
            { id: "templates", label: "Cold email templates" },
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

      {tab === "resumes" ? (
        <section className="space-y-4">
          <div className="border-border/80 bg-card/70 ring-ring/10 space-y-3 rounded-xl border p-4 shadow-sm ring-1">
            <div className="space-y-1.5">
              <label
                htmlFor="resume-display-name"
                className="text-foreground text-[12px] font-medium"
              >
                Display name
              </label>
              <input
                id="resume-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                placeholder="e.g. Primary Resume"
                maxLength={120}
              />
              <p className="text-muted-foreground text-[11px]">
                Display name must be unique. You can keep multiple resumes active at once.
              </p>
            </div>

            <FileUpload
              accept="application/pdf,.pdf"
              multiple={false}
              maxSize={10 * 1024 * 1024}
              files={uploadFiles}
              onFilesChange={setUploadFiles}
              disabled={pending}
            >
              <FileUploadDropzone className="min-h-24 rounded-xl text-[13px]">
                Drop a PDF resume here, or browse
              </FileUploadDropzone>
              <FileUploadList />
            </FileUpload>

            <button
              type="button"
              disabled={pending || !selectedPdf}
              onClick={() => void uploadResume()}
              className="aavedak-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-9 w-full items-center justify-center rounded-lg px-3.5 text-[13px] font-semibold shadow-sm ring-1 hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Uploading…" : "Upload PDF resume"}
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              Your resumes ({resumes.length})
            </h2>
            {resumes.length === 0 ? (
              <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-[13px]">
                No resumes yet — upload a PDF to get started.
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
                        <span
                          className={cn(
                            "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            resume.status === "active"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {resume.status}
                        </span>
                      </p>
                      <p className="text-muted-foreground truncate text-[11px]">
                        {resume.originalFilename} · {formatBytes(resume.byteSize)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <a
                        href={`/api/resumes/${resume.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                      >
                        Open
                      </a>
                      {resume.status !== "active" ? (
                        <button
                          type="button"
                          onClick={() => void patchResume(resume.id, { status: "active" })}
                          className="border-border text-foreground hover:text-primary inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void patchResume(resume.id, { status: "inactive" })}
                          className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                        >
                          Deactivate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void archiveResume(resume.id)}
                        className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                      >
                        Archive
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === "cover_letters" ? (
        <section className="space-y-4">
          <p className="text-muted-foreground text-[12px] leading-relaxed">
            Cover letters are always company-specific (tied to an application). Optional cover
            templates seed the body; after save you can download PDF or DOCX.
          </p>
          <div className="border-border/80 bg-card/70 space-y-2.5 rounded-xl border p-4">
            <p className="text-foreground text-[12px] font-medium">
              {editingClId ? "Edit cover letter" : "New cover letter"}
            </p>
            <label className="block space-y-1">
              <span className="text-muted-foreground text-[11px] font-medium">
                Company / application *
              </span>
              <Select
                value={clApplicationId || undefined}
                onValueChange={(v) => setClApplicationId(v || "")}
              >
                <SelectTrigger className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]">
                  <SelectValue placeholder="Select application" />
                </SelectTrigger>
                <SelectContent className="z-[280]">
                  {applications.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No applications yet — add one in Job tracker
                    </SelectItem>
                  ) : (
                    applications.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.companyName} · {app.role}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1">
              <span className="text-muted-foreground text-[11px] font-medium">
                Cover template (optional)
              </span>
              <Select
                value={clTemplateId || undefined}
                onValueChange={(v) => {
                  const id = v || "";
                  setClTemplateId(id);
                  const tpl = coverTemplates.find((t) => t.id === id);
                  if (tpl) {
                    setClBody(tpl.body);
                    if (!clTitle.trim()) setClTitle(tpl.title);
                  }
                }}
              >
                <SelectTrigger className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]">
                  <SelectValue placeholder="Start from a saved cover template" />
                </SelectTrigger>
                <SelectContent className="z-[280]">
                  {coverTemplates.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No cover templates — create one under Cold email templates (kind: Cover)
                    </SelectItem>
                  ) : (
                    coverTemplates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </label>
            <input
              value={clTitle}
              onChange={(e) => setClTitle(e.target.value)}
              placeholder="Title"
              className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
            />
            <textarea
              value={clBody}
              onChange={(e) => setClBody(e.target.value)}
              placeholder="Body (plain text)"
              rows={8}
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
            />
            <div className="flex gap-2">
              {editingClId ? (
                <button
                  type="button"
                  onClick={() => resetCoverDraft()}
                  className="border-border text-muted-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => void saveCoverLetter()}
                className="aavedak-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
              >
                {pending ? "Saving…" : editingClId ? "Update" : "Create"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
              Your cover letters ({coverLetters.length})
            </h2>
            {coverLetters.length === 0 ? (
              <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-[13px]">
                No cover letters yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {coverLetters.map((cl) => {
                  const app = cl.applicationId ? appsById.get(cl.applicationId) : undefined;
                  return (
                    <li key={cl.id} className="border-border/80 bg-card/70 rounded-lg border p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-foreground text-[13px] font-medium">{cl.title}</p>
                          <p className="text-muted-foreground mt-0.5 text-[11px]">
                            {app ? `${app.companyName} · ${app.role}` : "No company linked"}
                          </p>
                          <p className="text-muted-foreground mt-1 line-clamp-2 text-[12px] leading-relaxed">
                            {cl.body || "Empty body"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={downloadBusy === `${cl.id}-pdf`}
                            onClick={() => void downloadCl(cl, "pdf")}
                            className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] disabled:opacity-50"
                          >
                            {downloadBusy === `${cl.id}-pdf` ? "PDF…" : "PDF"}
                          </button>
                          <button
                            type="button"
                            disabled={downloadBusy === `${cl.id}-docx`}
                            onClick={() => void downloadCl(cl, "docx")}
                            className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] disabled:opacity-50"
                          >
                            {downloadBusy === `${cl.id}-docx` ? "DOCX…" : "DOCX"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClId(cl.id);
                              setClTitle(cl.title);
                              setClBody(cl.body);
                              setClApplicationId(cl.applicationId ?? applications[0]?.id ?? "");
                              setClTemplateId("");
                            }}
                            className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void archiveCoverLetter(cl.id)}
                            className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="space-y-3">
          <p className="text-muted-foreground text-[12px] leading-relaxed">
            Cold-email templates for Referrals. Live preview uses the dummy application strip.
          </p>
          <ColdEmailTemplatesPanel
            templates={templates}
            onTemplatesChange={(next) => setTemplates(next)}
            fromEmail={userEmail}
            userName={userName}
          />
        </section>
      ) : null}
    </ShellWidth>
  );
}
