"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { JobFormFields } from "@/components/job-form-fields";
import { ResumePreviewDialog } from "@/components/resume-preview";
import { EngineKindBadge } from "@/components/ats-engine-badge";
import { AtsScoreMatrix } from "@/components/ats-score-matrix";
import {
  companyInitials,
  JOB_CARD_BADGE,
  JobCardContent,
  jobCardClassName,
} from "@/components/job-card";
import { BoardToggleLink, FullscreenBoard } from "@/components/fullscreen-board";
import { PersonVote, personInitials, type VoteSummaryDto } from "@/components/person-vote";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScoreRing } from "@/components/ui/score-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { STATUS_LABELS, isApplicationStatus } from "@/lib/application-status";
import { ATS_ENGINES } from "@/lib/ats-engines/registry";
import type { AtsEngineId } from "@/lib/ats-engines/types";
import { saveAtsPrefill } from "@/lib/ats-prefill";
import { JOB_SOURCES, type JobSource } from "@/lib/job-constants";
import type { JobDtoBase } from "@/lib/job-dto";

import { canonicalLocation } from "@/lib/locations";
import {
  DEFAULT_POSTED_WINDOW,
  POSTED_WINDOWS,
  parsePostedWindow,
  type PostedWindow,
} from "@/lib/job-posted-window";
import { locationFilterKeys, locationFilterLabel, matchCities } from "@/lib/job-map/locations";
import { cn } from "@/lib/utils";
import {
  clampJobsListWidth,
  JOBS_LIST_WIDTH_COOKIE,
  JOBS_LIST_WIDTH_DEFAULT,
  JOBS_LIST_WIDTH_MAX,
  JOBS_LIST_WIDTH_MIN,
} from "@/lib/jobs-list-width";
import { SearchInput } from "@/components/search-input";

export type JobDto = JobDtoBase;

export type JobsTab = "discover" | "applied";

type PendingAction =
  "create" | "parse" | "paste" | "apply" | "bookmark" | "ignore" | "unapply" | null;
export type JobsSort = "newest" | "oldest";

type ResumeLite = { id: string; displayName: string; status: string };

type JobsHubProps = {
  /** "page" = normal Jobs page; "board" = full-screen board only (/jobs/board). */
  variant?: "page" | "board";
  /** Saved list-pane width from the cookie (server-read), so the first paint is already final. */
  initialListWidth?: number;
  initialTab?: JobsTab;
  initialSort?: JobsSort;
  /** Posted filter from `?posted=` (server already filtered the initial lists by it). */
  initialPosted?: PostedWindow;
  initialJobId?: string | null;
  /** Location filter: a city id from lib/job-map/locations, "remote", or "all". */
  initialLocation?: string;
  /** Search box text from `?q=` (e.g. a city name linked from the homepage globe). */
  initialQuery?: string;
  resumes: ResumeLite[];
  initialDiscover: JobDto[];
  initialApplied: JobDto[];
  discoveryEnabled: boolean;
  profileSettingsHref: string;
};

type EmailPatternDto = {
  pattern: string;
  domain: string;
  example: string;
  confidence: number;
  evidence: number;
  source: string;
  updatedAt: string | null;
};

type JobPersonDto = {
  id: string;
  name: string;
  roleTitle: string | null;
  email: string | null;
  linkedin: string | null;
  origin: "system" | "user";
  relevanceReason: string;
  votes: VoteSummaryDto;
};

/** Must match `job_expiry_days` in apps/api/app/discovery/config.py (30). Display only. */
const EXPIRY_DAYS = 30;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function relativeAge(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** "Posted 3d ago" for discovered jobs (or "First seen" when the source had no date). */
function ageLabel(job: JobDto): string {
  if (!job.discovered) return `Added ${relativeAge(job.createdAt)}`;
  if (job.postedAt && !job.postedAtEstimated) return `Posted ${relativeAge(job.postedAt)}`;
  return `First seen ${relativeAge(job.firstSeenAt ?? job.createdAt)}`;
}

function daysLeft(job: JobDto): number | null {
  if (!job.discovered) return null;
  const age = daysSince(job.postedAt ?? job.firstSeenAt);
  return age === null ? null : Math.max(0, EXPIRY_DAYS - age);
}

function statusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return isApplicationStatus(status) ? STATUS_LABELS[status] : status;
}

export function JobsHub({
  variant = "page",
  initialListWidth = JOBS_LIST_WIDTH_DEFAULT,
  initialTab = "discover",
  initialSort = "newest",
  initialPosted = DEFAULT_POSTED_WINDOW,
  initialJobId = null,
  initialLocation = "all",
  initialQuery = "",
  resumes,
  initialDiscover,
  initialApplied,
  discoveryEnabled,
  profileSettingsHref,
}: JobsHubProps) {
  const [tab, setTab] = useState<JobsTab>(initialTab);
  const [discover, setDiscover] = useState(initialDiscover);
  const [applied, setApplied] = useState(initialApplied);
  const jobs = tab === "discover" ? discover : applied;
  const [selectedId, setSelectedId] = useState<string | null>(
    initialJobId ?? (initialTab === "applied" ? initialApplied : initialDiscover)[0]?.id ?? null,
  );

  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>(initialLocation);
  // Newest posting first by default; the toggle beside the tabs flips it.
  const [postedSort, setPostedSort] = useState<JobsSort>(initialSort);
  const [postedWindow, setPostedWindow] = useState<PostedWindow>(initialPosted);
  const [postedLoading, setPostedLoading] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const listPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Which action is running. Only that action's button shows a spinner; the rest just disable.
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const pending = pendingAction !== null;
  const [addOpen, setAddOpen] = useState(false);
  // Add job: a link to read the posting from, the result of reading it, and which section is open.
  const [jobLink, setJobLink] = useState("");
  const [linkNotice, setLinkNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [addSection, setAddSection] = useState<string | undefined>(undefined);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  // Fields the user typed into themselves; autofill asks before replacing them.
  const typedFields = useRef(new Set<DraftField>());
  const lastFetchedLink = useRef("");
  const fetchInFlight = useRef(false);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [pendingFill, setPendingFill] = useState<{
    values: Partial<Record<DraftField, string>>;
    conflicts: DraftField[];
  } | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    company: "",
    location: "",
    source: "manual" as JobSource,
    url: "",
    salary: "",
    description: "",
    workMode: "",
    employmentType: "",
    seniority: "",
    postedAt: "",
    skills: "",
    sourceUrl: "",
  });

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { all: jobs.length };
    for (const job of jobs) counts[job.sourceLabel] = (counts[job.sourceLabel] ?? 0) + 1;
    return counts;
  }, [jobs]);
  const sourceOptions = useMemo(
    () =>
      Object.keys(sourceCounts)
        .filter((k) => k !== "all")
        .sort(),
    [sourceCounts],
  );

  // Location keys per job (known cities + "remote"), shared with the homepage globe's matching.
  const locationKeysById = useMemo(
    () => new Map(jobs.map((job) => [job.id, locationFilterKeys(job.location)])),
    [jobs],
  );
  const locationOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const keys of locationKeysById.values()) {
      for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // A filter opened from a link stays listed even when this tab has no jobs there.
    if (locationFilter !== "all" && !counts.has(locationFilter)) counts.set(locationFilter, 0);
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count, label: locationFilterLabel(key) ?? key }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [locationKeysById, locationFilter]);

  // A search naming a known city also matches its other spellings ("Bengaluru" finds
  // "bangalore, India"), using the same matching as the location menu.
  const queryCities = useMemo(() => matchCities(query), [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = jobs.filter((job) => {
      if (sourceFilter !== "all" && job.sourceLabel !== sourceFilter) return false;
      if (locationFilter !== "all" && !locationKeysById.get(job.id)?.includes(locationFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        job.title.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q) ||
        queryCities.some((city) => locationKeysById.get(job.id)?.includes(city)) ||
        job.description.toLowerCase().includes(q)
      );
    });
    // Sort by posting date, falling back to first-seen when the source gave no date.
    // Jobs without any date sink to the end whichever way the list is sorted.
    const time = (job: JobDto) => {
      const raw = job.postedAt ?? job.firstSeenAt;
      if (!raw) return null;
      const t = Date.parse(raw);
      return Number.isNaN(t) ? null : t;
    };
    const direction = postedSort === "newest" ? -1 : 1;
    return [...matches].sort((a, b) => {
      const ta = time(a);
      const tb = time(b);
      if (ta === null || tb === null) return (ta === null ? 1 : 0) - (tb === null ? 1 : 0);
      return (ta - tb) * direction;
    });
  }, [jobs, query, queryCities, sourceFilter, locationFilter, locationKeysById, postedSort]);

  const selected = filtered.find((j) => j.id === selectedId) ?? filtered[0] ?? null;
  const selectedJobId = selected?.id ?? null;

  // Mirror tab, sort and selected job into the URL so a reload or shared link opens the same view.
  // replaceState (not router.replace) avoids a server round trip and keeps the history stack clean.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      url.searchParams.set("sort", postedSort);
      url.searchParams.set("posted", postedWindow);
      const q = query.trim();
      if (q) url.searchParams.set("q", q);
      else url.searchParams.delete("q");
      if (locationFilter !== "all") url.searchParams.set("location", locationFilter);
      else url.searchParams.delete("location");
      if (selectedJobId) url.searchParams.set("job", selectedJobId);
      else url.searchParams.delete("job");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // URL sync is a convenience; the board works without it.
    }
  }, [tab, postedSort, postedWindow, query, locationFilter, selectedJobId]);

  function switchTab(next: string) {
    const value: JobsTab = next === "applied" ? "applied" : "discover";
    setTab(value);
    setSourceFilter("all");
    setSelectedId((value === "applied" ? applied : discover)[0]?.id ?? null);
  }

  // Persist once per completed drag (not per pointer move) so the server renders this width next time.
  function saveListWidth() {
    const px = listPanelRef.current?.getSize().inPixels;
    if (!px) return;
    document.cookie = `${JOBS_LIST_WIDTH_COOKIE}=${clampJobsListWidth(px)}; path=/; max-age=31536000; samesite=lax`;
  }

  const EMPTY_DRAFT = {
    title: "",
    company: "",
    location: "",
    source: "manual" as JobSource,
    url: "",
    salary: "",
    description: "",
    workMode: "",
    employmentType: "",
    seniority: "",
    postedAt: "",
    skills: "",
    sourceUrl: "",
  };

  function closeAddJob() {
    setAddOpen(false);
    setJobLink("");
    setLinkNotice(null);
    setAddSection(undefined);
    setPendingFill(null);
    setLocationHint(null);
    typedFields.current.clear();
    lastFetchedLink.current = "";
  }

  /** A field the user edits by hand: remembered so autofill won't silently replace it. */
  function editDraft(field: DraftField, value: string) {
    typedFields.current.add(field);
    setDraft((d) => ({ ...d, [field]: value }));
  }

  /**
   * Put values read from a posting into the form. Empty values are skipped. Fields the user
   * already typed (and that differ) are only replaced with `overwrite`; otherwise they are
   * listed so the user can confirm.
   */
  function applyFill(values: Partial<Record<DraftField, string>>, overwrite: boolean) {
    const conflicts: DraftField[] = [];
    const next: Partial<Record<DraftField, string>> = {};
    for (const [key, raw] of Object.entries(values) as [DraftField, string | undefined][]) {
      const value = (raw ?? "").trim();
      if (!value) continue;
      const current = String(draft[key] ?? "").trim();
      if (!overwrite && typedFields.current.has(key) && current && current !== value) {
        conflicts.push(key);
        continue;
      }
      next[key] = value;
    }
    setDraft((d) => ({ ...d, ...next }));
    if (overwrite)
      for (const key of Object.keys(values) as DraftField[]) typedFields.current.delete(key);
    setPendingFill(conflicts.length ? { values: pickFields(values, conflicts), conflicts } : null);
  }

  /** Job sites we don't read still get the right source and keep their link. */
  function sourceFromLink(link: string): JobSource {
    try {
      const host = new URL(link).hostname.toLowerCase();
      if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
      if (/(^|\.)indeed\.(com|co\.in)$/.test(host)) return "indeed";
      return "other";
    } catch {
      return "manual";
    }
  }

  /** Read the posting behind a link (FastAPI) and fill the form for review. Saves nothing. */
  async function fetchFromLink(rawLink?: string) {
    const link = (rawLink ?? jobLink).trim();
    // Blur then a Fetch click (or paste then blur) must not start a second request.
    if (!link || fetchInFlight.current) return;
    const problem = jobLinkProblem(link);
    if (problem) {
      setLinkNotice({ ok: false, text: problem });
      return;
    }
    lastFetchedLink.current = link;
    fetchInFlight.current = true;
    setLinkNotice(null);
    setPendingFill(null);
    setPendingAction("parse");
    try {
      const res = await fetch("/api/jobs/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = (await res.json()) as {
        job?: {
          title: string;
          company: string;
          location: string;
          url: string;
          description: string;
          source: string;
          postedAt?: string | null;
          salary?: string | null;
          workMode?: string | null;
          employmentType?: string | null;
          seniority?: string | null;
          applyUrl?: string | null;
          skills?: string[];
        };
        error?: string;
      };
      if (!res.ok || !data.job) {
        // Can't read it: keep the link so the user only has to type the rest.
        setDraft((d) => ({
          ...d,
          url: d.url || link,
          sourceUrl: link,
          source: sourceFromLink(link),
        }));
        setLinkNotice({
          ok: false,
          text: data.error || "Couldn't read that posting — fill manually.",
        });
      } else {
        const job = data.job;
        // Only fields the posting actually gave; typed fields wait for confirmation.
        setDraft((d) => ({
          ...d,
          sourceUrl: link,
          source: (JOB_SOURCES as readonly string[]).includes(job.source)
            ? (job.source as JobSource)
            : "careers",
        }));
        // Only a confident canonical match fills Location; otherwise show what the posting said.
        const canonical = canonicalLocation(job.location);
        setLocationHint(!canonical && job.location ? job.location : null);
        applyFill(
          {
            title: job.title,
            company: job.company,
            location: canonical ?? "",
            url: job.applyUrl || job.url || link,
            description: job.description,
            salary: job.salary ?? "",
            workMode: job.workMode ?? "",
            employmentType: job.employmentType ?? "",
            seniority: job.seniority ?? "",
            postedAt: job.postedAt ? job.postedAt.slice(0, 10) : "",
            skills: (job.skills ?? []).join(", "),
          },
          false,
        );
        const missing = [
          !job.title && "title",
          !job.company && "company",
          !job.location && "location",
          !job.description && "description",
        ].filter(Boolean);
        setLinkNotice({
          ok: true,
          text: missing.length
            ? `Details filled in. The posting didn't include: ${missing.join(", ")}. Add them below.`
            : "Details filled in from the posting. Check them, then Create.",
        });
      }
      setAddSection("manual");
    } catch {
      setLinkNotice({ ok: false, text: "Could not reach the server. Try again." });
    } finally {
      fetchInFlight.current = false;
      setPendingAction(null);
    }
  }

  async function createJob() {
    setError(null);
    setMessage(null);
    setPendingAction("create");
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          company: draft.company,
          location: draft.location,
          source: draft.source,
          url: draft.url || null,
          salary: draft.salary || null,
          description: draft.description,
          sourceUrl: draft.sourceUrl || null,
          workMode: draft.workMode || null,
          employmentType: draft.employmentType || null,
          seniority: draft.seniority || null,
          postedAt: draft.postedAt || null,
          skills: draft.skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = (await res.json()) as { job?: JobDto; error?: string };
      if (!res.ok) throw new Error(data.error || "Create failed.");
      if (data.job) {
        setDiscover((list) => [data.job!, ...list]);
        setTab("discover");
        setSelectedId(data.job.id);
      }
      setDraft(EMPTY_DRAFT);
      closeAddJob();
      setMessage("Job added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setPendingAction(null);
    }
  }

  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState("");

  /** Reload both tabs from the server; returns the Discover ids now listed. */
  async function reloadJobs(window: PostedWindow = postedWindow): Promise<string[] | null> {
    const res = await fetch(`/api/jobs?posted=${window}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { discover: JobDto[]; applied: JobDto[] };
    setDiscover(data.discover);
    setApplied(data.applied);
    return data.discover.map((j) => j.id);
  }

  /** Posted filter: the server re-filters both tabs; keep the selection if it's still listed. */
  async function changePostedWindow(next: PostedWindow) {
    if (next === postedWindow) return;
    setPostedWindow(next);
    setPostedLoading(true);
    try {
      const ids = await reloadJobs(next);
      if (ids === null) setError("Could not load jobs for that date range.");
    } finally {
      setPostedLoading(false);
    }
  }

  /**
   * Refresh jobs: queue (or resume) a scan of every career source, then run it in budgeted
   * batches until done, reloading the list after each batch so new matches appear as they land.
   */
  async function refreshJobs() {
    setRefreshing(true);
    setRefreshProgress("Starting…");
    const initialIds = new Set(discover.map((j) => j.id));
    let latestIds: string[] = [...initialIds];
    try {
      const start = await fetch("/api/jobs/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "start" }),
      });
      const started = (await start.json()) as { error?: string };
      if (!start.ok) throw new Error(started.error || "Could not start the refresh.");
      for (let round = 0; round < 40; round++) {
        const res = await fetch("/api/jobs/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "tick" }),
        });
        const tick = (await res.json()) as {
          remaining?: number;
          processed?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(tick.error || "Refresh failed.");
        latestIds = (await reloadJobs()) ?? latestIds;
        setRefreshProgress(`${tick.remaining ?? 0} sources left…`);
        if (!tick.remaining || !tick.processed) break;
      }
      const added = latestIds.filter((id) => !initialIds.has(id)).length;
      toast.add({
        title: "Jobs refreshed",
        description:
          added > 0
            ? `${added} new match${added === 1 ? "" : "es"} added to Discover.`
            : "No new matches right now.",
        type: "success",
      });
    } catch (err) {
      toast.add({
        title: "Refresh failed",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
    } finally {
      setRefreshing(false);
      setRefreshProgress("");
    }
  }

  async function ignoreJob(id: string) {
    setError(null);
    setMessage(null);
    setPendingAction("ignore");
    try {
      const res = await fetch(`/api/jobs/${id}/ignore`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not ignore.");
      setDiscover((list) => list.filter((j) => j.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast.add({ title: "Ignored", description: "Hidden from Discover.", type: "info" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not ignore.");
    } finally {
      setPendingAction(null);
    }
  }

  /**
   * Mark as unapplied: the server removes the tracker application (its follow-ups are
   * cancelled, cover letters kept but unlinked); the job goes back to Discover.
   */
  async function unapplyJob(job: JobDto): Promise<boolean> {
    setError(null);
    setMessage(null);
    setPendingAction("unapply");
    try {
      const res = await fetch(`/api/jobs/${job.id}/unapply`, { method: "POST" });
      const data = (await res.json()) as { error?: string; cancelledFollowUps?: number };
      if (!res.ok) throw new Error(data.error || "Could not mark as unapplied.");
      setApplied((list) => list.filter((j) => j.id !== job.id));
      const ids = await reloadJobs();
      if (ids === null) {
        setDiscover((list) => [
          { ...job, applicationId: null, applicationStatus: null },
          ...list.filter((j) => j.id !== job.id),
        ]);
      }
      if (selectedId === job.id) setSelectedId(null);
      const cancelled = data.cancelledFollowUps ?? 0;
      toast.add({
        title: "Marked as unapplied",
        description: `Moved back to Discover and removed from your tracker${
          cancelled ? `; ${cancelled} follow-up${cancelled === 1 ? "" : "s"} cancelled` : ""
        }.`,
        type: "success",
      });
      return true;
    } catch (err) {
      toast.add({
        title: "Could not mark as unapplied",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      });
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  /** Bookmark / Apply create an application; the job moves to the Applied tab. */
  async function createApplicationFromJob(job: JobDto, status: "bookmarked" | "applied") {
    setError(null);
    setMessage(null);
    setPendingAction(status === "applied" ? "apply" : "bookmark");
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: job.company,
          role: job.title,
          location: job.location,
          salaryCtc: job.salary,
          jobLink: job.url,
          jobId: job.id,
          status,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        duplicateWarning?: boolean;
        application?: { id: string; status: string };
      };
      if (!res.ok) throw new Error(data.error || "Could not create application.");
      const moved: JobDto = {
        ...job,
        applicationId: data.application?.id ?? null,
        applicationStatus: data.application?.status ?? status,
      };
      setDiscover((list) => list.filter((j) => j.id !== job.id));
      setApplied((list) => [moved, ...list.filter((j) => j.id !== job.id)]);
      setSelectedId(null);
      const label = status === "bookmarked" ? "Bookmarked" : "Marked applied";
      setMessage(
        data.duplicateWarning
          ? `${label} — moved to Applied (possible duplicate company+role in tracker).`
          : `${label} — moved to Applied. Continue in the Job tracker.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create application.");
    } finally {
      setPendingAction(null);
    }
  }

  async function pasteJd() {
    setError(null);
    setMessage(null);
    if (!pasteText.trim()) {
      setError("Paste a job description first.");
      return;
    }
    setPendingAction("paste");
    try {
      // Register as a manual job so it can be scored + used for cover letters
      const lines = pasteText
        .trim()
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);
      const titleGuess = lines[0]?.slice(0, 120) || "Pasted role";
      const companyGuess =
        lines
          .find((l) => /^company\s*:/i.test(l))
          ?.split(":")
          .slice(1)
          .join(":")
          .trim() || "Custom company";
      const createRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleGuess,
          company: companyGuess,
          location: "Remote",
          source: "manual",
          description: pasteText,
        }),
      });
      const createData = (await createRes.json()) as { job?: JobDto; error?: string };
      if (!createRes.ok) throw new Error(createData.error || "Could not register job.");
      if (createData.job) {
        setDiscover((list) => [createData.job!, ...list]);
        setTab("discover");
        setSelectedId(createData.job.id);
      }
      await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: pasteText,
          jobId: createData.job?.id ?? null,
        }),
      });
      setPasteOpen(false);
      setPasteText("");
      setMessage(
        `Registered job · Match ${createData.job?.compatibilityScore ?? "—"}% · JD quality ${createData.job?.atsScore ?? "—"}%. Generate a cover letter from Documents.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setPendingAction(null);
    }
  }

  const boardQuery = `tab=${tab}&sort=${postedSort}&posted=${postedWindow}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}${locationFilter !== "all" ? `&location=${encodeURIComponent(locationFilter)}` : ""}${selected ? `&job=${encodeURIComponent(selected.id)}` : ""}`;

  const listPane = (
    <>
      <div className="border-border/60 flex items-center gap-2 border-b p-3">
        <Tabs value={tab} onValueChange={switchTab} className="min-w-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="discover" className="flex-1">
              Discover
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                {discover.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="applied" className="flex-1">
              Applied
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                {applied.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <ToggleGroup
          aria-label="Sort by posted date"
          variant="outline"
          size="sm"
          value={[postedSort]}
          // Single mode lets the pressed item turn off; a sort always has one active direction.
          onValueChange={(next) => {
            const direction = next[0];
            if (direction === "newest" || direction === "oldest") setPostedSort(direction);
          }}
          className="shrink-0"
        >
          {(
            [
              { value: "newest", label: "Newest first", path: "M12 19V5m0 0-6 6m6-6 6 6" },
              { value: "oldest", label: "Oldest first", path: "M12 5v14m0 0-6-6m6 6 6-6" },
            ] as const
          ).map((opt) => (
            <ToggleGroupItem
              key={opt.value}
              value={opt.value}
              aria-label={`Sort by posted date: ${opt.label.toLowerCase()}`}
              title={opt.label}
              className="size-8 px-0"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden>
                <path
                  d={opt.path}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <JobList
        jobs={filtered}
        tab={tab}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
      />
    </>
  );

  const detailPane = (
    <>
      {!selected ? (
        <EmptyState
          tab={tab}
          hasJobs={jobs.length > 0}
          discoveryEnabled={discoveryEnabled}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <JobDetail
          key={selected.id}
          job={selected}
          stretch={variant === "board"}
          tab={tab}
          pendingAction={pendingAction}
          resumes={resumes}
          onApply={() => void createApplicationFromJob(selected, "applied")}
          onBookmark={() => void createApplicationFromJob(selected, "bookmarked")}
          onIgnore={() => void ignoreJob(selected.id)}
          onUnapply={() => unapplyJob(selected)}
        />
      )}
    </>
  );

  const notices = (
    <>
      {tab === "discover" && !discoveryEnabled ? (
        <Card size="sm" className="border-dashed">
          <CardHeader>
            <CardTitle className="text-[13px]">Daily discovery is paused</CardTitle>
            <CardDescription className="text-[12px]">
              You won&apos;t get new recommendations until you turn it back on. Existing ones stay
              here until you apply or ignore them.{" "}
              <Link href={profileSettingsHref} className="text-primary hover:underline">
                Profile settings → Job discovery
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <p className="text-primary text-[13px]">
          {message}{" "}
          <Link href="/job-tracker" className="font-medium underline-offset-2 hover:underline">
            Open tracker
          </Link>
        </p>
      ) : null}
    </>
  );

  const board = (
    <>
      {/* Top bar: search, filter, add, expand/collapse */}
      <Card size="sm" className="flex-row flex-wrap items-center gap-2 p-2 sm:flex-nowrap">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, company, location, description…"
          className="w-full sm:max-w-md"
          aria-label="Search jobs"
        />
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v || "all")}>
          <SelectTrigger
            className="h-8 w-56 rounded-md border px-2.5 text-[12px]"
            aria-label="Filter by source"
          >
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent className="z-240">
            <SelectItem value="all" className="text-[12px]">
              All sources ({sourceCounts.all ?? 0})
            </SelectItem>
            {sourceOptions.map((key) => (
              <SelectItem key={key} value={key} className="text-[12px]">
                {key} ({sourceCounts[key] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={postedWindow}
          onValueChange={(v) => void changePostedWindow(parsePostedWindow(v))}
          disabled={postedLoading}
        >
          <SelectTrigger
            className="h-8 w-36 rounded-md border px-2.5 text-[12px]"
            aria-label="Filter by posted date"
          >
            <SelectValue placeholder="Posted" />
          </SelectTrigger>
          <SelectContent className="z-240">
            {POSTED_WINDOWS.map((w) => (
              <SelectItem key={w.value} value={w.value} className="text-[12px]">
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={(v) => setLocationFilter(v || "all")}>
          <SelectTrigger
            className="h-8 w-44 rounded-md border px-2.5 text-[12px]"
            aria-label="Filter by location"
          >
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent className="z-240">
            <SelectItem value="all" className="text-[12px]">
              All locations ({jobs.length})
            </SelectItem>
            {locationOptions.map((option) => (
              <SelectItem key={option.key} value={option.key} className="text-[12px]">
                {option.label} ({option.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
          {filtered.length} of {jobs.length}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setPasteOpen(true)}>
            Paste JD
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            Add job
          </Button>
          <Button
            type="button"
            size="sm"
            loading={refreshing}
            loadingText={refreshProgress || "Refreshing…"}
            onClick={() => void refreshJobs()}
            title="Scan all company career pages now and reload your matches"
          >
            Refresh jobs
          </Button>
          <BoardToggleLink
            expanded={variant === "board"}
            href={variant === "board" ? `/jobs?${boardQuery}` : `/jobs/board?${boardQuery}`}
            label="jobs board"
          />
        </div>
      </Card>

      {/* List | details. Desktop: resizable blocks (width saved to a cookie). Mobile: stacked cards. */}
      {isDesktop ? (
        // The library sets height:100% inline, so the fixed height has to sit on this wrapper.
        <div
          className={cn(
            "flex",
            variant === "board" ? "min-h-0 flex-1" : "md:min-h-128 md:h-[calc(100dvh-17rem)]",
          )}
        >
          <ResizablePanelGroup
            variant="blocks"
            orientation="horizontal"
            onLayoutChanged={saveListWidth}
            className="h-full w-full"
          >
            <ResizablePanel
              id="jobs-list"
              // Section colour: job cards (bg-card) sit on the muted list.
              className="bg-muted"
              panelRef={listPanelRef}
              defaultSize={`${initialListWidth}px`}
              minSize={`${JOBS_LIST_WIDTH_MIN}px`}
              maxSize={`${JOBS_LIST_WIDTH_MAX}px`}
              groupResizeBehavior="preserve-pixel-size"
            >
              <div className="flex h-full min-h-0 flex-col">{listPane}</div>
            </ResizablePanel>
            <ResizableHandle aria-label="Resize panes" />
            <ResizablePanel id="jobs-detail" className="bg-muted/20">
              <ScrollArea className="h-full">
                <div className="flex min-h-full flex-col p-3 sm:p-4">{detailPane}</div>
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="bg-muted flex max-h-[60vh] w-full flex-col gap-0 overflow-hidden p-0">
            {listPane}
          </Card>
          <Card className="bg-muted/20 min-w-0 gap-0 p-3 sm:p-4">{detailPane}</Card>
        </div>
      )}
    </>
  );

  const modals = (
    <>
      <Dialog
        open={addOpen}
        onOpenChange={(next) => {
          if (!next) closeAddJob();
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add job</DialogTitle>
            <DialogDescription>
              Paste the job&apos;s link and Aavedak fills in the details, or enter them yourself.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="add-job-link" className="text-[12px]">
              Job link (LinkedIn or company careers page)
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="add-job-link"
                type="url"
                inputMode="url"
                value={jobLink}
                onChange={(e) => setJobLink(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text").trim();
                  if (pasted) {
                    e.preventDefault();
                    setJobLink(pasted);
                    void fetchFromLink(pasted);
                  }
                }}
                onBlur={() => {
                  const link = jobLink.trim();
                  if (link && link !== lastFetchedLink.current) void fetchFromLink(link);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void fetchFromLink();
                  }
                }}
                placeholder="https://www.linkedin.com/jobs/view/…"
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0"
                loading={pendingAction === "parse"}
                loadingText="Fetching…"
                disabled={!jobLink.trim() || pending}
                onClick={() => void fetchFromLink()}
              >
                Fetch
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Paste a LinkedIn job link, or one from Greenhouse, Lever, Ashby, Workable,
              SmartRecruiters, SuccessFactors or a company careers page, and the details fill in.
              Everything stays editable. Naukri and Indeed can&apos;t be read; their link is kept
              and you fill in the rest.
            </p>
            {linkNotice ? (
              <Alert variant={linkNotice.ok ? "default" : "destructive"}>
                <AlertDescription className="text-[12px]">{linkNotice.text}</AlertDescription>
              </Alert>
            ) : null}
            {pendingFill ? (
              <Alert>
                <AlertDescription className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="min-w-0 flex-1">
                    The posting has different values for fields you typed:{" "}
                    {pendingFill.conflicts.map((f) => DRAFT_FIELD_LABELS[f]).join(", ")}. Replace
                    them?
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingFill(null)}
                  >
                    Keep mine
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => applyFill(pendingFill.values, true)}
                  >
                    Replace
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <Marker variant="separator" className="text-[11px] uppercase tracking-wide">
            <MarkerContent>or</MarkerContent>
          </Marker>

          <Accordion
            type="single"
            collapsible
            value={addSection}
            onValueChange={setAddSection}
            className="border-y-0"
          >
            <AccordionItem value="manual" className="border-border rounded-lg border">
              <AccordionTrigger className="text-foreground px-3 text-[13px] font-semibold hover:no-underline">
                Add manually
              </AccordionTrigger>
              <AccordionContent>
                <JobFormFields
                  value={draft}
                  onFieldChange={editDraft}
                  onSourceChange={(src) => setDraft((d) => ({ ...d, source: src }))}
                  locationHint={locationHint}
                  onLocationPicked={() => setLocationHint(null)}
                  className="px-3 pb-1"
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DialogFooter>
            <Button variant="outline" size="sm" type="button" onClick={closeAddJob}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              loading={pendingAction === "create"}
              disabled={
                pending || !draft.title.trim() || !draft.company.trim() || !draft.location.trim()
              }
              onClick={() => void createJob()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pasteOpen}
        onOpenChange={(next) => {
          if (!next) (() => setPasteOpen(false))();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste JD (private analysis)</DialogTitle>
            <DialogDescription>
              Registers the JD as a job on your Jobs list, scores resume match + ATS, then you can
              generate a cover letter.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={10}
            placeholder="Paste job description text…"
            className="py-2"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" type="button" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              loading={pendingAction === "paste"}
              disabled={pending}
              onClick={() => void pasteJd()}
            >
              Save analysis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (variant === "board") {
    // Full-screen board: covers the site header/footer; only the board is shown.
    return (
      <FullscreenBoard>
        {notices}
        {board}
        {modals}
      </FullscreenBoard>
    );
  }

  // Page variant: the heading lives in app/jobs/page.tsx so it renders before this loads.
  return (
    <>
      {notices}
      {board}
      <HowJobsWork />
      {modals}
    </>
  );
}

function EmptyState({
  tab,
  hasJobs,
  discoveryEnabled,
  onAdd,
}: {
  tab: JobsTab;
  hasJobs: boolean;
  discoveryEnabled: boolean;
  onAdd: () => void;
}) {
  let text = "Select a job to see details.";
  if (!hasJobs && tab === "applied") {
    text = "Nothing here yet. Apply to or bookmark a job from Discover and it moves here.";
  } else if (!hasJobs) {
    text = discoveryEnabled
      ? "No new matches right now. Discovery scans career pages every night (IST) and adds up to 50 new junior roles a day."
      : "Discovery is paused. Add a job manually or turn discovery back on in Profile settings.";
  }
  return (
    <div className="text-muted-foreground flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center text-[13px]">
      <p className="max-w-sm">{text}</p>
      {!hasJobs && tab === "discover" ? (
        <Button type="button" variant="link" size="sm" onClick={onAdd}>
          Add a job manually
        </Button>
      ) : null}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-foreground text-[13px] font-semibold tracking-tight">{children}</h3>
      {action}
    </div>
  );
}

/** Right-hand side: four separate cards — job, about/JD, people, resume (ATS). */
function JobDetail({
  job,
  stretch,
  tab,
  pendingAction,
  resumes,
  onApply,
  onBookmark,
  onIgnore,
  onUnapply,
}: {
  job: JobDto;
  /** Full-screen board: fill the panel height and let "About the job" take the spare space. */
  stretch: boolean;
  tab: JobsTab;
  pendingAction: PendingAction;
  resumes: ResumeLite[];
  onApply: () => void;
  onBookmark: () => void;
  onIgnore: () => void;
  onUnapply: () => Promise<boolean>;
}) {
  const pending = pendingAction !== null;
  const [confirmUnapply, setConfirmUnapply] = useState(false);
  const left = daysLeft(job);
  const reasons = [...(job.reasons?.skills ?? []), ...(job.reasons?.roles ?? [])].slice(0, 8);

  async function copyDescription() {
    try {
      await navigator.clipboard.writeText(job.description);
      toast.add({ title: "Job description copied", type: "success", duration: 2000 });
    } catch {
      toast.add({
        title: "Could not copy",
        description: "Your browser blocked clipboard access.",
        type: "error",
      });
    }
  }

  return (
    // flex-1: fill the details panel's full height (board and page) so no empty band is left.
    <div className={cn("flex flex-col gap-4", stretch && "flex-1")}>
      {/* 1 · Job */}
      <Card className="gap-3">
        <div className="flex items-start gap-3">
          <Avatar className="size-10 rounded-md">
            <AvatarFallback className="rounded-md text-[12px] font-semibold">
              {companyInitials(job.company)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="aavedak-display text-foreground text-lg leading-snug sm:text-xl">
              {job.title}
            </h2>
            <p className="text-muted-foreground text-[13px]">
              <span className="text-foreground/90">{job.company}</span> · {job.location}
            </p>
          </div>
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "xs" })}
            >
              Original post ↗
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {job.sourceLabel}
          </Badge>
          {tab === "applied" && job.applicationStatus ? (
            <Badge className="text-[10px]">{statusLabel(job.applicationStatus)}</Badge>
          ) : null}
          {job.removedFromPortal ? (
            <Badge
              variant="outline"
              className="border-destructive/40 text-destructive text-[10px]"
              title="This posting was filled or pulled from the source. It's gone from Discover, but your application is kept."
            >
              Removed from portal
            </Badge>
          ) : null}
          {job.compatibilityScore != null ? (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              Match {job.compatibilityScore}%
            </Badge>
          ) : null}
          {job.atsScore != null ? (
            <Badge
              variant="secondary"
              className="text-[10px] tabular-nums"
              title="How complete and parseable the job description is"
            >
              JD quality {job.atsScore}%
            </Badge>
          ) : null}
          <Badge variant="secondary" className="text-[10px]">
            {job.minYears == null
              ? "Experience not stated"
              : job.minYears === 0
                ? "Fresher friendly"
                : `${job.minYears}+ yrs`}
          </Badge>
          {job.salary ? (
            <Badge variant="secondary" className="text-[10px]" title="Pay stated by the company">
              {job.salary}
            </Badge>
          ) : null}
          <span className="text-muted-foreground text-[11px]">{ageLabel(job)}</span>
          {left !== null ? (
            <span
              className={cn(
                "text-[11px]",
                left <= 5 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              · {left === 0 ? "expires today" : `${left}d left`}
            </span>
          ) : null}
        </div>

        {job.applyEmail ? (
          <p className="text-muted-foreground text-[11px]">
            Apply by email:{" "}
            <a href={`mailto:${job.applyEmail}`} className="text-primary hover:underline">
              {job.applyEmail}
            </a>{" "}
            <span title="Published in the posting; Aavedak has not verified it">
              (from the posting · unverified)
            </span>
          </p>
        ) : null}

        {reasons.length > 0 ? (
          <p className="text-muted-foreground text-[11px]">
            Matches your profile: <span className="text-foreground/90">{reasons.join(", ")}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {tab === "discover" ? (
            <>
              <Button
                type="button"
                size="sm"
                loading={pendingAction === "apply"}
                loadingText="Applying…"
                disabled={pending}
                onClick={onApply}
              >
                Mark applied
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={pendingAction === "bookmark"}
                loadingText="Saving…"
                disabled={pending}
                onClick={onBookmark}
              >
                Bookmark
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={pendingAction === "ignore"}
                loadingText="Hiding…"
                disabled={pending}
                onClick={onIgnore}
              >
                Ignore
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/job-tracker"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open in tracker
              </Link>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                disabled={pending}
                onClick={() => setConfirmUnapply(true)}
              >
                Mark as unapplied
              </Button>
            </>
          )}
          <Link
            href={`/documents?tab=cover_letters&jobId=${job.id}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Cover letter
          </Link>
        </div>
      </Card>

      <AlertDialog
        open={confirmUnapply}
        onOpenChange={(open) => {
          if (!open && pendingAction !== "unapply") setConfirmUnapply(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark “{job.title}” as unapplied?</AlertDialogTitle>
            <AlertDialogDescription>
              The job moves back to Discover. Its application is removed from your Job tracker,
              along with its status history, so it no longer counts on your dashboard. Follow-ups
              waiting to be sent for it are cancelled. Cover letters you wrote for it are kept in
              Documents, just no longer linked to an application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction === "unapply"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="cursor-pointer"
              loading={pendingAction === "unapply"}
              onClick={(e) => {
                e.preventDefault();
                void onUnapply().then((ok) => {
                  if (ok) setConfirmUnapply(false);
                });
              }}
            >
              Mark as unapplied
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 2 · About / JD — stretches to take any spare height */}
      <Card className={cn("gap-2", stretch && "min-h-48 flex-1")}>
        <SectionTitle
          action={
            job.description ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => void copyDescription()}
                aria-label="Copy job description"
                title="Copy job description"
              >
                <CopyIcon />
              </Button>
            ) : null
          }
        >
          About the job
        </SectionTitle>
        <pre
          className={cn(
            "text-muted-foreground overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed",
            // Normal view: capped height (scrolls inside). Board: stretch to fill.
            stretch ? "min-h-0 flex-1" : "max-h-80",
          )}
        >
          {job.description || "No description provided."}
        </pre>
      </Card>

      {/* 3 · People */}
      <JobPeople jobId={job.id} company={job.company} />

      {/* 4 · Resume (ATS) */}
      <JobAtsCheck job={job} resumes={resumes} />
    </div>
  );
}

type AtsResultCell = {
  status: string;
  overallScore?: number | null;
  scoreName?: string;
  error?: string;
  failureKind?: string;
};

type AtsCellState = AtsResultCell | "running" | "queued";

const atsKey = (resumeId: string, engineId: string) => `${resumeId}::${engineId}`;

/**
 * Resume × engine matrix for this job, like the ATS page: pick resumes and any number of
 * engines, run them, see a score per cell. "Detailed scan" opens the ATS page pre-filled.
 */
function JobAtsCheck({ job, resumes }: { job: JobDto; resumes: ResumeLite[] }) {
  const router = useRouter();
  const [resumeIds, setResumeIds] = useState<Set<string>>(() => new Set(resumes.map((r) => r.id)));
  const [engineIds, setEngineIds] = useState<Set<AtsEngineId>>(() => new Set(["aavedak"]));
  const [previewResume, setPreviewResume] = useState<ResumeLite | null>(null);
  const [cells, setCells] = useState<Record<string, AtsCellState>>({});
  const [running, setRunning] = useState(false);
  const runToken = useRef(0);

  const selectedResumes = resumes.filter((r) => resumeIds.has(r.id));
  const selectedEngines = ATS_ENGINES.filter((e) => engineIds.has(e.id));
  const total = selectedResumes.length * selectedEngines.length;
  const done = Object.values(cells).filter((c) => c !== "running" && c !== "queued").length;

  function toggleResume(id: string, on: boolean) {
    setResumeIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runOne(resumeId: string, engineId: AtsEngineId, forceExtract: boolean) {
    const key = atsKey(resumeId, engineId);
    setCells((prev) => ({ ...prev, [key]: "running" }));
    let cell: AtsResultCell;
    try {
      const res = await fetch("/api/ats/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId,
          engineId,
          sharedRole: job.title,
          sharedJdText: job.description.slice(0, 40_000),
          forceExtract,
        }),
      });
      const data = (await res.json()) as { result?: AtsResultCell; error?: string };
      cell = data.result ?? { status: "error", error: data.error || "Scan failed." };
    } catch {
      cell = { status: "error", error: "Network error." };
    }
    setCells((prev) => ({ ...prev, [key]: cell }));
  }

  async function runScan() {
    if (total === 0) return;
    const token = ++runToken.current;
    setRunning(true);
    setCells(
      Object.fromEntries(
        selectedResumes.flatMap((r) =>
          selectedEngines.map((e) => [atsKey(r.id, e.id), "queued" as const]),
        ),
      ),
    );
    // Resumes in parallel (Promise.all); each resume's engines in order so its PDF text is
    // extracted once by the first engine and reused by the rest.
    await Promise.all(
      selectedResumes.map(async (resume) => {
        for (const [index, engine] of selectedEngines.entries()) {
          if (runToken.current !== token) return;
          await runOne(resume.id, engine.id, index === 0);
        }
      }),
    );
    if (runToken.current === token) setRunning(false);
  }

  function openDetailed() {
    saveAtsPrefill({
      role: job.title,
      jdText: job.description.slice(0, 40_000),
      resumeIds: [...resumeIds],
      engineIds: [...engineIds],
      job: { id: job.id, title: job.title, company: job.company, url: job.url },
    });
    router.push("/ats");
  }

  function renderCell(resumeId: string, engineId: AtsEngineId) {
    const cell = cells[atsKey(resumeId, engineId)];
    // Every state renders in the same fixed-height, centered box: the score ring appearing
    // never changes the row height, and the spinner sits in the middle of the cell.
    const box = (content: React.ReactNode, title?: string) => (
      <div className="flex h-12 items-center justify-center" title={title}>
        {content}
      </div>
    );
    if (!cell) return box(<span className="text-muted-foreground text-[11px]">—</span>);
    if (cell === "queued")
      return box(<span className="text-muted-foreground text-[10px]">Queued</span>);
    if (cell === "running") return box(<Spinner className="size-5" label="Scanning" />);
    if (cell.status === "done" && cell.overallScore != null) {
      return box(<ScoreRing value={cell.overallScore} size="xs" />, cell.scoreName);
    }
    return box(
      <span
        className={cn(
          "px-1 text-[10px] leading-tight",
          cell.status === "excluded" || cell.status === "unsupported"
            ? "text-muted-foreground"
            : "text-destructive",
        )}
      >
        {cell.status === "excluded"
          ? "Needs input"
          : cell.status === "unsupported"
            ? "Unsupported"
            : "Failed"}
      </span>,
      cell.error,
    );
  }

  return (
    <Card className="gap-3">
      <SectionTitle
        action={
          running ? (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {done} of {total} done
            </span>
          ) : null
        }
      >
        Resume check (ATS)
      </SectionTitle>

      {resumes.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">
          Upload a resume in{" "}
          <Link href="/documents" className="text-primary hover:underline">
            Documents
          </Link>{" "}
          to score it against this job.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-[11px] font-medium">Engines</p>
            <ToggleGroup
              aria-label="ATS engines"
              multiple
              variant="outline"
              size="sm"
              spacing={1}
              disabled={running}
              className="flex-wrap"
              value={[...engineIds]}
              onValueChange={(next) => setEngineIds(new Set(next as AtsEngineId[]))}
            >
              {ATS_ENGINES.map((eng) => (
                <ToggleGroupItem
                  key={eng.id}
                  value={eng.id}
                  title={eng.shortDescription}
                  className="h-7 gap-1.5 px-2 text-xs"
                >
                  {eng.name}
                  <EngineKindBadge engineId={eng.id} />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <AtsScoreMatrix
            engines={selectedEngines.map((eng) => ({
              id: eng.id,
              header: <span className="text-[11px] font-medium leading-tight">{eng.name}</span>,
            }))}
            resumes={resumes}
            renderCell={(resumeId, engineId) =>
              resumeIds.has(resumeId) ? renderCell(resumeId, engineId) : <div className="h-12" />
            }
            finalScores={(resumeId) =>
              resumeIds.has(resumeId)
                ? selectedEngines.flatMap((eng) => {
                    const c = cells[atsKey(resumeId, eng.id)];
                    return typeof c === "object" && c.status === "done" && c.overallScore != null
                      ? [{ engineId: eng.id, score: c.overallScore }]
                      : [];
                  })
                : null
            }
            renderResumeLeading={(resume) => (
              <Checkbox
                checked={resumeIds.has(resume.id)}
                onChange={(e) => toggleResume(resume.id, e.target.checked)}
                disabled={running}
                aria-label={`Include ${resume.displayName}`}
              />
            )}
            onPreview={setPreviewResume}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              loading={running}
              loadingText="Analyzing…"
              disabled={total === 0}
              onClick={() => void runScan()}
            >
              Run {total > 0 ? `${total} scan${total === 1 ? "" : "s"}` : "scan"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={openDetailed}>
              Detailed scan on ATS page →
            </Button>
            <span className="text-muted-foreground text-[11px]">
              Opens the ATS page with this job, your resumes and engines filled in.
            </span>
          </div>
        </>
      )}
      <ResumePreviewDialog resume={previewResume} onClose={() => setPreviewResume(null)} />
    </Card>
  );
}

/** The company's learned email format, so the user can build addresses for people found on LinkedIn. */
function EmailPatternLine({ pattern }: { pattern: EmailPatternDto | null }) {
  if (!pattern) {
    return <p className="text-muted-foreground text-[11px]">Email format: Unknown</p>;
  }
  const level = pattern.confidence >= 70 ? "High" : pattern.confidence >= 45 ? "Medium" : "Low";
  const basis =
    pattern.source === "hunter"
      ? "from Hunter"
      : `from ${pattern.evidence} known email${pattern.evidence === 1 ? "" : "s"}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">Email format:</span>
      <code className="text-foreground bg-muted rounded px-1 py-0.5 text-[11px]">
        {pattern.example}
      </code>
      <Tooltip
        content={`Learned ${basis}. Replace first/last with the person's name; a guess, not a verified address.`}
      >
        <Badge variant="outline" className="cursor-default px-1 py-0 text-[9px]">
          {level} · {pattern.confidence}%
        </Badge>
      </Tooltip>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Copy email format"
        title="Copy email format"
        onClick={() => {
          void navigator.clipboard.writeText(pattern.example).then(
            () => toast.add({ title: "Email format copied", type: "success" }),
            () => toast.add({ title: "Could not copy", type: "error" }),
          );
        }}
      >
        <CopyIcon />
      </Button>
    </div>
  );
}

/** People at the job's company, for a referral ask (relevance first, then community votes). */
function JobPeople({ jobId, company }: { jobId: string; company: string }) {
  const [people, setPeople] = useState<JobPersonDto[] | null>(null);
  const [pattern, setPattern] = useState<EmailPatternDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${jobId}/people`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: { people: JobPersonDto[]; emailPattern?: EmailPatternDto | null }) => {
        if (cancelled) return;
        setPeople(data.people);
        setPattern(data.emailPattern ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <Card className="gap-2">
      <SectionTitle>People at {company}</SectionTitle>
      {people !== null ? <EmailPatternLine pattern={pattern} /> : null}
      {failed ? (
        <p className="text-muted-foreground text-[12px]">Could not load people.</p>
      ) : people === null ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : people.length === 0 ? (
        <p className="text-muted-foreground text-[12px]">
          No one at {company} yet.{" "}
          <Link href="/people" className="text-primary hover:underline">
            Add a contact
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-2.5">
              <Avatar className="size-7">
                <AvatarFallback className="text-[10px]">
                  {personInitials(person.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-foreground flex items-center gap-1.5 truncate text-[12px] font-medium">
                  {person.name}
                  {person.origin === "system" ? (
                    <Badge variant="outline" className="px-1 py-0 text-[9px]">
                      Discovered
                    </Badge>
                  ) : null}
                </p>
                <p className="text-muted-foreground truncate text-[11px]">
                  {person.roleTitle ?? "Role unknown"} · {person.relevanceReason}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {person.linkedin ? (
                  <a
                    href={person.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "ghost", size: "xs" })}
                  >
                    LinkedIn
                  </a>
                ) : null}
                {person.email ? (
                  <Link
                    href={`/referrals?personId=${person.id}`}
                    className={buttonVariants({ variant: "ghost", size: "xs" })}
                  >
                    Ask
                  </Link>
                ) : null}
                <PersonVote personId={person.id} initial={person.votes} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-[10px]">
        Votes are a community signal, not a promise to refer.
      </p>
    </Card>
  );
}

/** Last section of the page, like the ATS page's "How scoring works". */
function HowJobsWork() {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl p-0">
      <Accordion type="single" collapsible className="border-y-0">
        <AccordionItem value="how">
          <AccordionTrigger className="text-foreground px-4 text-[13px] font-semibold hover:no-underline md:px-5">
            How Jobs works
          </AccordionTrigger>
          <AccordionContent>
            <div className="text-muted-foreground grid gap-4 px-4 pb-1 text-[12px] leading-relaxed md:grid-cols-2 md:px-5">
              <div className="space-y-1">
                <p className="text-foreground font-medium">Where jobs come from</p>
                <p>
                  Every night (IST) Aavedak scans company career boards — Greenhouse, Lever, Ashby,
                  SmartRecruiters, Workable and career pages that publish structured job data. Each
                  card shows its source and links to the original post. Sites without permitted
                  access (LinkedIn, Naukri, Indeed) are not scraped; add those jobs with Add job or
                  Paste JD.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-foreground font-medium">What gets recommended</p>
                <p>
                  Only tech roles (engineering, data, ML/AI, QA, IT, security, design and junior
                  product) based in India or remote and open to India, asking for under 3 years of
                  experience, are kept. Each day you get up to 50 new matches, ranked by how well
                  they fit your skills, preferred roles, locations and resume text. Turn this off in
                  Profile settings → Job discovery.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-foreground font-medium">Discover, Applied and expiry</p>
                <p>
                  Matches stay in Discover until you mark them applied, bookmark or ignore them —
                  applied and bookmarked jobs move to Applied and into your tracker. Jobs leave both
                  tabs 30 days after posting; an early-stage application is then marked Rejected
                  with a &ldquo;Job expired&rdquo; badge, and you can change it back anytime.
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-foreground font-medium">ATS check and people</p>
                <p>
                  Run scan scores your selected resumes against this job with one engine. For the
                  full report and improvement tips, use Detailed scan — it opens the ATS page with
                  everything filled in. People at the company are possible referral contacts; votes
                  from other users are a signal, not a promise to refer.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

function JobList({
  jobs,
  tab,
  selectedId,
  onSelect,
}: {
  jobs: JobDto[];
  tab: JobsTab;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (jobs.length === 0) {
    return (
      <div className="text-muted-foreground p-6 text-center text-[13px]">No matching jobs.</div>
    );
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <ul className="space-y-2 p-2">
        {jobs.map((job) => (
          <li key={job.id} className="relative">
            <button
              type="button"
              onClick={() => onSelect(job.id)}
              className={jobCardClassName({
                selected: selectedId === job.id,
                className: cn("cursor-pointer", job.url && "pr-20"),
              })}
            >
              <JobCardContent
                company={job.company}
                title={job.title}
                subtitle={`${job.company} · ${job.location}`}
              >
                <Badge variant="outline" className={JOB_CARD_BADGE}>
                  {job.sourceLabel}
                </Badge>
                {/* Only when the company states pay in the posting — never estimated. */}
                {job.salary ? (
                  <Badge
                    variant="secondary"
                    className={JOB_CARD_BADGE}
                    title="Pay stated by the company"
                  >
                    {job.salary}
                  </Badge>
                ) : null}
                {tab === "applied" && job.applicationStatus ? (
                  <Badge className={JOB_CARD_BADGE}>{statusLabel(job.applicationStatus)}</Badge>
                ) : null}
                {job.compatibilityScore != null ? (
                  <span className="text-foreground/80 text-[10px] font-medium tabular-nums">
                    Match {job.compatibilityScore}%
                  </span>
                ) : null}
                <span className="text-muted-foreground text-[10px]">{ageLabel(job)}</span>
              </JobCardContent>
            </button>
            {job.url ? (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary absolute right-2.5 top-2.5 text-[11px] font-medium hover:underline"
                title="Open the original job posting"
                aria-label={`Original post for ${job.title} at ${job.company}`}
              >
                Original ↗
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}

type DraftField =
  | "title"
  | "company"
  | "location"
  | "url"
  | "salary"
  | "description"
  | "workMode"
  | "employmentType"
  | "seniority"
  | "postedAt"
  | "skills";

const DRAFT_FIELD_LABELS: Record<DraftField, string> = {
  title: "title",
  company: "company",
  location: "location",
  url: "apply URL",
  salary: "salary",
  description: "description",
  workMode: "work mode",
  employmentType: "employment type",
  seniority: "seniority",
  postedAt: "posted date",
  skills: "skills",
};

function pickFields(
  values: Partial<Record<DraftField, string>>,
  keys: DraftField[],
): Partial<Record<DraftField, string>> {
  return Object.fromEntries(keys.map((k) => [k, values[k]])) as Partial<Record<DraftField, string>>;
}

/** Client-side check before fetching: a valid http(s) link, and a job link if it's LinkedIn. */
function jobLinkProblem(link: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
  } catch {
    return "That doesn't look like a link.";
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return "That doesn't look like a link.";
  const isLinkedIn = host === "linkedin.com" || host.endsWith(".linkedin.com");
  if (isLinkedIn) {
    const full = decodeURIComponent(url.href);
    if (
      !/\/jobs\/view\/(?:[^/?#]*-)?\d{6,}|[?&](?:currentJobId|jobId)=\d{6,}|jobPosting[:/]\d{6,}/.test(
        full,
      )
    ) {
      return "That LinkedIn link isn't a job posting. Open the job and copy its link (linkedin.com/jobs/view/…).";
    }
  }
  return null;
}
