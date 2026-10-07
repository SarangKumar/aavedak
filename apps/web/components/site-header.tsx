import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";

import { AuthHeaderActions } from "@/components/auth-header-actions";
import { auth } from "@/lib/auth";
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
  const user = session?.user
    ? {
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }
    : null;

  return (
    <header
      className={cn(
        "border-border/80 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/brand/icon.png"
            alt=""
            width={28}
            height={28}
            className="rounded-md"
            priority
          />
          <span className="text-foreground text-sm font-semibold tracking-tight">Avsar</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-lg px-2.5 py-1.5 text-sm transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <AuthHeaderActions user={user} />
        </div>
      </div>
    </header>
  );
}
