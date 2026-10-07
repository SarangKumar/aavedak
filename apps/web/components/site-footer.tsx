import Link from "next/link";

import { SHELL_X } from "@/lib/layout";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-border/60 mt-auto border-t", className)}>
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:py-8",
          SHELL_X,
        )}
      >
        <div className="space-y-1">
          <p className="text-foreground/90 text-[13px] font-medium tracking-tight">
            Arambh{" "}
            <span className="text-primary/80 font-mono text-[11px] font-normal" lang="hi">
              आरंभ
            </span>{" "}
            <span className="text-muted-foreground/80 font-mono text-[11px] font-normal">
              v{APP_VERSION}
            </span>
          </p>
          <p className="text-muted-foreground max-w-md text-pretty text-[13px] leading-relaxed">
            Arambh recommends and prepares. The user decides and sends.
          </p>
          <p className="text-muted-foreground/70 text-[11px]">© 2026 Arambh</p>
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
