import Link from "next/link";

import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-border/60 mt-auto border-t", className)}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6">
        <div className="space-y-1">
          <p className="text-foreground/90 text-[13px] font-medium tracking-tight">
            Avsar{" "}
            <span className="text-primary/80 font-mono text-[11px] font-normal" lang="hi">
              अवसर
            </span>{" "}
            <span className="text-muted-foreground/80 font-mono text-[11px] font-normal">
              v{APP_VERSION}
            </span>
          </p>
          <p className="text-muted-foreground max-w-md text-pretty text-[13px] leading-relaxed">
            Avsar recommends and prepares. The user decides and sends.
          </p>
          <p className="text-muted-foreground/70 text-[11px]">© 2026 Avsar</p>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
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
      </div>
    </footer>
  );
}
