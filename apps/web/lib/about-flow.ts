import { CalendarClock, Filter, KeyRound, type LucideIcon } from "lucide-react";

import { FEATURES } from "@/lib/features";

// Stages of the About page data-flow diagram and its step list (shared by the client diagram
// and the server-rendered steps, so it cannot live in the "use client" module).

export type FlowStageId =
  | "signin"
  | "resume"
  | "scan"
  | "clean"
  | "match"
  | "score"
  | "people"
  | "send"
  | "replies"
  | "workspace";

export type FlowStage = {
  id: FlowStageId;
  label: string;
  icon: LucideIcon | "brand";
  /**
   * Literal grid placement (Tailwind needs whole class names). Phones: one column, top to
   * bottom. Desktop: a 5 × 2 snake, left to right on the first row, right to left on the second.
   */
  place: string;
};

export const FLOW_STAGES: FlowStage[] = [
  {
    id: "signin",
    label: "Sign in & profile",
    icon: KeyRound,
    place: "row-start-1 lg:col-start-1 lg:row-start-1",
  },
  {
    id: "resume",
    label: "Resume upload",
    icon: FEATURES.uploadResume.icon,
    place: "row-start-2 lg:col-start-2 lg:row-start-1",
  },
  {
    id: "scan",
    label: "Daily scan",
    icon: CalendarClock,
    place: "row-start-3 lg:col-start-3 lg:row-start-1",
  },
  {
    id: "clean",
    label: "Clean & dedupe",
    icon: Filter,
    place: "row-start-4 lg:col-start-4 lg:row-start-1",
  },
  {
    id: "match",
    label: "Match to you",
    icon: "brand",
    place: "row-start-5 lg:col-start-5 lg:row-start-1",
  },
  {
    id: "score",
    label: "ATS score & improve",
    icon: FEATURES.resumeScore.icon,
    place: "row-start-6 lg:col-start-5 lg:row-start-2",
  },
  {
    id: "people",
    label: "People",
    icon: FEATURES.people.icon,
    place: "row-start-7 lg:col-start-4 lg:row-start-2",
  },
  {
    id: "send",
    label: "Referrals & send",
    icon: FEATURES.referrals.icon,
    place: "row-start-8 lg:col-start-3 lg:row-start-2",
  },
  {
    id: "replies",
    label: "Replies & follow-ups",
    icon: FEATURES.followUps.icon,
    place: "row-start-9 lg:col-start-2 lg:row-start-2",
  },
  {
    id: "workspace",
    label: "Inbox, tracker & dashboard",
    icon: FEATURES.inbox.icon,
    place: "row-start-10 lg:col-start-1 lg:row-start-2",
  },
];
