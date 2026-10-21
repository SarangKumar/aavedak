import {
  Activity,
  AtSign,
  BadgeCheck,
  Ban,
  Boxes,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarSync,
  Check,
  CircleX,
  Code,
  Database,
  Download,
  EyeOff,
  FileSearch,
  FileText,
  Filter,
  FolderGit2,
  GitMerge,
  Globe,
  Hourglass,
  KeyRound,
  Layers,
  ListChecks,
  ListOrdered,
  ListPlus,
  ListTodo,
  Lock,
  RotateCcw,
  Save,
  Scale,
  ScanSearch,
  ScanText,
  ShieldCheck,
  SkipForward,
  Table2,
  Target,
  UserCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import { FEATURES } from "@/lib/features";

// The About page "How Aavedak works" flows. Each one is traced from the code; keep them in
// sync with it (vercel.json crons, apps/api/app/discovery/DISCOVERY.md,
// apps/api/app/improve/IMPROVE.md, apps/web/lib/ats-engines). Shared by the client diagram
// and the server-rendered steps, so it must not live in a "use client" module.
//
// Grid placement strings are literal Tailwind classes (phones first, then `lg:`), because
// Tailwind only generates classes it can find written out in full.

export type FlowNode = {
  id: string;
  label: string;
  icon: LucideIcon | "brand";
  place: string;
  /** Primary-tinted node: the step the flow is about. */
  highlight?: boolean;
};

/** `main`: the normal path. `loop`: back to an earlier step (dashed). `branch`: a skip / stop. */
export type FlowEdge = {
  from: string;
  to: string;
  kind?: "main" | "loop" | "branch";
  curvature?: number;
};

export type FlowStep = {
  title: string;
  body: string;
  /** Tables, stores or services read and written, in plain words. */
  data?: string;
};

export type Flow = {
  id: string;
  tab: string;
  title: string;
  /** One line: the shape of the flow. */
  shape: string;
  trigger: string;
  /** Literal grid classes for the diagram (phones, then desktop). */
  grid: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  steps: FlowStep[];
};

const SCAN: Flow = {
  id: "scan",
  tab: "Daily job scraping",
  title: "Daily job scraping",
  shape:
    "A loop that runs every day: crons queue the pages that are due, each page is read, jobs are cleaned and merged, statuses go back on the list, and the next run picks up from there. Timed-out pages loop back for a retry.",
  trigger:
    "Six Vercel crons a day (/svc/v1/discovery/cron/scan/0 to 5, 05:45, 09:45, 13:45, 17:45, 21:45 and 01:45 IST), each for one sixth of the list, plus seven drain crons that only finish leftover work.",
  grid: "grid-cols-3 lg:grid-cols-6",
  nodes: [
    {
      id: "cron",
      label: "Scan cron",
      icon: CalendarClock,
      place: "col-start-1 row-start-1 lg:col-start-1 lg:row-start-2",
    },
    {
      id: "queue",
      label: "Queue due items",
      icon: ListChecks,
      place: "col-start-2 row-start-1 lg:col-start-2 lg:row-start-2",
    },
    {
      id: "pages",
      label: "Careers pages",
      icon: Building2,
      place: "col-start-3 row-start-1 lg:col-start-3 lg:row-start-2",
      highlight: true,
    },
    {
      id: "boards",
      label: "Job boards (fallback)",
      icon: Briefcase,
      place: "col-start-3 row-start-2 lg:col-start-4 lg:row-start-3",
    },
    {
      id: "read",
      label: "Read the page",
      icon: ScanSearch,
      place: "col-start-2 row-start-2 lg:col-start-4 lg:row-start-2",
    },
    {
      id: "clean",
      label: "Filter & clean",
      icon: Filter,
      place: "col-start-2 row-start-3 lg:col-start-5 lg:row-start-2",
    },
    {
      id: "merge",
      label: "Dedupe & merge",
      icon: GitMerge,
      place: "col-start-2 row-start-4 lg:col-start-6 lg:row-start-2",
    },
    {
      id: "rank",
      label: "Recommend new jobs",
      icon: "brand",
      place: "col-start-3 row-start-4 lg:col-start-6 lg:row-start-3",
    },
    {
      id: "status",
      label: "Status on the list",
      icon: Database,
      place: "col-start-1 row-start-4 lg:col-start-3 lg:row-start-4",
    },
    {
      id: "retry",
      label: "Retry timed-out",
      icon: RotateCcw,
      place: "col-start-1 row-start-2 lg:col-start-3 lg:row-start-1",
    },
  ],
  edges: [
    { from: "cron", to: "queue" },
    { from: "queue", to: "pages" },
    { from: "pages", to: "read" },
    { from: "queue", to: "boards", kind: "branch" },
    { from: "read", to: "clean" },
    { from: "boards", to: "clean" },
    { from: "clean", to: "merge" },
    { from: "merge", to: "rank" },
    { from: "rank", to: "status" },
    { from: "status", to: "cron", kind: "loop" },
    { from: "read", to: "retry", kind: "loop" },
    { from: "retry", to: "queue", kind: "loop" },
  ],
  steps: [
    {
      title: "1. The cron opens today's run",
      body: "Each scan cron first adds any new entries from the seed files to the lists, then opens one run for its slice and the IST day. A repeated or retried cron finds the same run and continues it instead of starting another.",
      data: "Reads data/careers_pages.json and career_sources.json. Writes career_pages and company_sources (new entries only), discovery_runs and discovery_run_items.",
    },
    {
      title: "2. Pick what is due",
      body: "Careers pages come first. A page that was readable last time, or failed with an error (fewer than 5 times in a row), is due every day; a page with no job data or that refuses crawlers is due once a week. Job boards are queued after the pages, and a board is skipped while its company's careers page had a complete read in the last 3 days.",
      data: "Reads career_pages (last status, last complete read) and company_sources.",
    },
    {
      title: "3. Work in time-boxed batches",
      body: "The run is worked in batches of 10 inside a 240-second budget (Vercel allows 300). Each item is leased so two runs never take the same page. A careers page gets up to 45 seconds and 16 requests, and a batch is cut off at the deadline.",
      data: "Writes leases and attempts on discovery_run_items.",
    },
    {
      title: "4. Read each careers page",
      body: "robots.txt is checked first and requests to one site are spaced out. The first method that finds jobs wins: the hiring platform the page embeds or links to (Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Workable, read through its public job list), schema.org job data on the page, job data embedded in the page's scripts, up to 8 linked job pages, then the sitemap.",
      data: "Network only. 401, 403 and 429 count as blocked.",
    },
    {
      title: "5. Filter and clean",
      body: "Kept: tech roles with a real link, no executive titles, at most 10 years required, posted within the 30-day window. Each job gets a region (India, remote open to India, remote, global) and a salary only when one is stated. Privacy, cookie, equal-opportunity and legal footer text is removed from the description.",
      data: "Pure code; skipped postings are only counted, never stored.",
    },
    {
      title: "6. Dedupe and merge",
      body: "A posting joins an existing job when company, title and first location word match, or when its link is the same. The careers-page link wins over a board link. A complete read closes jobs that are no longer listed, but only through that source's own entries.",
      data: "Writes jobs and job_sources.",
    },
    {
      title: "7. Recommend and record",
      body: "New jobs are offered to users right away, within each user's daily cap. Then the page's method, status, jobs found and kept, and failure count go back on its row, which decides whether it is due tomorrow or next week.",
      data: "Writes user_job_state, job_scores, job_person_relevance and career_pages.",
    },
    {
      title: "If something goes wrong",
      body: "A page that runs out of time is marked as an error and retried by the drain crons, up to 3 attempts. After 5 errors in a row it moves to weekly checks. Separately, the expire cron (05:45 IST) marks jobs expired 30 days after posting (and moves early-stage applications for them to rejected, once), and prune-filled (06:15 IST) hides jobs that scans closed; applications keep their records.",
    },
  ],
};

const PEOPLE: Flow = {
  id: "people",
  tab: "Daily discovery",
  title: "Daily people discovery",
  shape:
    "A loop over companies that are due: each company fans out to several public sources, the results come back together into one list of people with emails, and the company is scheduled again 14 days later.",
  trigger:
    "Six Vercel crons a day (/api/cron/people-discovery, every 4 hours from 05:47 IST) plus one daily fallback on the API (07:45 IST). Each 4-hour slot has one run, so overlaps and retries continue the same run.",
  grid: "grid-cols-3 lg:grid-cols-7",
  nodes: [
    {
      id: "cron",
      label: "Discovery cron",
      icon: CalendarClock,
      place: "col-start-1 row-start-1 lg:col-start-1 lg:row-start-2",
    },
    {
      id: "pick",
      label: "Pick ≤ 25 due companies",
      icon: ListChecks,
      place: "col-start-2 row-start-1 lg:col-start-2 lg:row-start-2",
    },
    {
      id: "domain",
      label: "Find the domain",
      icon: Globe,
      place: "col-start-3 row-start-1 lg:col-start-3 lg:row-start-2",
    },
    {
      id: "site",
      label: "Team pages",
      icon: Building2,
      place: "col-start-1 row-start-2 lg:col-start-4 lg:row-start-1",
    },
    {
      id: "github",
      label: "GitHub members",
      icon: FolderGit2,
      place: "col-start-2 row-start-2 lg:col-start-4 lg:row-start-2",
    },
    {
      id: "search",
      label: "Search & providers",
      icon: ScanSearch,
      place: "col-start-3 row-start-2 lg:col-start-4 lg:row-start-3",
    },
    {
      id: "pattern",
      label: "Email pattern",
      icon: AtSign,
      place: "col-start-2 row-start-3 lg:col-start-5 lg:row-start-2",
    },
    {
      id: "merge",
      label: "Email required, dedupe",
      icon: UserCheck,
      place: "col-start-2 row-start-4 lg:col-start-6 lg:row-start-2",
      highlight: true,
    },
    {
      id: "store",
      label: "People saved",
      icon: FEATURES.people.icon,
      place: "col-start-3 row-start-5 lg:col-start-7 lg:row-start-2",
    },
    {
      id: "next",
      label: "Due again in 14 days",
      icon: CalendarSync,
      place: "col-start-1 row-start-5 lg:col-start-4 lg:row-start-4",
    },
  ],
  edges: [
    { from: "cron", to: "pick" },
    { from: "pick", to: "domain" },
    { from: "domain", to: "site" },
    { from: "domain", to: "github" },
    { from: "domain", to: "search" },
    { from: "site", to: "pattern" },
    { from: "github", to: "pattern" },
    { from: "search", to: "pattern" },
    { from: "pattern", to: "merge" },
    { from: "merge", to: "store" },
    { from: "store", to: "next", kind: "loop" },
    { from: "next", to: "pick", kind: "loop" },
  ],
  steps: [
    {
      title: "1. Pick the companies",
      body: "Only companies users have applied to, or that have live jobs, are candidates. Those never checked go first, then the most applied-to, then the most jobs; at most 25 per run. They are claimed when queued (held for 6 hours) so an overlapping run skips them.",
      data: "Reads applications, jobs, companies and people_discovery_state. Writes discovery_runs and discovery_run_items.",
    },
    {
      title: "2. Find the company's domain",
      body: "From its careers page, where its postings live, links in descriptions, or users' application links; hiring-platform domains are ignored. A GitHub org whose website matches can supply it. It is never guessed from the name.",
    },
    {
      title: "3. Ask the sources (fan-out)",
      body: "Up to 60 requests per company, one second apart per site, robots.txt respected. Sources: up to 8 team or about pages (people cards, schema.org Person data), up to 30 GitHub org members (profile emails, or a public commit email when the profile has none), and, only when their keys are set, search APIs (LinkedIn URLs and titles from results; LinkedIn itself is never fetched), Hunter and Apollo. Metered APIs have daily caps.",
    },
    {
      title: "4. Work out the email pattern",
      body: "From published name and email pairs (or Hunter's pattern), a pattern such as first.last is chosen only when the evidence fits one pattern, and only if the domain has mail servers. People without a published address get an 'inferred' address from it.",
      data: "Writes company_email_patterns and the pattern fields on companies.",
    },
    {
      title: "5. Merge (fan-in)",
      body: "Anyone with no email at all, published or inferred, is skipped. Two candidates with the same email count once. Each person is matched to an existing record by LinkedIn, email, GitHub login or name, and only empty fields are filled. An inferred address is stored only as an 'inferred' contact, never as the person's email, so outreach never sends to it.",
      data: "Writes people, person_contacts, person_field_sources and job_person_relevance.",
    },
    {
      title: "6. Schedule the next check",
      body: 'The company is due again after 14 days (twice that when nothing was found and no domain is known). Locations are normalised to city and country, so a job\'s "People at company" list shows the same city first, then the same country.',
      data: "Writes people_discovery_state.",
    },
    {
      title: "If something goes wrong",
      body: "An error for one company is recorded on its state and retried by the queue; it never stops the run. The people queue is worked separately from the job scan, so a scan backlog cannot delay it.",
    },
  ],
};

const SIGNUP: Flow = {
  id: "signup",
  tab: "When you register",
  title: "When you register: how your jobs appear",
  shape:
    "A line with two exits (account cap, approval), then onboarding. Your jobs are not computed when you open the page: they are prepared in the background and the Jobs page only reads them.",
  trigger: "You sign in with Google for the first time.",
  grid: "grid-cols-3 lg:grid-cols-6",
  nodes: [
    {
      id: "google",
      label: "Google sign-in",
      icon: KeyRound,
      place: "col-start-1 row-start-1 lg:col-start-1 lg:row-start-1",
    },
    {
      id: "cap",
      label: "Account cap (8)",
      icon: Lock,
      place: "col-start-2 row-start-1 lg:col-start-2 lg:row-start-1",
    },
    {
      id: "closed",
      label: "Closed to new accounts",
      icon: Ban,
      place: "col-start-3 row-start-1 lg:col-start-2 lg:row-start-2",
    },
    {
      id: "approval",
      label: "Approval",
      icon: UserCheck,
      place: "col-start-2 row-start-2 lg:col-start-3 lg:row-start-1",
    },
    {
      id: "pending",
      label: "Pending approval",
      icon: Hourglass,
      place: "col-start-3 row-start-2 lg:col-start-3 lg:row-start-2",
    },
    {
      id: "onboarding",
      label: "Onboarding",
      icon: FEATURES.onboarding.icon,
      place: "col-start-2 row-start-3 lg:col-start-4 lg:row-start-1",
    },
    {
      id: "resume",
      label: "Resume to storage",
      icon: FEATURES.uploadResume.icon,
      place: "col-start-1 row-start-3 lg:col-start-4 lg:row-start-2",
    },
    {
      id: "rank",
      label: "Background ranking",
      icon: "brand",
      place: "col-start-2 row-start-4 lg:col-start-5 lg:row-start-1",
      highlight: true,
    },
    {
      id: "state",
      label: "Your recommendations",
      icon: Database,
      place: "col-start-1 row-start-5 lg:col-start-5 lg:row-start-2",
    },
    {
      id: "jobs",
      label: "Jobs page",
      icon: FEATURES.jobs.icon,
      place: "col-start-2 row-start-5 lg:col-start-6 lg:row-start-1",
    },
  ],
  edges: [
    { from: "google", to: "cap" },
    { from: "cap", to: "closed", kind: "branch" },
    { from: "cap", to: "approval" },
    { from: "approval", to: "pending", kind: "branch" },
    { from: "approval", to: "onboarding" },
    { from: "onboarding", to: "resume" },
    { from: "onboarding", to: "rank" },
    { from: "resume", to: "rank" },
    { from: "rank", to: "state" },
    { from: "state", to: "jobs" },
  ],
  steps: [
    {
      title: "1. Sign in",
      body: 'Better Auth handles Google sign-in and keeps your session. Only the first 8 accounts can join; after that, sign-in shows "Aavedak is closed to new accounts".',
      data: "Writes the Better Auth user, account and session rows, and your profiles row.",
    },
    {
      title: "2. Approval",
      body: "Admin emails are approved straight away; everyone else starts as pending and sees the pending-approval page until an admin approves them.",
      data: "profiles.approval_status.",
    },
    {
      title: "3. Onboarding",
      body: "You set years of experience, preferred roles, skills and locations, and upload a PDF resume. The file goes to Google Cloud Storage and its text is extracted on the server. Onboarding is marked complete last.",
      data: "Writes profiles, user_preferences and resumes (file in Cloud Storage, text in resumes.extracted_text).",
    },
    {
      title: "4. Ranking happens in the background",
      body: "Recommendations are precomputed, not worked out when you open Jobs. You are only ranked once approved and onboarded. Your first jobs come from the next scan (new jobs it finds) or the daily ranking cron at 06:45 IST, which tops up from the whole pool; Jobs → Refresh jobs runs a scan straight away.",
      data: "Writes user_job_state and job_scores.",
    },
    {
      title: "5. How a job is chosen for you",
      body: "From open shared jobs posted in the last 30 days that you haven't been shown: only jobs asking at most your years plus 2 (or not saying). India first, then remote open to India, remote and global. Each job is scored against your skills, roles, locations and resume text; with a profile, a match under 30 is skipped. Rank = match + experience fit (0-10) + region bonus (India 12, India-remote 9, remote 4). Up to 50 new jobs a day.",
    },
    {
      title: "6. The Jobs page reads it",
      body: "On each visit the page reads your stored recommendations plus jobs you added yourself, filters them by posted date (24 hours by default, up to a month) and shows India first in the region menu. Nothing is re-ranked on page load.",
      data: "Reads user_job_state, jobs, job_scores.",
    },
  ],
};

const RERANK: Flow = {
  id: "rerank",
  tab: "When ranking runs again",
  title: "When the recommendation engine runs again",
  shape:
    "Two entry points. Saving your career preferences re-scores what is still open and branches into kept or hidden. Both paths then top up from the unseen pool, up to what is left of today's cap.",
  trigger:
    "You save career preferences in Profile (re-rank for you), each scan (new jobs only), the daily ranking cron at 06:45 IST (whole pool), or an admin run.",
  grid: "grid-cols-3 lg:grid-cols-6",
  nodes: [
    {
      id: "prefs",
      label: "Preferences saved",
      icon: UserCog,
      place: "col-start-1 row-start-1 lg:col-start-1 lg:row-start-1",
    },
    {
      id: "cron",
      label: "Scan / daily cron",
      icon: CalendarClock,
      place: "col-start-3 row-start-1 lg:col-start-5 lg:row-start-3",
    },
    {
      id: "open",
      label: "Your open list",
      icon: ListTodo,
      place: "col-start-1 row-start-2 lg:col-start-2 lg:row-start-1",
    },
    {
      id: "rescore",
      label: "Re-score",
      icon: FEATURES.resumeScore.icon,
      place: "col-start-1 row-start-3 lg:col-start-3 lg:row-start-1",
      highlight: true,
    },
    {
      id: "keep",
      label: "Kept, new score",
      icon: Check,
      place: "col-start-1 row-start-4 lg:col-start-4 lg:row-start-1",
    },
    {
      id: "drop",
      label: "Hidden for good",
      icon: EyeOff,
      place: "col-start-2 row-start-3 lg:col-start-3 lg:row-start-2",
    },
    {
      id: "pool",
      label: "Unseen pool",
      icon: Layers,
      place: "col-start-2 row-start-5 lg:col-start-5 lg:row-start-2",
    },
    {
      id: "cap",
      label: "Today's cap (50)",
      icon: ListOrdered,
      place: "col-start-2 row-start-6 lg:col-start-6 lg:row-start-2",
    },
    {
      id: "add",
      label: "New recommendations",
      icon: ListPlus,
      place: "col-start-2 row-start-7 lg:col-start-6 lg:row-start-3",
    },
  ],
  edges: [
    { from: "prefs", to: "open" },
    { from: "open", to: "rescore" },
    { from: "rescore", to: "keep" },
    { from: "rescore", to: "drop", kind: "branch" },
    { from: "keep", to: "pool" },
    { from: "cron", to: "pool" },
    { from: "pool", to: "cap" },
    { from: "cap", to: "add" },
  ],
  steps: [
    {
      title: "1. What is re-scored",
      body: "Only your open recommendations: shown to you, not applied to, not ignored, and the job still open. Each is scored again against your current profile and resume.",
      data: "Reads user_job_state, jobs, profiles, resumes.",
    },
    {
      title: "2. Kept or hidden",
      body: "A job now asking more than your years plus 2, or scoring under 30, is hidden: its row stays with no recommendation date, so it is never offered again. Others keep their place with the new score and reasons.",
      data: "Updates user_job_state (score, reasons_json, recommended_at) and job_scores.",
    },
    {
      title: "3. What is never touched",
      body: "Jobs you applied to or ignored, and jobs you added yourself, stay exactly as they are. Nothing already shown is shown twice, because the pool skips every job that already has a row for you.",
    },
    {
      title: "4. Top up within today's cap",
      body: "New jobs come from the unseen pool, ranked as at sign-up. The cap is 50 a day (IST): jobs already recommended today count against it, so a re-run late in the day may add few or none.",
      data: "Inserts into user_job_state (existing rows are never overwritten) and upserts job_scores.",
    },
    {
      title: "What you see",
      body: "Profile just saves; it does not show the counts. The Jobs page shows the new order the next time it loads. If re-ranking fails, your preferences are still saved and Profile says the jobs were not re-ranked.",
    },
  ],
};

const ATS: Flow = {
  id: "ats",
  tab: "ATS with many engines",
  title: "An ATS run with many engines",
  shape:
    "A fan-out: one resume and job description go to every selected engine group, then the scores come back together into one weighted final score. Several resumes run side by side; one resume's engines run one after another.",
  trigger:
    "You press Run on the Resume score page (or an ATS check on a job), with one or more resumes and engines selected.",
  grid: "grid-cols-3 lg:grid-cols-5",
  nodes: [
    {
      id: "input",
      label: "Resume, role & JD",
      icon: FileText,
      place: "col-start-2 row-start-1 lg:col-start-1 lg:row-start-2",
    },
    {
      id: "skip",
      label: "Needs a JD: skipped",
      icon: SkipForward,
      place: "col-start-3 row-start-1 lg:col-start-1 lg:row-start-3",
    },
    {
      id: "text",
      label: "Resume text (once)",
      icon: FileSearch,
      place: "col-start-2 row-start-2 lg:col-start-2 lg:row-start-2",
    },
    {
      id: "native",
      label: "Native ×1",
      icon: BadgeCheck,
      place: "col-start-1 row-start-3 lg:col-start-3 lg:row-start-1",
    },
    {
      id: "reference",
      label: "Reference ×6",
      icon: Boxes,
      place: "col-start-2 row-start-3 lg:col-start-3 lg:row-start-2",
    },
    {
      id: "oss",
      label: "Open source ×4",
      icon: Code,
      place: "col-start-3 row-start-3 lg:col-start-3 lg:row-start-3",
    },
    {
      id: "weight",
      label: "Weighted final",
      icon: Scale,
      place: "col-start-2 row-start-4 lg:col-start-4 lg:row-start-2",
      highlight: true,
    },
    {
      id: "table",
      label: "Results table",
      icon: Table2,
      place: "col-start-2 row-start-5 lg:col-start-5 lg:row-start-2",
    },
  ],
  edges: [
    { from: "input", to: "skip", kind: "branch" },
    { from: "input", to: "text" },
    { from: "text", to: "native" },
    { from: "text", to: "reference" },
    { from: "text", to: "oss" },
    { from: "native", to: "weight" },
    { from: "reference", to: "weight" },
    { from: "oss", to: "weight" },
    { from: "weight", to: "table" },
  ],
  steps: [
    {
      title: "1. Inputs",
      body: "The resumes and engines you ticked, plus an optional target role, job description and years of experience. Each resume × engine pair is one cell. Engines that need a job description are skipped (and shown as such) when there isn't one.",
    },
    {
      title: "2. How they run",
      body: "The browser runs resumes side by side, and each resume's engines one after another, so its PDF text is extracted once (by the first engine) and reused. Each cell is a separate streamed request, so the table fills in live, stage by stage, and one failed cell can be retried on its own.",
      data: "Reads resumes (file from Cloud Storage only when its text isn't stored yet; then writes resumes.extracted_text).",
    },
    {
      title: "3. The engines",
      body: 'All 11 engines run in the FastAPI service (no browser-side scoring). If it is unreachable, the cell says "Service unavailable" rather than showing a substitute score. Parsed resume and job description are cached per exact text, so engines scoring the same text don\'t parse it again. A job description pasted here is scored as typed; one reference signal ignores its privacy and EEO boilerplate.',
    },
    {
      title: "4. Final score (fan-in)",
      body: "Native counts 50%, the 6 reference engines 35% and the 4 open-source engines 15%, split within each group by how well its criteria are documented. Engines that didn't run (not selected, needed a job description, failed) are left out and the rest renormalised. Hovering the final score shows each engine's share.",
    },
    {
      title: "Where results live",
      body: "In the page only: an ATS run writes no score rows to the database. Run it again, or change a resume, and it is recomputed.",
    },
  ],
};

const IMPROVE: Flow = {
  id: "improve",
  tab: "Improve resume",
  title: "When Improve resume runs",
  shape:
    "A pipeline with a filter: rules propose changes, a fact guard drops the unsafe ones, and the rest are scored before and after with the same request. Ticking or unticking a change loops back to scoring.",
  trigger:
    "You press Improve on /resume-improver (or open it from a job, which fills the role and description).",
  grid: "grid-cols-3 lg:grid-cols-6",
  nodes: [
    {
      id: "input",
      label: "Resume, role, YOE, JD",
      icon: FileText,
      place: "col-start-1 row-start-1 lg:col-start-1 lg:row-start-1",
    },
    {
      id: "parse",
      label: "Parse the resume",
      icon: ScanText,
      place: "col-start-2 row-start-1 lg:col-start-2 lg:row-start-1",
    },
    {
      id: "before",
      label: "Before score",
      icon: FEATURES.resumeScore.icon,
      place: "col-start-3 row-start-1 lg:col-start-2 lg:row-start-2",
    },
    {
      id: "gaps",
      label: "Gaps from the JD",
      icon: Target,
      place: "col-start-1 row-start-2 lg:col-start-3 lg:row-start-2",
    },
    {
      id: "rules",
      label: "Rules propose",
      icon: FEATURES.improveResume.icon,
      place: "col-start-2 row-start-2 lg:col-start-3 lg:row-start-1",
    },
    {
      id: "guard",
      label: "Fact guard",
      icon: ShieldCheck,
      place: "col-start-2 row-start-3 lg:col-start-4 lg:row-start-1",
      highlight: true,
    },
    {
      id: "dropped",
      label: "Dropped, with reason",
      icon: CircleX,
      place: "col-start-3 row-start-3 lg:col-start-4 lg:row-start-2",
    },
    {
      id: "impact",
      label: "Measure each change",
      icon: Activity,
      place: "col-start-2 row-start-4 lg:col-start-5 lg:row-start-1",
    },
    {
      id: "after",
      label: "After score",
      icon: FEATURES.resumeScore.icon,
      place: "col-start-2 row-start-5 lg:col-start-6 lg:row-start-1",
    },
    {
      id: "review",
      label: "You tick / untick",
      icon: ListChecks,
      place: "col-start-2 row-start-6 lg:col-start-6 lg:row-start-2",
    },
    {
      id: "save",
      label: "Save as new resume",
      icon: Save,
      place: "col-start-1 row-start-7 lg:col-start-5 lg:row-start-3",
    },
    {
      id: "download",
      label: "Download PDF / DOCX",
      icon: Download,
      place: "col-start-3 row-start-7 lg:col-start-6 lg:row-start-3",
    },
  ],
  edges: [
    { from: "input", to: "parse" },
    { from: "parse", to: "before" },
    { from: "parse", to: "rules" },
    { from: "rules", to: "gaps" },
    { from: "rules", to: "guard" },
    { from: "guard", to: "dropped", kind: "branch" },
    { from: "guard", to: "impact" },
    { from: "impact", to: "after" },
    { from: "after", to: "review" },
    { from: "review", to: "after", kind: "loop", curvature: 24 },
    { from: "review", to: "save" },
    { from: "review", to: "download" },
  ],
  steps: [
    {
      title: "1. Inputs",
      body: "A stored resume (its extracted text), a role, your years of experience for this run, an optional job description, and the engines to measure against. Engines that need a job description are left out when there isn't one.",
      data: "Reads resumes. The web app calls the FastAPI service at /svc/v1/improve.",
    },
    {
      title: "2. Parse and score the original",
      body: "The text is split into header, sections, entries and bullets and rendered back as clean text. The before score is taken on that clean text, not the raw PDF text, so the difference measures the rules rather than whitespace.",
    },
    {
      title: "3. Rules propose changes",
      body: 'Fixed rules only, no AI: pronoun and weak openers ("Responsible for", "Worked on building X" becomes "Built X"; "Helped with" stays "Contributed to"), same-meaning verb upgrades, past tense for past roles, skills grouped and ordered for the role, bullet and section order from the role\'s guidance (7 roles plus a generic one), date and separator formats. Requirements from the job description (or the role) are marked as supported or missing; missing ones are listed as gaps and never written in.',
    },
    {
      title: "4. Fact guard",
      body: "Each change is rejected if it adds or alters a number, date, contact detail, skill or named entity. The whole revised resume is checked again; a change that makes it fail is dropped and listed with the reason, and only that change goes; the rest stay.",
    },
    {
      title: "5. Score each change, then after",
      body: "On the first run each change is measured leave-one-out against the selected engines; one that lowers their total starts unticked, and you still can choose it. The after score uses the identical request as the before score; only the resume text differs. Ticking or unticking re-scores without re-measuring.",
    },
    {
      title: "6. Save or download",
      body: "Download builds a plain single-column PDF or DOCX in your browser. Save makes that PDF a new inactive resume linked to the original, with the revised text stored; the original is untouched.",
      data: "Writes a resumes row (origin 'improver', source_resume_id set, file in Cloud Storage) and a resume_improvements row with the role, job description and scores.",
    },
  ],
};

export const FLOWS: Flow[] = [SCAN, PEOPLE, SIGNUP, RERANK, ATS, IMPROVE];

export function getFlow(id: string): Flow | undefined {
  return FLOWS.find((f) => f.id === id);
}
