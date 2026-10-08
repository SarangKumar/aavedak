"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { CompanySelect } from "@/components/company-select";
import { cn } from "@/lib/utils";

type Tab = "resumes" | "cover_letters" | "referral_email" | "followup_email";

export type ResumeDto = {
  id: string;
  displayName: string;
  status: "active" | "inactive" | "archived";
  originalFilename: string;
  byteSize: number;
  atsScore: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CoverLetterDto = {
  id: string;
  title: string;
  body: string;
  applicationId: string | null;
  jobId: string | null;
  companyName: string | null;
  roleTitle: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type JobOptionDto = {
  id: string;
  title: string;
  company: string;
  location: string;
  compatibilityScore?: number | null;
  atsScore: number | null;
};

export type TemplateDto = {
  id: string;
  title: string;
  subject: string;
  body: string;
  kind: "outreach" | "cover" | "followup" | "other";
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
  initialJobs: JobOptionDto[];
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

type FooterIncludeKey = CoverFooterLinkKey | "email" | "resume";

type FooterInclude = Record<FooterIncludeKey, boolean>;

function OpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8A1.5 1.5 0 0 0 13 12.5V10M9 2h5v5M14 2 7 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.2 10.2 13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="m8 1.5 1.8 3.6 4 .6-2.9 2.8.7 4L8 10.7 4.4 12.5l.7-4L2.2 5.7l4-.6L8 1.5Z" />
    </svg>
  );
}

function StarOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m8 1.5 1.8 3.6 4 .6-2.9 2.8.7 4L8 10.7 4.4 12.5l.7-4L2.2 5.7l4-.6L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 4.5h9M6 4.5V3.2A.7.7 0 0 1 6.7 2.5h2.6a.7.7 0 0 1 .7.7v1.3M5.5 6.5l.4 6.2a.8.8 0 0 0 .8.7h2.6a.8.8 0 0 0 .8-.7l.4-6.2M7 7.5v4M9 7.5v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4.5h11v2H2.5v-2ZM3.5 6.5v6a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-6M6.5 9h3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  return {
    email: Boolean(profileEmail?.trim()),
    portfolio: Boolean(links.portfolio?.trim()),
    linkedin: Boolean(links.linkedin?.trim()),
    github: Boolean(links.github?.trim()),
    leetcode: Boolean(links.leetcode?.trim()),
    resume: false,
  };
}

function buildFooterFromProfile(
  include: FooterInclude,
  profileEmail: string | null | undefined,
  profileLinks: ProfileLinks | undefined,
  resumeUrl?: string | null,
): CoverLetterFooter {
  const links = profileLinks ?? {};
  return {
    email: include.email ? profileEmail?.trim() || undefined : undefined,
    portfolio: include.portfolio ? links.portfolio?.trim() || undefined : undefined,
    linkedin: include.linkedin ? links.linkedin?.trim() || undefined : undefined,
    github: include.github ? links.github?.trim() || undefined : undefined,
    leetcode: include.leetcode ? links.leetcode?.trim() || undefined : undefined,
    resume: include.resume ? resumeUrl?.trim() || undefined : undefined,
  };
}

export function DocumentsHub({
  initialResumes,
  initialCoverLetters,
  initialTemplates,
  initialApplications,
  initialJobs,
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
  const [resumeActionId, setResumeActionId] = useState<string | null>(null);
  const [atsScoringIds, setAtsScoringIds] = useState<Set<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<ResumeDto | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [previewResume, setPreviewResume] = useState<ResumeDto | null>(null);
  const [editingResumeId, setEditingResumeId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameSkipBlurRef = useRef(false);

  // Resume upload state
  const [displayName, setDisplayName] = useState("Primary Resume");
  const [uploadFiles, setUploadFiles] = useState<FileUploadFile[]>([]);

  // Cover / template editors
  const [jobs] = useState(initialJobs);
  const [clTitle, setClTitle] = useState(DEFAULT_COVER_TITLE);
  const [clBody, setClBody] = useState(DEFAULT_COVER_BODY);
  const [clMode, setClMode] = useState<"job" | "custom">(initialJobs[0] ? "job" : "custom");
  const [clJobId, setClJobId] = useState<string>(initialJobs[0]?.id ?? "");
  const [clCustomCompany, setClCustomCompany] = useState("");
  const [clCustomRole, setClCustomRole] = useState("");
  const [clApplicationId, setClApplicationId] = useState<string>("");
  const [editingClId, setEditingClId] = useState<string | null>(null);
  const [clFooterInclude, setClFooterInclude] = useState<FooterInclude>(() =>
    defaultFooterInclude(profileEmail, profileLinks),
  );
  const usableResumes = useMemo(
    () => resumes.filter((r) => r.status === "active" || r.status === "inactive"),
    [resumes],
  );
  const [clFooterResumeId, setClFooterResumeId] = useState<string>(() => {
    const list = initialResumes.filter((r) => r.status === "active" || r.status === "inactive");
    const active = list.find((r) => r.status === "active");
    return active?.id ?? list[0]?.id ?? "";
  });
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
    setClMode(jobs[0] ? "job" : "custom");
    setClJobId(jobs[0]?.id ?? "");
    setClCustomCompany("");
    setClCustomRole("");
    setClApplicationId("");
    setClFooterInclude(defaultFooterInclude(profileEmail, profileLinks));
    const active = usableResumes.find((r) => r.status === "active");
    setClFooterResumeId(active?.id ?? usableResumes[0]?.id ?? "");
  }

  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const selectedJob = clMode === "job" && clJobId ? jobsById.get(clJobId) : undefined;

  const coverTarget = useMemo(() => {
    if (selectedJob) {
      return {
        company: selectedJob.company,
        role: selectedJob.title,
        location: selectedJob.location,
      };
    }
    if (clMode === "custom") {
      return {
        company: clCustomCompany.trim() || "Acme Corp",
        role: clCustomRole.trim() || "Software Engineer",
        location: "Remote",
      };
    }
    return { company: "Acme Corp", role: "Software Engineer", location: "Remote" };
  }, [selectedJob, clMode, clCustomCompany, clCustomRole]);

  const coverVars = useMemo(() => {
    return {
      company: coverTarget.company,
      role: coverTarget.role,
      location: coverTarget.location,
      user_name: "John Doe",
      from_email: "john.doe@example.com",
      person_name: "Jane Smith",
      person_email: "jane.smith@example.com",
    };
  }, [coverTarget]);

  const clFooterResumeUrl = useMemo(() => {
    if (!clFooterInclude.resume || !clFooterResumeId) return null;
    if (typeof window === "undefined") return `/api/resumes/${clFooterResumeId}/file`;
    return `${window.location.origin}/api/resumes/${clFooterResumeId}/file`;
  }, [clFooterInclude.resume, clFooterResumeId]);

  const clFooter = useMemo(
    () => buildFooterFromProfile(clFooterInclude, profileEmail, profileLinks, clFooterResumeUrl),
    [clFooterInclude, profileEmail, profileLinks, clFooterResumeUrl],
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
      const job = cl.jobId ? jobsById.get(cl.jobId) : undefined;
      const company = cl.companyName || job?.company || "Acme Corp";
      const role = cl.roleTitle || job?.title || "Software Engineer";
      const location = job?.location || "Remote";
      const vars = {
        company,
        role,
        location,
        user_name: "John Doe",
        from_email: "john.doe@example.com",
        person_name: "Jane Smith",
        person_email: "jane.smith@example.com",
      };
      const rendered = {
        title: renderTemplatePreview(cl.title, vars),
        body: renderTemplatePreview(cl.body, vars),
        companyName: company,
        role,
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
        companyName: coverTarget.company,
        role: coverTarget.role,
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

  async function scoreResumeAtsOnCard(resumeId: string) {
    setAtsScoringIds((prev) => new Set(prev).add(resumeId));
    try {
      const res = await fetch(`/api/resumes/${resumeId}/score`, { method: "POST" });
      const data = (await res.json()) as { resume?: ResumeDto; error?: string };
      if (!res.ok) throw new Error(data.error || "ATS scoring failed.");
      if (data.resume) {
        setResumes((list) =>
          list.map((r) =>
            r.id === resumeId ? { ...r, ...data.resume!, atsScore: data.resume!.atsScore } : r,
          ),
        );
      } else {
        await refreshResumes();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ATS scoring failed.");
    } finally {
      setAtsScoringIds((prev) => {
        const next = new Set(prev);
        next.delete(resumeId);
        return next;
      });
    }
  }

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
      const data = (await res.json()) as { resume?: ResumeDto; error?: string };
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploadFiles([]);
      await refreshResumes();
      if (data.resume?.id) {
        void scoreResumeAtsOnCard(data.resume.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  async function patchResume(
    id: string,
    patch: { status?: string; displayName?: string },
  ): Promise<boolean> {
    setError(null);
    setResumeActionId(id);
    try {
      const res = await fetch(`/api/resumes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { resume?: ResumeDto; error?: string };
      if (!res.ok) {
        setError(data.error || "Could not update resume.");
        return false;
      }
      if (data.resume) {
        setResumes((list) =>
          list.map((r) =>
            r.id === id
              ? {
                  ...r,
                  ...data.resume!,
                  atsScore: data.resume!.atsScore ?? r.atsScore,
                }
              : r,
          ),
        );
      } else {
        await refreshResumes();
      }
      return true;
    } catch {
      setError("Could not update resume.");
      return false;
    } finally {
      setResumeActionId(null);
    }
  }

  function startRename(resume: ResumeDto) {
    renameSkipBlurRef.current = false;
    setEditingResumeId(resume.id);
    setEditName(resume.displayName);
  }

  function cancelRename() {
    renameSkipBlurRef.current = true;
    setEditingResumeId(null);
    setEditName("");
  }

  async function commitRename(resume: ResumeDto) {
    if (renameSkipBlurRef.current) {
      renameSkipBlurRef.current = false;
      return;
    }
    const next = editName.trim();
    setEditingResumeId(null);
    if (!next || next === resume.displayName) {
      setEditName("");
      return;
    }
    const ok = await patchResume(resume.id, { displayName: next });
    if (!ok) {
      // Revert local draft; list still has the previous name
      setEditName("");
    }
  }

  useEffect(() => {
    if (!editingResumeId) return;
    const el = renameInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingResumeId]);

  async function confirmDeleteInactiveResume() {
    if (!deleteTarget) return;
    setError(null);
    setDeletePending(true);
    try {
      const res = await fetch(`/api/resumes/${deleteTarget.id}?permanent=1`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not delete resume.");
        return;
      }
      setDeleteTarget(null);
      await refreshResumes();
    } finally {
      setDeletePending(false);
    }
  }

  async function archiveResume(id: string) {
    setError(null);
    setResumeActionId(id);
    try {
      const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not archive resume.");
        return;
      }
      await refreshResumes();
    } finally {
      setResumeActionId(null);
    }
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
    if (clMode === "job" && !clJobId) {
      setError("Pick a job from the Jobs list, or switch to custom company + role.");
      return;
    }
    if (clMode === "custom" && (!clCustomCompany.trim() || !clCustomRole.trim())) {
      setError("Enter both company and role for a custom cover letter.");
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
            jobId: clMode === "job" ? clJobId || null : null,
            companyName: clMode === "custom" ? clCustomCompany.trim() : coverTarget.company,
            roleTitle: clMode === "custom" ? clCustomRole.trim() : coverTarget.role,
            applicationId: clApplicationId || null,
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
            jobId: clMode === "job" ? clJobId || null : null,
            companyName: clMode === "custom" ? clCustomCompany.trim() : coverTarget.company,
            roleTitle: clMode === "custom" ? clCustomRole.trim() : coverTarget.role,
            applicationId: clApplicationId || null,
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
          Resumes (PDF), cover letters, referral email templates, and follow-up email templates.
          Only one resume can be the active profile showcase.
        </p>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
          setError(null);
        }}
        className="gap-4"
      >
        <TabsList
          aria-label="Documents sections"
          className="border-border bg-card h-auto max-w-full flex-wrap border p-0.5"
        >
          <TabsTrigger value="resumes" className="cursor-pointer px-2.5 text-[12px]">
            Resume
          </TabsTrigger>
          <TabsTrigger value="cover_letters" className="cursor-pointer px-2.5 text-[12px]">
            Cover Letter
          </TabsTrigger>
          <TabsTrigger value="referral_email" className="cursor-pointer px-2.5 text-[12px]">
            Referral Email
          </TabsTrigger>
          <TabsTrigger value="followup_email" className="cursor-pointer px-2.5 text-[12px]">
            Follow-up Email
          </TabsTrigger>
        </TabsList>

        {error ? <p className="text-destructive text-[13px]">{error}</p> : null}

        <TabsContent value="resumes" className="mt-0 outline-none">
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
                  Display name must be unique. Activating a resume makes it the sole profile
                  showcase.
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
                className="aavedak-btn bg-primary text-primary-foreground ring-primary/30 inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold shadow-sm ring-1 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? <Spinner className="size-3.5" label="Uploading" /> : null}
                {pending ? "Uploading…" : "Upload PDF resume"}
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="aavedak-section-title text-foreground">
                  Your resumes ({resumes.length})
                </h2>
                <Link
                  href="/ats"
                  className="text-primary text-[12px] font-medium underline-offset-2 hover:underline"
                >
                  ATS scores
                </Link>
              </div>
              {resumes.length === 0 ? (
                <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-[13px]">
                  No resumes yet — upload a PDF to get started.
                </div>
              ) : (
                <ul className="space-y-2">
                  {resumes.map((resume) => {
                    const busy = resumeActionId === resume.id;
                    const renaming = editingResumeId === resume.id;
                    return (
                      <li
                        key={resume.id}
                        className="border-border/80 bg-card flex items-center gap-2 rounded-lg border p-3 sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {renaming ? (
                              <input
                                ref={renameInputRef}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => void commitRename(resume)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelRename();
                                  }
                                }}
                                maxLength={120}
                                aria-label="Resume display name"
                                className="border-border bg-background text-foreground h-7 min-w-0 flex-1 rounded-md border px-2 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                              />
                            ) : (
                              <button
                                type="button"
                                title="Click to rename"
                                onClick={() => startRename(resume)}
                                className="text-primary hover:text-primary/80 max-w-full cursor-text truncate text-left text-[13px] font-medium"
                              >
                                {resume.displayName}
                              </button>
                            )}
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                resume.status === "active"
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {resume.status}
                            </span>
                          </div>
                          <p className="text-muted-foreground flex items-center gap-1.5 truncate text-[11px]">
                            <span className="truncate">
                              {resume.originalFilename} · {formatBytes(resume.byteSize)}
                            </span>
                            {atsScoringIds.has(resume.id) ? (
                              <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1">
                                · <Spinner className="size-3" label="Scoring ATS" /> ATS…
                              </span>
                            ) : resume.atsScore != null ? (
                              <span className="shrink-0"> · ATS {resume.atsScore}</span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Preview"
                            aria-label={`Preview ${resume.displayName}`}
                            onClick={() => setPreviewResume(resume)}
                            className="border-border text-muted-foreground hover:text-foreground inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border"
                          >
                            <SearchIcon className="size-3.5" />
                          </button>
                          <a
                            href={`/api/resumes/${resume.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open"
                            aria-label={`Open ${resume.displayName}`}
                            className="border-border text-muted-foreground hover:text-foreground inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border sm:h-8 sm:w-auto sm:px-2.5"
                          >
                            <OpenIcon className="size-3.5 sm:hidden" />
                            <span className="hidden text-[12px] sm:inline">Open</span>
                          </a>
                          {resume.status !== "active" ? (
                            <button
                              type="button"
                              disabled={busy}
                              title="Set as showcase"
                              aria-label={`Set ${resume.displayName} as showcase`}
                              onClick={() => void patchResume(resume.id, { status: "active" })}
                              className="border-border text-foreground hover:text-primary inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-auto sm:px-2.5"
                            >
                              {busy ? (
                                <Spinner className="size-3.5" label="Updating" />
                              ) : (
                                <>
                                  <StarIcon className="size-3.5 sm:hidden" />
                                  <span className="hidden text-[12px] sm:inline">
                                    Set as showcase
                                  </span>
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              title="Unset showcase"
                              aria-label={`Unset showcase for ${resume.displayName}`}
                              onClick={() => void patchResume(resume.id, { status: "inactive" })}
                              className="border-border text-muted-foreground hover:text-foreground inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-auto sm:px-2.5"
                            >
                              {busy ? (
                                <Spinner className="size-3.5" label="Updating" />
                              ) : (
                                <>
                                  <StarOffIcon className="size-3.5 sm:hidden" />
                                  <span className="hidden text-[12px] sm:inline">
                                    Unset showcase
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                          {resume.status === "inactive" ? (
                            <button
                              type="button"
                              disabled={busy || deletePending}
                              title="Delete permanently"
                              aria-label={`Delete ${resume.displayName} permanently`}
                              onClick={() => setDeleteTarget(resume)}
                              className="border-border text-destructive hover:bg-destructive/10 inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-auto sm:px-2.5"
                            >
                              <TrashIcon className="size-3.5 sm:hidden" />
                              <span className="hidden text-[12px] sm:inline">
                                Delete permanently
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              title="Archive"
                              aria-label={`Archive ${resume.displayName}`}
                              onClick={() => void archiveResume(resume.id)}
                              className="border-border text-muted-foreground hover:text-foreground inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-auto sm:px-2.5"
                            >
                              {busy ? (
                                <Spinner className="size-3.5" label="Archiving" />
                              ) : (
                                <>
                                  <ArchiveIcon className="size-3.5 sm:hidden" />
                                  <span className="hidden text-[12px] sm:inline">Archive</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="cover_letters" className="mt-0 outline-none">
          <section className="space-y-4 px-0">
            <p className="aavedak-meta text-muted-foreground leading-relaxed">
              Cover letters are tied to a Jobs listing or a custom company + role (for external JDs
              you registered). Limited to one A4 page. Use {"{{role}}"} / {"{{company}}"} variables,
              preview, then download PDF or DOCX.
            </p>

            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)] xl:items-stretch">
              <div className="border-border/80 bg-card space-y-2.5 rounded-lg border p-4 shadow-sm">
                <p className="aavedak-section-title text-foreground">
                  {editingClId ? "Edit cover letter" : "New cover letter"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setClMode("job")}
                    className={
                      clMode === "job"
                        ? "bg-primary/15 text-primary inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-medium"
                        : "border-border text-muted-foreground inline-flex h-7 items-center rounded-full border px-2.5 text-[11px]"
                    }
                  >
                    From Jobs
                  </button>
                  <button
                    type="button"
                    onClick={() => setClMode("custom")}
                    className={
                      clMode === "custom"
                        ? "bg-primary/15 text-primary inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-medium"
                        : "border-border text-muted-foreground inline-flex h-7 items-center rounded-full border px-2.5 text-[11px]"
                    }
                  >
                    Custom company + role
                  </button>
                </div>
                {clMode === "job" ? (
                  <label className="block space-y-1">
                    <span className="text-muted-foreground text-[11px] font-medium">Job *</span>
                    <Select value={clJobId || undefined} onValueChange={(v) => setClJobId(v || "")}>
                      <SelectTrigger className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]">
                        <SelectValue placeholder="Pick a job from Jobs…" />
                      </SelectTrigger>
                      <SelectContent
                        className="z-[280]"
                        searchable
                        searchPlaceholder="Search title or company…"
                      >
                        {jobs.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            No jobs yet — add or paste a JD on Jobs
                          </SelectItem>
                        ) : (
                          jobs.map((job) => (
                            <SelectItem key={job.id} value={job.id}>
                              {job.company} · {job.title}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </label>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-muted-foreground text-[11px] font-medium">
                        Company *
                      </span>
                      <CompanySelect
                        value={clCustomCompany}
                        onChange={(name) => setClCustomCompany(name)}
                        placeholder="e.g. Stripe"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-muted-foreground text-[11px] font-medium">Role *</span>
                      <input
                        value={clCustomRole}
                        onChange={(e) => setClCustomRole(e.target.value)}
                        placeholder="e.g. Software Engineer"
                        className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]"
                      />
                    </label>
                  </div>
                )}
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
                    <div
                      className={cn(
                        "border-border/70 space-y-1.5 rounded-lg border px-2.5 py-2",
                        usableResumes.length > 0 ? "bg-background/50" : "bg-muted/30 opacity-70",
                      )}
                    >
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={clFooterInclude.resume && usableResumes.length > 0}
                          disabled={usableResumes.length === 0}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setClFooterInclude((prev) => ({ ...prev, resume: checked }));
                            if (checked && !clFooterResumeId && usableResumes[0]) {
                              setClFooterResumeId(usableResumes[0].id);
                            }
                          }}
                        />
                        <span className="min-w-0">
                          <span className="text-foreground block text-[11px] font-medium">
                            Resume link
                          </span>
                          <span className="text-muted-foreground block truncate text-[10px]">
                            {usableResumes.length > 0
                              ? "Add a resume PDF link to the footer"
                              : "Upload a resume first"}
                          </span>
                        </span>
                      </label>
                      {clFooterInclude.resume && usableResumes.length > 0 ? (
                        <Select
                          value={clFooterResumeId || undefined}
                          onValueChange={(v) => setClFooterResumeId(v || "")}
                        >
                          <SelectTrigger className="border-border bg-background text-foreground h-8 w-full cursor-pointer rounded-lg border px-2 text-[12px]">
                            <SelectValue placeholder="Choose resume" />
                          </SelectTrigger>
                          <SelectContent className="z-[240]">
                            {usableResumes.map((r) => (
                              <SelectItem key={r.id} value={r.id} className="text-[12px]">
                                {r.displayName}
                                {r.status === "active" ? " · active" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingClId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => resetCoverDraft()}
                      className="h-8"
                    >
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    loading={pending}
                    disabled={clOverflowsPage}
                    onClick={() => void saveCoverLetter()}
                    className="h-8"
                  >
                    {editingClId ? "Update" : "Save cover letter"}
                  </Button>
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
                  companyName={coverTarget.company}
                  role={coverTarget.role}
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
                    const job = cl.jobId ? jobsById.get(cl.jobId) : undefined;
                    const app = cl.applicationId ? appsById.get(cl.applicationId) : undefined;
                    const linkedCompany = cl.companyName || job?.company || app?.companyName;
                    const linkedRole = cl.roleTitle || job?.title || app?.role;
                    return (
                      <li key={cl.id} className="border-border/80 bg-card rounded-lg border p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-foreground text-[13px] font-medium">{cl.title}</p>
                            <p className="text-muted-foreground mt-0.5 text-[11px]">
                              {linkedCompany
                                ? `${linkedCompany} · ${linkedRole}`
                                : "No company linked"}
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
                                setClApplicationId(cl.applicationId ?? "");
                                if (cl.jobId) {
                                  setClMode("job");
                                  setClJobId(cl.jobId);
                                } else {
                                  setClMode("custom");
                                  setClCustomCompany(cl.companyName ?? "");
                                  setClCustomRole(cl.roleTitle ?? "");
                                }
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
        </TabsContent>

        <TabsContent value="referral_email" className="mt-0 outline-none">
          <section className="space-y-3">
            <p className="text-muted-foreground text-[12px] leading-relaxed">
              Referral email templates for Referrals outreach. Live preview uses the dummy
              application strip.
            </p>
            <ColdEmailTemplatesPanel
              lockedKind="outreach"
              listTitle="My referral templates"
              newButtonLabel="New referral template"
              templates={templates.filter((t) => t.kind === "outreach")}
              onTemplatesChange={(next) =>
                setTemplates((prev) => [...prev.filter((t) => t.kind !== "outreach"), ...next])
              }
              fromEmail={userEmail}
              userName={userName}
            />
          </section>
        </TabsContent>

        <TabsContent value="followup_email" className="mt-0 outline-none">
          <section className="space-y-3">
            <p className="text-muted-foreground text-[12px] leading-relaxed">
              Follow-up email templates for later nudges. Same editor as Referral Email — stored in
              your account. Live preview uses the dummy application strip.
            </p>
            <ColdEmailTemplatesPanel
              lockedKind="followup"
              listTitle="My follow-up templates"
              newButtonLabel="New follow-up template"
              templates={templates.filter((t) => t.kind === "followup")}
              onTemplatesChange={(next) =>
                setTemplates((prev) => [...prev.filter((t) => t.kind !== "followup"), ...next])
              }
              fromEmail={userEmail}
              userName={userName}
            />
          </section>
        </TabsContent>
      </Tabs>

      <Modal
        open={Boolean(previewResume)}
        onClose={() => setPreviewResume(null)}
        title={previewResume?.displayName ?? "Resume preview"}
        description={
          previewResume
            ? `${previewResume.originalFilename} · ${formatBytes(previewResume.byteSize)}`
            : undefined
        }
        size="xl"
        className="max-w-5xl"
        footer={
          previewResume ? (
            <>
              <a
                href={`/api/resumes/${previewResume.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="border-border text-foreground inline-flex h-8 items-center rounded-lg border px-3 text-[12px]"
              >
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() => setPreviewResume(null)}
                className="bg-primary text-primary-foreground inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold"
              >
                Close
              </button>
            </>
          ) : null
        }
      >
        {previewResume ? (
          <iframe
            key={previewResume.id}
            src={`/api/resumes/${previewResume.id}/file`}
            title={`Preview of ${previewResume.displayName}`}
            className="bg-background h-[min(72vh,46rem)] w-full rounded-md border-0"
          />
        ) : null}
      </Modal>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deletePending) setDeleteTarget(null);
        }}
        title="Delete resume permanently?"
        description="This removes the PDF from storage and cannot be undone. Active showcase resumes cannot be deleted."
        footer={
          <>
            <button
              type="button"
              disabled={deletePending}
              onClick={() => setDeleteTarget(null)}
              className="border-border text-muted-foreground inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deletePending}
              onClick={() => void confirmDeleteInactiveResume()}
              className="bg-destructive inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletePending ? <Spinner className="size-3.5" label="Deleting" /> : null}
              {deletePending ? "Deleting…" : "Delete permanently"}
            </button>
          </>
        }
      >
        {deleteTarget ? (
          <p className="text-muted-foreground text-[13px] leading-relaxed">
            Delete <span className="text-foreground font-medium">{deleteTarget.displayName}</span> (
            {deleteTarget.originalFilename})?
          </p>
        ) : null}
      </AlertDialog>
    </ShellWidth>
  );
}
