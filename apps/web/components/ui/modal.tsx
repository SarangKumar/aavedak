"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId?: string;
  description?: string;
  children: React.ReactNode;
  /** Footer actions (Cancel / Save). */
  footer?: React.ReactNode;
  className?: string;
  /** Max width of the panel. Default max-w-md. */
  size?: "md" | "lg" | "xl";
};

/**
 * Viewport-centered modal via portal to document.body.
 * Avoids ancestors with transform/animation (e.g. aavedak-fade-up) breaking `position: fixed`.
 */
export function Modal({
  open,
  onClose,
  title,
  titleId: titleIdProp,
  description,
  children,
  footer,
  className,
  size = "md",
}: ModalProps) {
  const autoId = useId();
  const titleId = titleIdProp ?? autoId;
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
      className="z-220 fixed inset-0 flex items-center justify-center p-3 sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] dark:bg-black/70"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // `dark` forces dark theme tokens for dialog content (dark-first surfaces).
          "dark relative z-10 flex max-h-[min(90vh,52rem)] w-full flex-col rounded-xl border shadow-xl shadow-black/40",
          "border-border bg-card text-card-foreground",
          size === "xl" ? "max-w-4xl" : size === "lg" ? "max-w-lg" : "max-w-md",
          className,
        )}
      >
        <div className="border-border/70 shrink-0 border-b px-4 py-3.5 sm:px-5">
          <h2 id={titleId} className="aavedak-display text-foreground text-lg">
            {title}
          </h2>
          {description ? (
            <p className="text-muted-foreground mt-1 text-[12px] leading-relaxed">{description}</p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-5">{children}</div>
        {footer ? (
          <div className="border-border/70 flex shrink-0 justify-end gap-2 border-t px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
