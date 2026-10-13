"use client";

import Link from "next/link";

import { AuthHeaderActions, type HeaderUser } from "@/components/auth-header-actions";
import { BrandMark } from "@/components/brand-mark";
import { DesktopNavMenu } from "@/components/desktop-nav-menu";
import { MobileNav, type NavGroup } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SHELL_X } from "@/lib/layout";
import { cn } from "@/lib/utils";

const mobileNav: readonly NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/jobs", label: "Jobs", icon: "jobs" },
      { href: "/job-tracker", label: "Tracker", icon: "tracker" },
    ],
  },
  {
    label: "Resume",
    items: [
      { href: "/ats", label: "Score", icon: "ats" },
      { href: "/resume-improver", label: "Improve", icon: "improve" },
      { href: "/documents?tab=resumes&upload=1", label: "Upload resume", icon: "upload" },
    ],
  },
  {
    label: "Apply & reach out",
    items: [
      { href: "/documents", label: "Documents", icon: "documents" },
      { href: "/referrals", label: "Referrals", icon: "referrals" },
      { href: "/outreach", label: "Outreach", icon: "outreach" },
      { href: "/people", label: "People", icon: "people" },
    ],
  },
];

type SiteHeaderBarProps = {
  user: HeaderUser | null;
};

export function SiteHeaderBar({ user }: SiteHeaderBarProps) {
  return (
    <div
      className={cn(
        "relative mx-auto flex h-12 w-full items-center gap-2.5 overflow-visible sm:gap-3",
        SHELL_X,
      )}
    >
      <MobileNav groups={mobileNav} user={user} />

      <Link
        href="/"
        className="group flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
        aria-label="Aavedak home"
      >
        <BrandMark alt="Aavedak logo" width={28} height={28} className="size-7" priority />
        <span className="aavedak-display text-foreground text-sm">Aavedak</span>
      </Link>

      <DesktopNavMenu />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        <AuthHeaderActions user={user} />
      </div>
    </div>
  );
}
