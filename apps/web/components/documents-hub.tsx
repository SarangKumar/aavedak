"use client";

import { useCallback, useMemo, useState } from "react";

import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShellWidth } from "@/components/shell-width";
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

type DocumentsHubProps = {
  initialResumes: ResumeDto[];
  initialCoverLetters: CoverLetterDto[];
  initialTemplates: TemplateDto[];
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
}: DocumentsHubProps) {
  const [tab, setTab] = useState<Tab>("resumes");
  const [resumes, setResumes] = useState(initialResumes);
  const [coverLetters, setCoverLetters] = useState(initialCoverLetters);
  const [templates, setTemplates] = useState(initialTemplates);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Resume upload state
  const [displayName, setDisplayName] = useState("Primary Resume");
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);

  // Cover / template editors
  const [clTitle, setClTitle] = useState("");
  const [clBody, setClBody] = useState("");
  const [editingClId, setEditingClId] = useState<string | null>(null);

  const [tplTitle, setTplTitle] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplKind, setTplKind] = useState<"outreach" | "cover" | "other">("outreach");
  const [editingTplId, setEditingTplId] = useState<string | null>(null);

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
    setPending(true);
    try {
      if (editingClId) {
        const res = await fetch(`/api/cover-letters/${editingClId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: clTitle, body: clBody }),
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
          body: JSON.stringify({ title: clTitle, body: clBody }),
        });
        const data = (await res.json()) as { coverLetter?: CoverLetterDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Create failed.");
        if (data.coverLetter) setCoverLetters((list) => [data.coverLetter!, ...list]);
      }
      setClTitle("");
      setClBody("");
      setEditingClId(null);
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
      setEditingClId(null);
      setClTitle("");
      setClBody("");
    }
  }

  async function saveTemplate() {
    setError(null);
    if (!tplTitle.trim()) {
      setError("Template title is required.");
      return;
    }
    setPending(true);
    try {
      if (editingTplId) {
        const res = await fetch(`/api/templates/${editingTplId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: tplTitle, body: tplBody, kind: tplKind }),
        });
        const data = (await res.json()) as { template?: TemplateDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Update failed.");
        if (data.template) {
          setTemplates((list) => list.map((t) => (t.id === editingTplId ? data.template! : t)));
        }
      } else {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: tplTitle, body: tplBody, kind: tplKind }),
        });
        const data = (await res.json()) as { template?: TemplateDto; error?: string };
        if (!res.ok) throw new Error(data.error || "Create failed.");
        if (data.template) setTemplates((list) => [data.template!, ...list]);
      }
      setTplTitle("");
      setTplBody("");
      setTplKind("outreach");
      setEditingTplId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setPending(false);
    }
  }

  async function archiveTemplate(id: string) {
    setError(null);
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not archive.");
      return;
    }
    setTemplates((list) => list.filter((t) => t.id !== id));
    if (editingTplId === id) {
      setEditingTplId(null);
      setTplTitle("");
      setTplBody("");
    }
  }

  return (
    <ShellWidth className="avsar-fade-up space-y-6 py-8 sm:py-10">
      <header className="space-y-1">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आरंभ
        </p>
        <h1 className="avsar-display text-foreground text-2xl sm:text-3xl">Documents</h1>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Resumes (PDF), cover letters, and reusable text templates. Resume delete archives only.
        </p>
      </header>

      <div className="border-border bg-card/70 inline-flex h-8 items-center rounded-lg border p-0.5">
        {(
          [
            { id: "resumes", label: "Resumes" },
            { id: "cover_letters", label: "Cover letters" },
            { id: "templates", label: "Mail templates" },
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
          <div className="border-border/80 bg-card/70 ring-ring/10 space-y-3 rounded-2xl border p-4 shadow-sm ring-1">
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
                Must be unique among your resumes.
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
              className="avsar-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-9 w-full items-center justify-center rounded-lg px-3.5 text-[13px] font-semibold shadow-sm ring-1 hover:opacity-90 disabled:opacity-60"
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
          <div className="border-border/80 bg-card/70 space-y-2.5 rounded-2xl border p-4">
            <p className="text-foreground text-[12px] font-medium">
              {editingClId ? "Edit cover letter" : "New cover letter"}
            </p>
            <input
              value={clTitle}
              onChange={(e) => setClTitle(e.target.value)}
              placeholder="Title"
              className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
            />
            <textarea
              value={clBody}
              onChange={(e) => setClBody(e.target.value)}
              placeholder="Body (plain text / markdown)"
              rows={8}
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
            />
            <div className="flex gap-2">
              {editingClId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingClId(null);
                    setClTitle("");
                    setClBody("");
                  }}
                  className="border-border text-muted-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => void saveCoverLetter()}
                className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
              >
                {pending ? "Saving…" : editingClId ? "Update" : "Create"}
              </button>
            </div>
          </div>

          {coverLetters.length === 0 ? (
            <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-[13px]">
              No cover letters yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {coverLetters.map((cl) => (
                <li key={cl.id} className="border-border/80 bg-card/70 rounded-xl border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-foreground text-[13px] font-medium">{cl.title}</p>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-[12px] leading-relaxed">
                        {cl.body || "Empty body"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingClId(cl.id);
                          setClTitle(cl.title);
                          setClBody(cl.body);
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
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="space-y-4">
          <div className="border-border/80 bg-card/70 space-y-2.5 rounded-2xl border p-4">
            <p className="text-muted-foreground text-[12px] leading-relaxed">
              Cold-email / outreach templates used on Referrals. Add, edit, or archive here.
            </p>
            <p className="text-foreground text-[12px] font-medium">
              {editingTplId ? "Edit template" : "New template"}
            </p>
            <input
              value={tplTitle}
              onChange={(e) => setTplTitle(e.target.value)}
              placeholder="Title"
              className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
            />
            <Select
              value={tplKind}
              onValueChange={(v) => setTplKind((v as "outreach" | "cover" | "other") || "outreach")}
            >
              <SelectTrigger className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-2.5 text-[13px]">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent className="z-[240]">
                <SelectItem value="outreach">Outreach</SelectItem>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <textarea
              value={tplBody}
              onChange={(e) => setTplBody(e.target.value)}
              placeholder="Template body"
              rows={8}
              className="border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
            />
            <div className="flex gap-2">
              {editingTplId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTplId(null);
                    setTplTitle("");
                    setTplBody("");
                    setTplKind("outreach");
                  }}
                  className="border-border text-muted-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
                >
                  Cancel
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => void saveTemplate()}
                className="avsar-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60"
              >
                {pending ? "Saving…" : editingTplId ? "Update" : "Create"}
              </button>
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="border-border/70 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-[13px]">
              No templates yet — save outreach snippets here.
            </div>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl) => (
                <li key={tpl.id} className="border-border/80 bg-card/70 rounded-xl border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-foreground text-[13px] font-medium">
                        {tpl.title}
                        <span className="bg-muted text-muted-foreground ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {tpl.kind}
                        </span>
                      </p>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-[12px] leading-relaxed">
                        {tpl.body || "Empty body"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTplId(tpl.id);
                          setTplTitle(tpl.title);
                          setTplBody(tpl.body);
                          setTplKind(tpl.kind);
                        }}
                        className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void archiveTemplate(tpl.id)}
                        className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </ShellWidth>
  );
}
