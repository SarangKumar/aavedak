"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TemplateVariablesInfo, missingVarLabels } from "@/components/template-variables-info";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  type FileUploadFile,
} from "@/components/ui/file-upload";
import { ResumePreviewButton, ResumePreviewDialog } from "@/components/resume-preview";
import { ColdEmailTemplatesPanel } from "@/components/cold-email-templates-panel";
import { CoverLetterPdfPreview } from "@/components/cover-letter-pdf-preview";
import { ShellWidth } from "@/components/shell-width";
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ResumeListSkeleton } from "@/components/page-loading-skeleton";
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
import { RESUME_MAX_BYTES } from "@/lib/resume-upload";
import {
  jobTemplateVars,
  renderTemplateFinal,
  resolveTemplate,
  templateDate,
  userTemplateVars,
} from "@/lib/template-preview";
import { CompanySelect } from "@/components/company-select";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export type DocumentsTab = "resumes" | "cover_letters" | "referral_email" | "followup_email";
type Tab = DocumentsTab;

function isDocumentsTab(value: string | null): value is Tab {
  return (
    value === "resumes" ||
    value === "cover_letters" ||
    value === "referral_email" ||
    value === "followup_email"
  );
}

export type ResumeDto = {
  id: string;
  displayName: string;
  status: "active" | "inactive" | "archived";
  originalFilename: string;
  byteSize: number;
  atsScore: number | null;
  /** Stored score predates the native engine or the profile's current role / years. */
  atsStale?: boolean;
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
  /** Tab opened first; comes from the `tab` search param (default Resumes). */
  initialTab?: DocumentsTab;
  /** Job preselected for a new cover letter (`jobId` search param), when it is one of `initialJobs`. */
  initialJobId?: string | null;
  /** `null` = not fetched on the server; the hub loads `/api/resumes` on mount. */
  initialResumes: ResumeDto[] | null;
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

function atsScoreTone(score: number) {
  if (score >= 80) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (score >= 60) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
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
  initialTab = "resumes",
  initialJobId = null,
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
  const [tab, setTab] = useState<Tab>(initialTab);

  // Follow `?tab=` when a link (e.g. the header menu) changes it while this page is open.
  const searchTab = useSearchParams().get("tab");
  const [seenSearchTab, setSeenSearchTab] = useState(searchTab);
  if (searchTab !== seenSearchTab) {
    setSeenSearchTab(searchTab);
    if (isDocumentsTab(searchTab) && searchTab !== tab) setTab(searchTab);
  }

  // `?upload=1` (Resume menu → Upload resume): jump to the upload form and focus it.
  const wantsUpload = useSearchParams().get("upload") === "1";
  useEffect(() => {
    if (!wantsUpload || tab !== "resumes") return;
    const el = document.getElementById("resume-display-name");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }, [wantsUpload, tab]);

  // Keep the active tab in the URL so reloads and shared links open the same tab.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // URL sync is a convenience; the page works without it.
    }
  }, [tab]);
  const [resumes, setResumes] = useState<ResumeDto[]>(initialResumes ?? []);
  const [resumesLoaded, setResumesLoaded] = useState(initialResumes !== null);
  const [resumesLoadError, setResumesLoadError] = useState<string | null>(null);
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
  const [clMode, setClMode] = useState<"job" | "custom">(initialJobs.length > 0 ? "job" : "custom");
  const [clJobId, setClJobId] = useState<string>(
    initialJobs.some((j) => j.id === initialJobId)
      ? (initialJobId as string)
      : (initialJobs[0]?.id ?? ""),
  );
  const [clCustomCompany, setClCustomCompany] = useState("");
  const [clCustomRole, setClCustomRole] = useState("");
  const [clApplicationId, setClApplicationId] = useState<string>("");
  /** Values typed for variables the profile / job can't supply (phone, hiring manager, …). */
  const [clFill, setClFill] = useState<Record<string, string>>({});
  const [editingClId, setEditingClId] = useState<string | null>(null);
  const [clFooterInclude, setClFooterInclude] = useState<FooterInclude>(() =>
    defaultFooterInclude(profileEmail, profileLinks),
  );
  const usableResumes = useMemo(
    () => resumes.filter((r) => r.status === "active" || r.status === "inactive"),
    [resumes],
  );
  const [clFooterResumeId, setClFooterResumeId] = useState<string>(() => {
    const list = (initialResumes ?? []).filter(
      (r) => r.status === "active" || r.status === "inactive",
    );
    const active = list.find((r) => r.status === "active");
    return active?.id ?? list[0]?.id ?? "";
  });
  // Lazy-loaded resumes arrive after mount, so the footer default is picked once they do.
  useEffect(() => {
    if (!resumesLoaded || clFooterResumeId) return;
    const list = resumes.filter((r) => r.status === "active" || r.status === "inactive");
    const active = list.find((r) => r.status === "active");
    setClFooterResumeId(active?.id ?? list[0]?.id ?? "");
  }, [resumesLoaded, resumes, clFooterResumeId]);
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
    setClFill({});
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
      return { company: clCustomCompany.trim(), role: clCustomRole.trim(), location: "" };
    }
    return { company: "", role: "", location: "" };
  }, [selectedJob, clMode, clCustomCompany, clCustomRole]);

  // Cover letters resolve to real values: your profile + the selected job / custom company.
  const userVars = useMemo(
    () =>
      userTemplateVars({
        name: userName,
        email: profileEmail || userEmail,
        links: profileLinks,
      }),
    [userName, profileEmail, userEmail, profileLinks],
  );

  const coverVars = useMemo(() => {
    const base: Record<string, string> = {
      ...userVars,
      ...jobTemplateVars(coverTarget),
      date: templateDate(),
    };
    for (const [key, value] of Object.entries(clFill)) {
      if (value.trim() && !base[key]?.trim()) base[key] = value.trim();
    }
    return base;
  }, [userVars, coverTarget, clFill]);

  const clFooterResumeUrl = useMemo(() => {
    if (!clFooterInclude.resume || !clFooterResumeId) return null;
    if (typeof window === "undefined") return `/api/resumes/${clFooterResumeId}/file`;
    return `${window.location.origin}/api/resumes/${clFooterResumeId}/file`;
  }, [clFooterInclude.resume, clFooterResumeId]);

  const clFooter = useMemo(
    () => buildFooterFromProfile(clFooterInclude, profileEmail, profileLinks, clFooterResumeUrl),
    [clFooterInclude, profileEmail, profileLinks, clFooterResumeUrl],
  );

  // Preview keeps missing variables as {{key}} so they're highlighted; output drops them.
  const titleResolved = resolveTemplate(clTitle || "", coverVars);
  const bodyResolved = resolveTemplate(clBody || "", coverVars);
  const previewTitle = titleResolved.text;
  const previewBody = bodyResolved.text;
  const clMissing = [...new Set([...titleResolved.missing, ...bodyResolved.missing])];
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
      const company = cl.companyName || job?.company || "";
      const role = cl.roleTitle || job?.title || "";
      const location = job?.location || "";
      const vars = {
        ...userVars,
        ...jobTemplateVars({ company, role, location }),
        date: templateDate(),
      };
      const rendered = {
        title: renderTemplateFinal(cl.title, vars),
        body: renderTemplateFinal(cl.body, vars),
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
        title: renderTemplateFinal(clTitle, coverVars) || "Cover letter",
        body: renderTemplateFinal(clBody, coverVars),
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
            r.id === resumeId
              ? { ...r, ...data.resume!, atsScore: data.resume!.atsScore, atsStale: false }
              : r,
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

  // Rescore stale cards once per mount so they match the ATS page (native engine, same inputs).
  const scoreOnCardRef = useRef(scoreResumeAtsOnCard);
  useEffect(() => {
    scoreOnCardRef.current = scoreResumeAtsOnCard;
  });
  const rescoredIdsRef = useRef(new Set<string>());
  useEffect(() => {
    if (!resumesLoaded) return;
    for (const r of resumes) {
      if (!r.atsStale || rescoredIdsRef.current.has(r.id)) continue;
      rescoredIdsRef.current.add(r.id);
      void scoreOnCardRef.current(r.id);
    }
  }, [resumes, resumesLoaded]);

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
    // Keyed per action so only the pressed button shows its spinner.
    setResumeActionId(`${id}:${patch.status ? "status" : "rename"}`);
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
    if (resumesLoaded) return;
    refreshResumes()
      .catch((err: unknown) =>
        setResumesLoadError(err instanceof Error ? err.message : "Failed to load resumes."),
      )
      .finally(() => setResumesLoaded(true));
  }, [resumesLoaded, refreshResumes]);

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
    setResumeActionId(`${id}:archive`);
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
            title: previewTitle,
            body: previewBody,
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
            title: previewTitle,
            body: previewBody,
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
            Referral <span className="hidden md:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="followup_email" className="cursor-pointer px-2.5 text-[12px]">
            Follow-up
          </TabsTrigger>
        </TabsList>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <TabsContent value="resumes" className="mt-0 outline-none">
          <section className="space-y-4">
            <Card className="border-border/80 bg-card ring-ring/10 gap-0 space-y-3 rounded-lg border p-4 shadow-sm ring-1">
              <div className="space-y-1.5">
                <label
                  htmlFor="resume-display-name"
                  className="text-foreground text-[12px] font-medium"
                >
                  Display name
                </label>
                <Input
                  id="resume-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
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
                maxSize={RESUME_MAX_BYTES}
                files={uploadFiles}
                onFilesChange={setUploadFiles}
                disabled={pending}
              >
                <FileUploadDropzone className="min-h-40 rounded-lg text-[13px]">
                  Drop a PDF resume here, or browse
                </FileUploadDropzone>
                <FileUploadList />
              </FileUpload>

              <Button
                type="button"
                loading={pending}
                loadingText="Uploading…"
                disabled={!selectedPdf}
                onClick={() => void uploadResume()}
                className="w-full"
              >
                Upload PDF resume
              </Button>
            </Card>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="aavedak-section-title text-foreground">
                  {resumesLoaded ? `Your resumes (${resumes.length})` : "Your resumes"}
                </h2>
                <Link
                  href="/ats"
                  className="text-primary text-[12px] font-medium underline-offset-2 hover:underline"
                >
                  ATS scores
                </Link>
              </div>
              {!resumesLoaded ? (
                <ResumeListSkeleton rows={3} variant="documents" />
              ) : resumesLoadError ? (
                <div className="border-destructive/40 text-destructive rounded-lg border px-4 py-4 text-[13px]">
                  {resumesLoadError}
                </div>
              ) : resumes.length === 0 ? (
                <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-[13px]">
                  No resumes yet — upload a PDF to get started.
                </div>
              ) : (
                <ul className="space-y-2">
                  {resumes.map((resume) => {
                    const busy = Boolean(resumeActionId?.startsWith(`${resume.id}:`));
                    const statusBusy = resumeActionId === `${resume.id}:status`;
                    const archiveBusy = resumeActionId === `${resume.id}:archive`;
                    const renaming = editingResumeId === resume.id;
                    return (
                      <li
                        key={resume.id}
                        className="border-border/80 bg-card flex items-center gap-2 rounded-lg border p-3 sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {renaming ? (
                              <Input
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
                                className="h-7 min-w-0 flex-1 px-2 font-medium"
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
                          <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
                            <span className="min-w-0 truncate">
                              <span className="hidden sm:inline">{resume.originalFilename} · </span>
                              {formatBytes(resume.byteSize)}
                            </span>
                            {atsScoringIds.has(resume.id) ? (
                              <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1">
                                <Spinner className="size-3" label="Scoring ATS" /> ATS…
                              </span>
                            ) : resume.atsScore != null ? (
                              <span
                                className={cn(
                                  "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                  atsScoreTone(resume.atsScore),
                                )}
                              >
                                ATS {resume.atsScore}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                          <ResumePreviewButton
                            resumeName={resume.displayName}
                            size="icon-sm"
                            onClick={() => setPreviewResume(resume)}
                          />
                          <a
                            href={`/api/resumes/${resume.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open"
                            aria-label={`Open ${resume.displayName}`}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "max-sm:w-8 max-sm:min-w-8 max-sm:px-0",
                            )}
                          >
                            <OpenIcon className="size-3.5 sm:hidden" />
                            <span className="hidden text-[12px] sm:inline">Open</span>
                          </a>
                          {resume.status !== "active" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              loading={statusBusy}
                              loadingText=""
                              disabled={busy}
                              title="Set as showcase"
                              aria-label={`Set ${resume.displayName} as showcase`}
                              className="max-sm:w-8 max-sm:min-w-8 max-sm:px-0"
                              onClick={() => void patchResume(resume.id, { status: "active" })}
                            >
                              <StarIcon className="size-3.5 sm:hidden" />
                              <span className="hidden text-[12px] sm:inline">Set as showcase</span>
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              loading={statusBusy}
                              loadingText=""
                              disabled={busy}
                              title="Unset showcase"
                              aria-label={`Unset showcase for ${resume.displayName}`}
                              className="max-sm:w-8 max-sm:min-w-8 max-sm:px-0"
                              onClick={() => void patchResume(resume.id, { status: "inactive" })}
                            >
                              <StarOffIcon className="size-3.5 sm:hidden" />
                              <span className="hidden text-[12px] sm:inline">Unset showcase</span>
                            </Button>
                          )}
                          {resume.status === "inactive" ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              type="button"
                              disabled={busy || deletePending}
                              title="Delete permanently"
                              aria-label={`Delete ${resume.displayName} permanently`}
                              className="max-sm:w-8 max-sm:min-w-8 max-sm:px-0"
                              onClick={() => setDeleteTarget(resume)}
                            >
                              <TrashIcon className="size-3.5 sm:hidden" />
                              <span className="hidden text-[12px] sm:inline">
                                Delete permanently
                              </span>
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              loading={archiveBusy}
                              loadingText=""
                              disabled={busy}
                              title="Archive"
                              aria-label={`Archive ${resume.displayName}`}
                              className="max-sm:w-8 max-sm:min-w-8 max-sm:px-0"
                              onClick={() => void archiveResume(resume.id)}
                            >
                              <ArchiveIcon className="size-3.5 sm:hidden" />
                              <span className="hidden text-[12px] sm:inline">Archive</span>
                            </Button>
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
              <Card className="border-border/80 bg-card gap-0 space-y-2.5 rounded-lg border p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="aavedak-section-title text-foreground">
                    {editingClId ? "Edit cover letter" : "New cover letter"}
                  </p>
                  <TemplateVariablesInfo mode="cover" vars={coverVars} />
                </div>
                <ToggleGroup
                  aria-label="Cover letter target"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  value={[clMode]}
                  onValueChange={(next) => {
                    if (next[0] === "job" || next[0] === "custom") setClMode(next[0]);
                  }}
                >
                  <ToggleGroupItem value="job" className="h-7 rounded-full px-2.5 text-[11px]">
                    From Jobs
                  </ToggleGroupItem>
                  <ToggleGroupItem value="custom" className="h-7 rounded-full px-2.5 text-[11px]">
                    Custom company + role
                  </ToggleGroupItem>
                </ToggleGroup>
                {clMode === "job" ? (
                  <label className="block space-y-1">
                    <span className="text-muted-foreground text-[11px] font-medium">Job *</span>
                    <Combobox
                      value={clJobId || undefined}
                      onValueChange={(v) => setClJobId(v ?? "")}
                    >
                      <ComboboxTrigger
                        placeholder="Pick a job from Jobs…"
                        className="h-9 text-[13px]"
                      />
                      <ComboboxContent
                        className="z-280"
                        searchPlaceholder="Search title or company…"
                        emptyMessage="No jobs yet — add or paste a JD on Jobs"
                      >
                        {jobs.map((job) => (
                          <ComboboxItem key={job.id} value={job.id}>
                            {job.company} · {job.title}
                          </ComboboxItem>
                        ))}
                      </ComboboxContent>
                    </Combobox>
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
                      <Input
                        value={clCustomRole}
                        onChange={(e) => setClCustomRole(e.target.value)}
                        placeholder="e.g. Software Engineer"
                      />
                    </label>
                  </div>
                )}
                <Input
                  value={clTitle}
                  onChange={(e) => setClTitle(e.target.value)}
                  placeholder="Title — e.g. Cover for {{role}} at {{company}}"
                />
                <Textarea
                  value={clBody}
                  onChange={(e) => setClBody(e.target.value)}
                  placeholder={
                    "Dear Hiring Manager,\n\nI am writing to apply for the {{role}} role at {{company}}…"
                  }
                  rows={8}
                  maxRows={32}
                  className="min-h-40 font-mono text-[12px] leading-relaxed"
                />
                {clMissing.length ? (
                  <div className="border-border/80 space-y-1.5 rounded-md border border-dashed p-2">
                    <p className="text-foreground text-[11px] font-semibold">
                      Missing values ({missingVarLabels(clMissing).join(", ")})
                    </p>
                    <p className="text-muted-foreground text-[10px] leading-relaxed">
                      Highlighted in the preview and left out of the PDF and DOCX. Fill them in
                      here, or add them to your profile or the job.
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {clMissing.map((key) => (
                        <label key={key} className="block space-y-0.5">
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {`{{${key}}}`} · {missingVarLabels([key])[0]}
                          </span>
                          <Input
                            value={clFill[key] ?? ""}
                            onChange={(e) =>
                              setClFill((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className="h-7 text-[12px]"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
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
                          <SelectTrigger className="text-foreground h-8 w-full cursor-pointer rounded-lg border px-2 text-[12px]">
                            <SelectValue placeholder="Choose resume" />
                          </SelectTrigger>
                          <SelectContent className="z-240">
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
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={downloadBusy === "draft-pdf" || clOverflowsPage}
                    onClick={() => void downloadDraft("pdf")}
                  >
                    {downloadBusy === "draft-pdf" ? "PDF…" : "Download PDF"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={downloadBusy === "draft-docx" || clOverflowsPage}
                    onClick={() => void downloadDraft("docx")}
                  >
                    {downloadBusy === "draft-docx" ? "DOCX…" : "Download DOCX"}
                  </Button>
                </div>
              </Card>

              <Card className="border-border/80 bg-card min-h-144 flex flex-col gap-0 rounded-lg border p-3 shadow-sm xl:min-h-full">
                <CoverLetterPdfPreview
                  title={previewTitle}
                  body={previewBody}
                  companyName={coverTarget.company}
                  role={coverTarget.role}
                  footerRow={footerRow}
                  onOverflowChange={onClOverflowChange}
                  className="min-h-128 xl:min-h-0"
                />
              </Card>
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
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={downloadBusy === `${cl.id}-pdf`}
                              onClick={() => void downloadCl(cl, "pdf")}
                            >
                              {downloadBusy === `${cl.id}-pdf` ? "PDF…" : "PDF"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={downloadBusy === `${cl.id}-docx`}
                              onClick={() => void downloadCl(cl, "docx")}
                            >
                              {downloadBusy === `${cl.id}-docx` ? "DOCX…" : "DOCX"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
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
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => void archiveCoverLetter(cl.id)}
                            >
                              Archive
                            </Button>
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
              fromEmail={profileEmail || userEmail}
              userName={userName}
              userLinks={profileLinks}
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
              fromEmail={profileEmail || userEmail}
              userName={userName}
              userLinks={profileLinks}
            />
          </section>
        </TabsContent>
      </Tabs>

      <ResumePreviewDialog
        resume={previewResume}
        description={
          previewResume
            ? `${previewResume.originalFilename} · ${formatBytes(previewResume.byteSize)}`
            : undefined
        }
        onClose={() => setPreviewResume(null)}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) {
            if (!deletePending) setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resume permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the PDF from storage and cannot be undone. Active showcase resumes cannot
              be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteTarget ? (
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              Delete <span className="text-foreground font-medium">{deleteTarget.displayName}</span>{" "}
              ({deleteTarget.originalFilename})?
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel size="sm" disabled={deletePending}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              loading={deletePending}
              loadingText="Deleting…"
              onClick={() => void confirmDeleteInactiveResume()}
            >
              Delete permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShellWidth>
  );
}
