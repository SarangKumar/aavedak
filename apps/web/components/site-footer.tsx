import Link from "next/link";

import { ShellWidth } from "@/components/shell-width";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-border/60 mt-auto border-t", className)}>
      <ShellWidth className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:py-8">
        <div className="space-y-1">
          <p className="text-foreground/90 text-[13px] font-medium tracking-tight">
            Aavedak{" "}
            <span className="text-primary/80 font-mono text-[11px] font-normal" lang="hi">
              आवेदक
            </span>{" "}
            <span className="text-muted-foreground/80 font-mono text-[11px] font-normal">
              v{APP_VERSION}
            </span>
          </p>
          <p className="text-muted-foreground max-w-md text-pretty text-[13px] leading-relaxed">
            Aavedak recommends and prepares. The user decides and sends.
          </p>
          <p className="text-muted-foreground/70 text-[11px]">© 2026 Aavedak</p>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
          <Link
            href="/about"
            className="hover:text-foreground inline-flex min-h-8 items-center transition-colors"
          >
            About
          </Link>
          <span className="text-border hidden sm:inline" aria-hidden>
            ·
          </span>
          <Link
            href="/changelog"
            className="hover:text-foreground inline-flex min-h-8 items-center transition-colors"
          >
            Changelog
          </Link>
          <span className="text-border hidden sm:inline" aria-hidden>
            ·
          </span>
          <Link
            href="/privacy"
            className="hover:text-foreground inline-flex min-h-8 items-center transition-colors"
          >
            Privacy
          </Link>
          <span className="text-border hidden sm:inline" aria-hidden>
            ·
          </span>
          <Link
            href="/terms"
            className="hover:text-foreground inline-flex min-h-8 items-center transition-colors"
          >
            Terms
          </Link>
          <span className="text-border hidden sm:inline" aria-hidden>
            ·
          </span>
          <Link
            href="https://sarangkumar.vercel.app"
            className="hover:text-foreground inline-flex min-h-8 items-center transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sarang Kumar
          </Link>
          <span className="text-border hidden sm:inline" aria-hidden>
            ·
          </span>
          <Link
            href="https://vinyaas.vercel.app"
            className="hover:text-foreground inline-flex min-h-8 items-center transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Design system: Vinyaas
          </Link>
        </div>
      </ShellWidth>
    </footer>
  );
}
