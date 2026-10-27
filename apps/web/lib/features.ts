/**
 * One icon, one label and one short description per feature — the single source of truth for the
 * homepage, header nav (desktop + mobile), Cmd+K, page headers, and buttons that link to a feature.
 */
import {
  Bell,
  Contact,
  FileText,
  FileUser,
  FileUp,
  FilePlus2,
  Gauge,
  Inbox,
  Kanban,
  LayoutDashboard,
  Mail,
  MailPen,
  PenLine,
  Reply,
  Search,
  Send,
  Shield,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";

export type FeatureKey =
  | "dashboard"
  | "jobs"
  | "tracker"
  | "documents"
  | "resumes"
  | "coverLetters"
  | "resumeScore"
  | "improveResume"
  | "createResume"
  | "uploadResume"
  | "referrals"
  | "referralEmail"
  | "followUpEmail"
  | "inbox"
  | "people"
  | "followUps"
  | "apply"
  | "onboarding"
  | "admin";

export type Feature = { href: string; label: string; description: string; icon: LucideIcon };

export const FEATURES: Record<FeatureKey, Feature> = {
  dashboard: {
    href: "/dashboard",
    label: "Dashboard",
    description: "Today's priorities, application pulse and what to do next.",
    icon: LayoutDashboard,
  },
  jobs: {
    href: "/jobs",
    label: "Jobs",
    description: "Daily recommendations and the jobs you've applied to.",
    icon: Search,
  },
  tracker: {
    href: "/job-tracker",
    label: "Job tracker",
    description: "Every application by status, as a board or list.",
    icon: Kanban,
  },
  documents: {
    href: "/documents",
    label: "Documents",
    description: "Resumes, cover letters and email templates.",
    icon: FileText,
  },
  resumes: {
    href: "/documents?tab=resumes",
    label: "Resumes",
    description: "Upload resumes and pick your showcase.",
    icon: FileUser,
  },
  coverLetters: {
    href: "/documents?tab=cover_letters",
    label: "Cover letters",
    description: "Write and keep cover letters per job.",
    icon: Mail,
  },
  resumeScore: {
    href: "/ats",
    label: "Resume score",
    description: "ATS scores from every engine, with or without a job description.",
    icon: Gauge,
  },
  improveResume: {
    href: "/resume-improver",
    label: "Improve resume",
    description: "Better wording and order for a role, nothing invented.",
    icon: PenLine,
  },
  createResume: {
    href: "/resume-creator",
    label: "Create resume",
    description: "Build a formal resume with a live A4 preview and ATS check.",
    icon: FilePlus2,
  },
  uploadResume: {
    href: "/documents?tab=resumes&upload=1",
    label: "Upload resume",
    description: "Add a PDF resume.",
    icon: FileUp,
  },
  referrals: {
    href: "/referrals",
    label: "Referrals",
    description: "Pick a job and the people to ask for a referral.",
    icon: Users,
  },
  referralEmail: {
    href: "/documents?tab=referral_email",
    label: "Referral email",
    description: "The template used to ask for referrals.",
    icon: MailPen,
  },
  followUpEmail: {
    href: "/documents?tab=followup_email",
    label: "Follow-up email",
    description: "The template used for follow-ups.",
    icon: Reply,
  },
  inbox: {
    href: "/outreach",
    label: "Inbox",
    description: "Your sent mails, replies and follow-ups.",
    icon: Inbox,
  },
  people: {
    href: "/people",
    label: "People",
    description: "Contacts found for your target companies.",
    icon: Contact,
  },
  followUps: {
    href: "/follow-ups",
    label: "Follow-ups",
    description: "Nudges until there is a reply.",
    icon: Bell,
  },
  apply: { href: "/jobs", label: "Apply", description: "Send the application.", icon: Send },
  onboarding: {
    href: "/onboarding",
    label: "Onboarding",
    description: "Set up your profile and preferences.",
    icon: SlidersHorizontal,
  },
  admin: {
    href: "/admin",
    label: "Admin",
    description: "Jobs, users and discovery.",
    icon: Shield,
  },
};
