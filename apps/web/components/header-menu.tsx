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
  /** Accessible name for the trigger button */
  label: string;
  /** Extra classes for the trigger button */
  triggerClassName?: string | ((open: boolean) => string);
  /** Trigger button contents */
  trigger: ReactNode;
  /** Menu panel width / extra classes */
  menuClassName?: string;
  align?: "right" | "left";
  children: (args: { close: () => void }) => ReactNode;
};

/**
 * Header dropdown that portals to document.body with fixed positioning.
 * Avoids sticky-header / overflow clipping that hides absolute menus.
 * Only portals after mount (SSR-safe).
 */
export function HeaderMenu({
  label,
  triggerClassName,
  trigger,
  menuClassName,
  align = "right",
  children,
}: HeaderMenuProps) {
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

    // Defer so the opening click doesn't immediately close.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);

    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const close = useCallback(() => setOpen(false), []);

  const triggerCls =
    typeof triggerClassName === "function" ? triggerClassName(open) : triggerClassName;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={triggerCls}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {trigger}
      </button>
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
              {children({ close })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
