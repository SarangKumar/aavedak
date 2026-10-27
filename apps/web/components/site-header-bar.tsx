"use client";

import Link from "next/link";

import { AuthHeaderActions, type HeaderUser } from "@/components/auth-header-actions";
import { BrandMark } from "@/components/brand-mark";
import { DesktopNavMenu } from "@/components/desktop-nav-menu";
import { MobileNav, type NavGroup } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SHELL_X } from "@/lib/layout";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { cn } from "@/lib/utils";

const item = (feature: FeatureKey) => ({
  href: FEATURES[feature].href,
  label: FEATURES[feature].label,
  feature,
});

const mobileNav: readonly NavGroup[] = [
  { label: "Workspace", items: [item("dashboard"), item("jobs"), item("tracker")] },
  {
    label: "Resume",
    items: [item("createResume"), item("resumeScore"), item("improveResume")],
  },
  {
    label: "Apply & reach out",
    items: [item("documents"), item("referrals"), item("inbox"), item("people")],
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
