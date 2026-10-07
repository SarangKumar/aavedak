"use client";

import Image from "next/image";
import Link from "next/link";

import { AuthHeaderActions, type HeaderUser } from "@/components/auth-header-actions";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SHELL_X } from "@/lib/layout";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/job-tracker", label: "Tracker" },
  { href: "/documents", label: "Documents" },
  { href: "/referrals", label: "Referrals" },
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
      <MobileNav items={[...nav]} />

      <Link
        href="/"
        className="group flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
        aria-label="Aavedak home"
      >
        <Image
          src="/brand/logo-icon.png"
          alt="Aavedak logo"
          width={28}
          height={28}
          className="aavedak-logo size-7"
          priority
        />
        <span className="aavedak-display text-foreground text-sm">Aavedak</span>
      </Link>

      <nav className="ml-1 hidden items-center gap-0.5 md:flex" aria-label="Main">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-muted-foreground hover:text-foreground rounded-lg px-2 py-1 text-[13px] transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        <AuthHeaderActions user={user} />
      </div>
    </div>
  );
}
