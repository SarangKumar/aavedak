import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { CareersShowcase } from "@/lib/careers-showcase";

function formatCount(n: number): string {
  return n.toLocaleString("en-IN");
}

/**
 * Homepage band: the companies whose own careers pages Aavedak last read jobs from, and the
 * hiring platforms behind those pages. Data comes from the careers-page registry, so only
 * sources that actually returned jobs are named.
 */
export function HomeCareerSources({ showcase }: { showcase: CareersShowcase }) {
  const { companies, platforms, ownMarkupPages, readablePages } = showcase;
  return (
    <section
      className="aavedak-home-section aavedak-fade-up aavedak-fade-up-delay-3"
      aria-labelledby="sources-heading"
    >
      <div className="mb-3.5 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <h2
          id="sources-heading"
          className="text-foreground text-[14px] font-semibold tracking-tight"
        >
          Straight from company career pages
        </h2>
        <p className="aavedak-meta text-muted-foreground">
          {formatCount(readablePages)} careers {readablePages === 1 ? "page" : "pages"} read
          directly · links go back to the company
        </p>
      </div>

      <ul className="flex flex-wrap gap-1.5" aria-label="Companies we read jobs from">
        {companies.map((company) => (
          <li key={company.url}>
            <a
              href={company.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="border-border/80 bg-card text-foreground hover:border-primary/30 hover:text-primary inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium shadow-sm transition-colors"
            >
              {company.name}
              <ExternalLink className="text-muted-foreground size-3" aria-hidden />
            </a>
          </li>
        ))}
      </ul>

      {platforms.length > 0 || ownMarkupPages > 0 ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
            Read through
          </span>
          {platforms.map((platform) => (
            <Badge key={platform.label} variant="secondary" className="text-[11px]">
              {platform.label}
              <span className="text-muted-foreground tabular-nums">{platform.pages}</span>
            </Badge>
          ))}
          {ownMarkupPages > 0 ? (
            <Badge variant="outline" className="text-[11px]">
              The company&apos;s own page markup
              <span className="text-muted-foreground tabular-nums">{ownMarkupPages}</span>
            </Badge>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
