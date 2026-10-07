import type { ReactNode } from "react";

import { ShellWidth } from "@/components/shell-width";

export type LegalSection = { title: string; body: ReactNode };

export function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: ReactNode;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <ShellWidth className="aavedak-fade-up space-y-8 py-10 sm:py-14">
      <header className="max-w-2xl space-y-3">
        <p className="text-primary/90 font-mono text-[12px] tracking-wide">
          Last updated {updated}
        </p>
        <h1 className="aavedak-display text-foreground text-3xl sm:text-4xl">{title}</h1>
        <div className="text-muted-foreground text-[15px] leading-relaxed">{intro}</div>
      </header>
      <div className="max-w-2xl space-y-6">
        {sections.map((s) => (
          <section key={s.title} className="space-y-2">
            <h2 className="text-foreground text-[15px] font-semibold tracking-tight">{s.title}</h2>
            <div className="text-muted-foreground space-y-2 text-[14px] leading-relaxed">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </ShellWidth>
  );
}
