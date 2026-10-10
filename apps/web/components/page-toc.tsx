"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type TocItem = { id: string; label: string; depth?: 1 | 2 };

/**
 * "On this page" list for long static pages. Highlights the section being read: the last
 * heading that has scrolled past the top band of the viewport (below the sticky header).
 */
export function PageToc({ items, className }: { items: readonly TocItem[]; className?: string }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    function update() {
      // 120px ≈ sticky header + a little reading margin.
      const passed = headings.filter((el) => el.getBoundingClientRect().top <= 120);
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
      const current = atBottom ? headings[headings.length - 1] : passed[passed.length - 1];
      setActiveId(current?.id ?? headings[0].id);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  return (
    <nav aria-label="On this page" className={className}>
      <p className="text-foreground mb-2 text-[12px] font-semibold tracking-tight">On this page</p>
      <ul className="border-border/70 space-y-0.5 border-l">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "-ml-px block border-l py-1 text-[12px] leading-snug transition-colors",
                  item.depth === 2 ? "pl-6" : "pl-3",
                  active
                    ? "border-primary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
