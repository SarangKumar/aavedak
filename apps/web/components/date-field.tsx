"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

function labelFor(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const node = buttonRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setPoint({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (buttonRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-slot='date-field-popover']")) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-foreground text-[12px] font-medium">
        {label}
      </label>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="border-border bg-background text-foreground flex h-9 w-full items-center rounded-lg border px-3 text-left text-[13px]"
      >
        <span className={value ? "" : "text-muted-foreground"}>
          {value ? labelFor(value) : placeholder}
        </span>
      </button>
      {open && point
        ? createPortal(
            <div
              data-slot="date-field-popover"
              style={{
                position: "fixed",
                top: point.top,
                left: point.left,
                minWidth: Math.max(point.width, 280),
              }}
              className={cn(
                "border-border bg-popover text-popover-foreground z-[400] rounded-lg border shadow-lg",
              )}
            >
              <Calendar
                value={value}
                onChange={(next) => {
                  onChange(next);
                  setOpen(false);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
