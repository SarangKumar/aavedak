"use client";

import { useCallback, useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import { ColdEmailTemplatesPanel } from "@/components/cold-email-templates-panel";
import { CoverLetterPdfPreview } from "@/components/cover-letter-pdf-preview";
import { ShellWidth } from "@/components/shell-width";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  coverFooterRowItems,
  coverLetterExceedsOneA4Page,
  downloadCoverLetterDocx,
  downloadCoverLetterPdf,
  type CoverLetterFooter,
} from "@/lib/cover-letter-download";
import {
  COVER_FOOTER_LINK_KEYS,
  PROFILE_LINK_META,
  type CoverFooterLinkKey,
  type ProfileLinks,
} from "@/lib/profile-links";
import { renderTemplatePreview } from "@/lib/template-preview";
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
  subject: string;
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
  profileEmail?: string | null;
  profileLinks?: ProfileLinks;
};

const DEFAULT_COVER_TITLE = "Cover letter — {{role}} at {{company}}";

const DEFAULT_COVER_BODY = `Dear Hiring Manager,

I am writing to express my interest in the {{role}} position at {{company}}. With a strong background and a passion for building thoughtful products, I would welcome the chance to contribute to your team.

Thank you for your time and consideration.

Sincerely,
John Doe`;

type FooterIncludeKey = CoverFooterLinkKey | "email";

type FooterInclude = Record<FooterIncludeKey, boolean>;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function defaultFooterInclude(
  profileEmail: string | null | undefined,
  profileLinks: ProfileLinks | undefined,
): FooterInclude {
  const links = profileLinks ?? {};
  const out = {
    email: Boolean(profileEmail?.trim()),
    portfolio: Boolean(links.portfolio?.trim()),
    linkedin: Boolean(links.linkedin?.trim()),
    github: Boolean(links.github?.trim()),
    leetcode: Boolean(links.leetcode?.trim()),
  } as FooterInclude;
  return out;
}

function buildFooterFromProfile(
  include: FooterInclude,
  profileEmail: string | null | undefined,
  profileLinks: ProfileLinks | undefined,
): CoverLetterFooter {
  const links = profileLinks ?? {};
  return {
    email: include.email ? profileEmail?.trim() || undefined : undefined,
    portfolio: include.portfolio ? links.portfolio?.trim() || undefined : undefined,
    linkedin: include.linkedin ? links.linkedin?.trim() || undefined : undefined,
    github: include.github ? links.github?.trim() || undefined : undefined,
    leetcode: include.leetcode ? links.leetcode?.trim() || undefined : undefined,
  };
}

export function DocumentsHub({
  initialResumes,
  initialCoverLetters,
  initialTemplates,
  initialApplications,
  userEmail,
  userName,
  profileEmail,
  profileLinks,
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
  const [clTitle, setClTitle] = useState(DEFAULT_COVER_TITLE);
  const [clBody, setClBody] = useState(DEFAULT_COVER_BODY);
  const [clApplicationId, setClApplicationId] = useState<string>(initialApplications[0]?.id ?? "");
  const [editingClId, setEditingClId] = useState<string | null>(null);
  const [clFooterInclude, setClFooterInclude] = useState<FooterInclude>(() =>
    defaultFooterInclude(profileEmail, profileLinks),
  );
  const [clOverflowsPage, setClOverflowsPage] = useState(false);
  const onClOverflowChange = useCallback((overflows: boolean) => {
    setClOverflowsPage(overflows);
  }, []);

  const appsById = useMemo(() => {
    const map = new Map(applications.map((a) => [a.id, a]));
    return map;
  }, [applications]);

  function resetCoverDraft() {
    setEditingClId(null);
    setClTitle(DEFAULT_COVER_TITLE);
    setClBody(DEFAULT_COVER_BODY);
    setClApplicationId(applications[0]?.id ?? "");
    setClFooterInclude(defaultFooterInclude(profileEmail, profileLinks));
  }

  const selectedApp = clApplicationId ? appsById.get(clApplicationId) : undefined;

  const coverVars = useMemo(() => {
    return {
      company: selectedApp?.companyName ?? "Acme Corp",
      role: selectedApp?.role ?? "Software Engineer",
      location: selectedApp?.location ?? "Remote",
      user_name: "John Doe",
      from_email: "john.doe@example.com",
      person_name: "Jane Smith",
      person_email: "jane.smith@example.com",
    };
  }, [selectedApp]);

  const clFooter = useMemo(
    () => buildFooterFromProfile(clFooterInclude, profileEmail, profileLinks),
    [clFooterInclude, profileEmail, profileLinks],
  );

  const previewTitle = renderTemplatePreview(clTitle || "", coverVars);
  const previewBody = renderTemplatePreview(clBody || "", coverVars);
  const footerRow = coverFooterRowItems(clFooter);

  async function downloadCl(
    cl: CoverLetterDto,
    format: "pdf" | "docx",
    footer?: CoverLetterFooter,
  ) {
    setError(null);
    setDownloadBusy(`${cl.id}-${format}`);
    try {
      const app = cl.applicationId ? appsById.get(cl.applicationId) : undefined;
      const vars = {
        company: app?.companyName ?? "Acme Corp",
        role: app?.role ?? "Software Engineer",
        location: app?.location ?? "Remote",
        user_name: "John Doe",
        from_email: "john.doe@example.com",
        person_name: "Jane Smith",
        person_email: "jane.smith@example.com",
      };
      const rendered = {
        title: renderTemplatePreview(cl.title, vars),
        body: renderTemplatePreview(cl.body, vars),
        companyName: app?.companyName,
        role: app?.role,
        footer: footer ?? clFooter,
      };
      if (await coverLetterExceedsOneA4Page(rendered)) {
        throw new Error("Cover letter must fit on a single A4 page.");
      }
      if (format === "pdf") {
        await downloadCoverLetterPdf(rendered);
      } else {
        await downloadCoverLetterDocx(rendered);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloadBusy(null);
    }
  }

  async function downloadDraft(format: "pdf" | "docx") {
    if (!clTitle.trim() || !clBody.trim()) {
      setError("Title and body are required before downloading.");
      return;
    }
    if (clOverflowsPage) {
      setError("Cover letter must fit on a single A4 page before downloading.");
      return;
    }
    setError(null);
    setDownloadBusy(`draft-${format}`);
    try {
      const rendered = {
        title: previewTitle || clTitle || "Cover letter",
        body: previewBody,
        companyName: selectedApp?.companyName,
        role: selectedApp?.role,
        footer: clFooter,
      };
      if (format === "pdf") await downloadCoverLetterPdf(rendered);
      else await downloadCoverLetterDocx(rendered);
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
    if (!clBody.trim()) {
      setError("Cover letter body is required.");
      return;
    }
    if (!clApplicationId) {
      setError("Pick a company / application — cover letters are always company-specific.");
      return;
    }
    if (clOverflowsPage) {
      setError("Cover letter must fit on a single A4 page before saving.");
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
          templates. Only one resume can be the active profile showcase. Resume delete archives
          only.
        </p>
      </header>

      <div
        className="border-border bg-card relative z-10 inline-flex h-8 items-center rounded-lg border p-0.5"
        role="tablist"
        aria-label="Documents sections"
      >
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
          <div className="border-border/80 bg-card ring-ring/10 space-y-3 rounded-lg border p-4 shadow-sm ring-1">
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
                Display name must be unique. Activating a resume makes it the sole profile showcase.
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
              <FileUploadDropzone className="min-h-40 rounded-lg text-[13px]">
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
            <h2 className="aavedak-section-title text-foreground">
              Your resumes ({resumes.length})
            </h2>
            {resumes.length === 0 ? (
              <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-[13px]">
                No resumes yet — upload a PDF to get started.
              </div>
            ) : (
              <ul className="space-y-2">
                {resumes.map((resume) => (
                  <li
                    key={resume.id}
                    className="border-border/80 bg-card flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
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
                          Set as showcase
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void patchResume(resume.id, { status: "inactive" })}
                          className="border-border text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px]"
                        >
                          Unset showcase
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
        <section className="space-y-4 px-0">
          <p className="aavedak-meta text-muted-foreground leading-relaxed">
            Cover letters are always company-specific and limited to one A4 page. New letters start
            from scratch — pick an application, write with {"{{role}}"} / {"{{company}}"} variables,
            preview the PDF layout, then download PDF or DOCX.
          </p>

          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)] xl:items-stretch">
            <div className="border-border/80 bg-card space-y-2.5 rounded-lg border p-4 shadow-sm">
              <p className="aavedak-section-title text-foreground">
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
                    <SelectValue placeholder="Search applications…" />
                  </SelectTrigger>
                  <SelectContent
                    className="z-[280]"
                    searchable
                    searchPlaceholder="Search company or role…"
                  >
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
              <input
                value={clTitle}
                onChange={(e) => setClTitle(e.target.value)}
                placeholder="Title — e.g. Cover for {{role}} at {{company}}"
                className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
              />
              <textarea
                value={clBody}
                onChange={(e) => setClBody(e.target.value)}
                placeholder={
                  "Dear Hiring Manager,\n\nI am writing to apply for the {{role}} role at {{company}}…"
                }
                rows={8}
                className="border-border bg-background text-foreground max-h-64 min-h-[10rem] w-full overflow-y-auto rounded-lg border px-3 py-2 font-mono text-[12px] leading-relaxed"
              />
              <div className="space-y-1.5">
                <p className="text-foreground text-[11px] font-semibold tracking-tight">
                  Footer from profile
                </p>
                <p className="text-muted-foreground text-[10px] leading-relaxed">
                  Values come from your profile. Empty fields stay disabled — edit them under
                  Profile settings.
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(
                    [
                      {
                        key: "email" as const,
                        label: "Email",
                        value: profileEmail?.trim() || "",
                      },
                      ...COVER_FOOTER_LINK_KEYS.map((key) => ({
                        key: key as CoverFooterLinkKey,
                        label: PROFILE_LINK_META[key].label,
                        value: profileLinks?.[key]?.trim() || "",
                      })),
                    ] as Array<{ key: FooterIncludeKey; label: string; value: string }>
                  ).map((item) => {
                    const hasValue = Boolean(item.value);
                    const checked = hasValue && clFooterInclude[item.key];
                    return (
                      <label
                        key={item.key}
                        className={cn(
                          "border-border/70 flex items-center gap-2 rounded-lg border px-2.5 py-2",
                          hasValue ? "bg-background/50" : "bg-muted/30 opacity-70",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!hasValue}
                          onChange={(e) =>
                            setClFooterInclude((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="text-foreground block text-[11px] font-medium">
                            {item.label}
                          </span>
                          <span className="text-muted-foreground block truncate text-[10px]">
                            {hasValue ? item.value : "Not set in profile"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  disabled={pending || clOverflowsPage}
                  onClick={() => void saveCoverLetter()}
                  className="aavedak-btn bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg border-0 px-3 text-[12px] font-semibold disabled:opacity-60"
                >
                  {pending ? "Saving…" : editingClId ? "Update" : "Save cover letter"}
                </button>
                <button
                  type="button"
                  disabled={downloadBusy === "draft-pdf" || clOverflowsPage}
                  onClick={() => void downloadDraft("pdf")}
                  className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] disabled:opacity-50"
                >
                  {downloadBusy === "draft-pdf" ? "PDF…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  disabled={downloadBusy === "draft-docx" || clOverflowsPage}
                  onClick={() => void downloadDraft("docx")}
                  className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] disabled:opacity-50"
                >
                  {downloadBusy === "draft-docx" ? "DOCX…" : "Download DOCX"}
                </button>
              </div>
            </div>

            <div className="border-border/80 bg-card flex min-h-[36rem] flex-col rounded-lg border p-3 shadow-sm xl:min-h-full">
              <CoverLetterPdfPreview
                title={previewTitle}
                body={previewBody}
                companyName={selectedApp?.companyName}
                role={selectedApp?.role}
                footerRow={footerRow}
                onOverflowChange={onClOverflowChange}
                className="min-h-[32rem] xl:min-h-0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="aavedak-section-title text-foreground">
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
                    <li key={cl.id} className="border-border/80 bg-card rounded-lg border p-3">
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
