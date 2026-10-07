"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Panel width. Default max-w-md. */
  size?: "md" | "lg";
};

/**
 * Right-side drawer (Vinyaas-style sheet) via portal to document.body.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}: SheetProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[220]" role="presentation">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] dark:bg-black/70"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "border-border bg-card text-card-foreground dark absolute inset-y-0 right-0 flex w-full flex-col border-l shadow-xl shadow-black/40",
          size === "lg" ? "max-w-lg" : "max-w-md",
          className,
        )}
      >
        <div className="border-border/70 flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="aavedak-display text-foreground text-lg">
              {title}
            </h2>
            {description ? (
              <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
          >
            <span aria-hidden className="text-[18px] leading-none">
              ×
            </span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-5">{children}</div>
        {footer ? (
          <div className="border-border/70 flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
