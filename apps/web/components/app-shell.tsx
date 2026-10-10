import { Suspense } from "react";

import { CommandPalette } from "@/components/command-palette";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  className?: string;
};

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className={cn("flex min-h-screen flex-col", className)}>
      {/* Streamed: the header's session lookup must not hold up the page shell. */}
      <Suspense fallback={<div className="h-14 shrink-0 border-b" />}>
        <SiteHeader />
      </Suspense>
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CommandPalette />
      <Toaster position="bottom-right" />
    </div>
  );
}
