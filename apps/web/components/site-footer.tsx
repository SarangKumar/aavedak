import Link from "next/link";

import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-border/80 mt-auto border-t", className)}>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">
            Avsar recommends and prepares. The user decides and sends.
          </p>
          <p className="text-muted-foreground/80 text-xs">© 2026 Avsar</p>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <Link
            href="https://sarangkumar.vercel.app"
            className="hover:text-foreground transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sarang Kumar
          </Link>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <Link
            href="https://vinyaas.vercel.app"
            className="hover:text-foreground transition-colors"
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
