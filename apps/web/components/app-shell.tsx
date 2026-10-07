import { CommandPalette } from "@/components/command-palette";
import { ShellDensityProvider } from "@/components/shell-density-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  className?: string;
};

export function AppShell({ children, className }: AppShellProps) {
  return (
    <ShellDensityProvider>
      <div className={cn("flex min-h-screen flex-col", className)}>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <CommandPalette />
      </div>
    </ShellDensityProvider>
  );
}
