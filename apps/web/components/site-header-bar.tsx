"use client";

import Link from "next/link";

import { AuthHeaderActions, type HeaderUser } from "@/components/auth-header-actions";
import { BrandMark } from "@/components/brand-mark";
import { DesktopNavMenu } from "@/components/desktop-nav-menu";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SHELL_X } from "@/lib/layout";
import { cn } from "@/lib/utils";

const mobileNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/job-tracker", label: "Tracker" },
  { href: "/documents", label: "Documents" },
  { href: "/referrals", label: "Referrals" },
  { href: "/ats", label: "ATS" },
] as const;

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
      <MobileNav items={[...mobileNav]} />

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
