"use client";

import Image from "next/image";
import Link from "next/link";

import { AuthHeaderActions, type HeaderUser } from "@/components/auth-header-actions";
import { MobileNav } from "@/components/mobile-nav";
import { useShellDensity } from "@/components/shell-density-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ShellDensity } from "@/lib/layout";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/job-tracker", label: "Tracker" },
  { href: "/documents", label: "Documents" },
  { href: "/referrals", label: "Referrals" },
] as const;

const DENSITY_CYCLE: ShellDensity[] = ["wide", "medium", "narrow"];

type SiteHeaderBarProps = {
  user: HeaderUser | null;
};

export function SiteHeaderBar({ user }: SiteHeaderBarProps) {
  const { density, setDensity, shellX } = useShellDensity();

  function cycleDensity() {
    const i = DENSITY_CYCLE.indexOf(density);
    setDensity(DENSITY_CYCLE[(i + 1) % DENSITY_CYCLE.length]!);
  }

  return (
    <div
      className={cn(
        "relative mx-auto flex h-12 w-full items-center gap-2.5 overflow-visible sm:gap-3",
        shellX,
      )}
    >
      <MobileNav items={[...nav]} />

      <Link
        href="/"
        className="group flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
        aria-label="Arambh home"
      >
        <Image
          src="/brand/logo-icon.png"
          alt="Arambh logo"
          width={28}
          height={28}
          className="avsar-logo size-7"
          priority
        />
        <span className="avsar-display text-foreground text-sm">Arambh</span>
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
        <button
          type="button"
          onClick={cycleDensity}
          title={`Content width: ${density} (click to cycle)`}
          aria-label={`Content width ${density}. Click to cycle wide, medium, narrow.`}
          className="border-border bg-card/70 text-muted-foreground hover:text-foreground hidden h-8 items-center rounded-lg border px-2 text-[11px] font-medium sm:inline-flex"
        >
          {density === "wide" ? "Wide" : density === "medium" ? "Medium" : "Narrow"}
        </button>
        <ThemeToggle />
        <AuthHeaderActions user={user} />
      </div>
    </div>
  );
}
