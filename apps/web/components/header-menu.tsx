"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type HeaderMenuProps = {
  trigger: (args: {
    open: boolean;
    setOpen: (open: boolean) => void;
    triggerProps: {
      ref: React.RefObject<HTMLButtonElement | null>;
      "aria-expanded": boolean;
      "aria-haspopup": "menu";
      "aria-controls": string;
      type: "button";
      onClick: () => void;
    };
  }) => ReactNode;
  children: (args: { close: () => void; menuId: string }) => ReactNode;
  /** Fixed menu panel width class, e.g. w-36 */
  menuClassName?: string;
  align?: "right" | "left";
};

/**
 * Header dropdown that portals to document.body with fixed positioning.
 * Avoids sticky-header / overflow-x clipping that hides absolute menus.
 */
export function HeaderMenu({ trigger, children, menuClassName, align = "right" }: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number }>({
    top: 0,
    right: 0,
  });
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (align === "right") {
      setCoords({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    } else {
      setCoords({
        top: rect.bottom + 8,
        left: Math.max(8, rect.left),
      });
    }
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onReposition() {
      updatePosition();
    }

    // Defer so the opening click doesn't immediately close.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);

    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updatePosition]);

  const close = useCallback(() => setOpen(false), []);

  const triggerProps = {
    ref: triggerRef,
    "aria-expanded": open,
    "aria-haspopup": "menu" as const,
    "aria-controls": menuId,
    type: "button" as const,
    onClick: () => setOpen((value) => !value),
  };

  return (
    <>
      {trigger({ open, setOpen, triggerProps })}
      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={menuId}
              role="menu"
              style={{
                position: "fixed",
                top: coords.top,
                zIndex: 200,
                ...(coords.left != null ? { left: coords.left } : {}),
                ...(coords.right != null ? { right: coords.right } : {}),
              }}
              className={cn(
                "border-border bg-popover text-popover-foreground overflow-hidden rounded-xl border shadow-lg shadow-black/30",
                menuClassName,
              )}
            >
              {children({ close, menuId })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
