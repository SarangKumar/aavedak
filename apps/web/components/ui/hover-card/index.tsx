"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type HoverCardContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentId: string;
  openDelay: number;
  closeDelay: number;
};

const HoverCardContext = createContext<HoverCardContextValue | null>(null);

function useHoverCard() {
  const ctx = useContext(HoverCardContext);
  if (!ctx) throw new Error("HoverCard parts must be used within HoverCard.");
  return ctx;
}

export type HoverCardProps = {
  children: React.ReactNode;
  openDelay?: number;
  closeDelay?: number;
};

export function HoverCard({ children, openDelay = 120, closeDelay = 120 }: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentId = useId();

  return (
    <HoverCardContext.Provider
      value={{ open, setOpen, triggerRef, contentId, openDelay, closeDelay }}
    >
      {children}
    </HoverCardContext.Provider>
  );
}

export type HoverCardTriggerProps = React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
};

export function HoverCardTrigger({
  children,
  className,
  asChild = false,
  ...props
}: HoverCardTriggerProps) {
  const { setOpen, triggerRef, contentId, openDelay, closeDelay, open } = useHoverCard();
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current != null) window.clearTimeout(openTimer.current);
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpen(true), openDelay);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), closeDelay);
  };

  const shared = {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
    },
    "aria-describedby": open ? contentId : undefined,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      props.onMouseEnter?.(e);
      scheduleOpen();
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      props.onMouseLeave?.(e);
      scheduleClose();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      props.onFocus?.(e);
      setOpen(true);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      props.onBlur?.(e);
      setOpen(false);
    },
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      ...shared,
      className: cn((children.props as { className?: string }).className, className),
    });
  }

  return (
    <span
      tabIndex={0}
      className={cn("inline-flex max-w-full cursor-help items-center", className)}
      {...props}
      {...shared}
    >
      {children}
    </span>
  );
}

export type HoverCardContentProps = React.HTMLAttributes<HTMLDivElement> & {
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
};

export function HoverCardContent({
  children,
  className,
  side = "top",
  align = "start",
  ...props
}: HoverCardContentProps) {
  const { open, setOpen, triggerRef, contentId, closeDelay } = useHoverCard();
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.left;
    if (align === "center") left = rect.left + rect.width / 2;
    if (align === "end") left = rect.right;
    const top = side === "top" ? rect.top - 8 : rect.bottom + 8;
    setCoords({ top, left });
  }, [open, side, align, triggerRef]);

  if (!mounted || !open || !coords) return null;

  return createPortal(
    <div
      id={contentId}
      role="tooltip"
      className={cn(
        "border-border bg-popover text-popover-foreground z-[300] w-56 rounded-lg border p-2.5 text-[11px] shadow-md",
        "animate-in fade-in-0 zoom-in-95",
        className,
      )}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        transform:
          side === "top"
            ? align === "center"
              ? "translate(-50%, -100%)"
              : align === "end"
                ? "translate(-100%, -100%)"
                : "translate(0, -100%)"
            : align === "center"
              ? "translate(-50%, 0)"
              : align === "end"
                ? "translate(-100%, 0)"
                : "translate(0, 0)",
      }}
      onMouseEnter={() => {
        if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        closeTimer.current = window.setTimeout(() => setOpen(false), closeDelay);
      }}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}
