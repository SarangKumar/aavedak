import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";

import { AuthHeaderActions } from "@/components/auth-header-actions";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/lib/auth";
import { usernameFromUser } from "@/lib/username";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/job-tracker", label: "Tracker" },
  { href: "/documents", label: "Documents" },
  { href: "/referrals", label: "Referrals" },
] as const;

export async function SiteHeader({ className }: { className?: string }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const sessionUser = session?.user;
  const user = sessionUser
    ? {
        name: sessionUser.name,
        email: sessionUser.email,
        image: sessionUser.image,
        username: usernameFromUser({
          email: sessionUser.email,
          name: sessionUser.name,
          username:
            "username" in sessionUser
              ? (sessionUser.username as string | null | undefined)
              : undefined,
        }),
      }
    : null;

  return (
    <header
      className={cn(
        "border-border/60 bg-background/70 sticky top-0 z-40 border-b backdrop-blur-xl",
        className,
      )}
    >
      <div className="relative mx-auto flex h-12 max-w-5xl items-center gap-2.5 px-4 sm:gap-3 sm:px-6">
        <MobileNav items={nav} />

        <Link
          href="/"
          className="group flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
          aria-label="Avsar home"
        >
          <Image
            src="/brand/logo-icon.png"
            alt="Avsar logo"
            width={28}
            height={28}
            className="avsar-logo size-7"
            priority
          />
          <span className="avsar-display text-foreground text-sm">Avsar</span>
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
    </header>
  );
}
