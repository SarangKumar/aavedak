import { cn } from "@/lib/utils";
import { FeatureHeading } from "@/components/feature-heading";

/** Static Jobs page heading. Rendered by the page itself so it shows before the board loads. */
export function JobsPageHeader({ className }: { className?: string }) {
  return (
    <header className={cn("space-y-1", className)}>
      <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
        आवेदक
      </p>
      <FeatureHeading feature="jobs" />
      <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
        Junior engineering roles in India, discovered daily from company career pages and ranked
        against your resume.
      </p>
    </header>
  );
}
