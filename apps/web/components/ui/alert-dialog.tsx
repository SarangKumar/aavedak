"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type AlertDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Footer actions — typically Cancel + destructive Confirm. */
  footer: React.ReactNode;
  className?: string;
};

/**
 * Confirm / destructive dialog (`role="alertdialog"`), portal to body.
 * Matches Modal surface tokens without trapping focus libraries.
 */
export function AlertDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: AlertDialogProps) {
  const titleId = useId();
  const descId = useId();
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
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center p-3 sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] dark:bg-black/70"
        onClick={onClose}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "dark relative z-10 flex w-full max-w-md flex-col rounded-xl border shadow-xl shadow-black/40",
          "border-border bg-card text-card-foreground",
          className,
        )}
      >
        <div className="border-border/70 shrink-0 border-b px-4 py-3.5 sm:px-5">
          <h2 id={titleId} className="aavedak-display text-foreground text-lg">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="text-muted-foreground mt-1 text-[12px] leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {children ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-5">{children}</div>
        ) : null}
        <div className="border-border/70 flex shrink-0 justify-end gap-2 border-t px-4 py-3 sm:px-5">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
