"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
};

export function MobileNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="border-border bg-card/80 text-foreground hover:text-primary inline-flex size-8 items-center justify-center rounded-lg border transition-colors"
      >
        <span className="sr-only">Menu</span>
        <span className="flex w-3.5 flex-col gap-0.5" aria-hidden>
          <span
            className={cn(
              "bg-foreground block h-0.5 w-full rounded transition-transform",
              open && "translate-y-[5px] rotate-45",
            )}
          />
          <span
            className={cn(
              "bg-foreground block h-0.5 w-full rounded transition-opacity",
              open && "opacity-0",
            )}
          />
          <span
            className={cn(
              "bg-foreground block h-0.5 w-full rounded transition-transform",
              open && "-translate-y-[5px] -rotate-45",
            )}
          />
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Dismiss menu"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <nav
            id={panelId}
            aria-label="Mobile"
            className="border-border bg-popover text-popover-foreground absolute inset-x-0 top-full z-50 border-b shadow-lg shadow-black/30"
          >
            <ul className="mx-auto flex max-w-5xl flex-col gap-0.5 px-3 py-2.5 sm:px-6">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="text-muted-foreground hover:text-foreground flex min-h-10 items-center rounded-lg px-3 text-[13px] font-medium transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      ) : null}
    </div>
  );
}
