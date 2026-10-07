import type { Metadata } from "next";
import Link from "next/link";

import { blockToHtml, parseChangelog, readChangelogMarkdown } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";
import { ShellWidth } from "@/components/shell-width";

export const metadata: Metadata = {
  title: "Changelog",
  description: `Release notes for Arambh v${APP_VERSION} — what shipped and when.`,
};

export default function ChangelogPage() {
  const md = readChangelogMarkdown();
  const blocks = parseChangelog(md);
  const html = blocks.map(blockToHtml).join("\n");

  return (
    <div className="relative overflow-hidden">
      <div className="avsar-mesh pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <ShellWidth className="avsar-fade-up relative space-y-6 py-8 sm:py-12">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide" lang="hi">
          आरंभ
        </p>
        <div className="prose-avsar" dangerouslySetInnerHTML={{ __html: html }} />
        <p className="text-muted-foreground border-border/60 mt-10 border-t pt-4 text-[12px]">
          Current version <span className="font-mono text-[11px]">v{APP_VERSION}</span>
          {" · "}
          <Link href="/" className="text-primary hover:underline">
            Home
          </Link>
        </p>
      </ShellWidth>
    </div>
  );
}
