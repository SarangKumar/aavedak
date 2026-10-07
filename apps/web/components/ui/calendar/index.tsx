"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

/** Compact Vinyaas-style month calendar for picking a single YYYY-MM-DD date. */
export function Calendar({
  value,
  onChange,
  className,
}: {
  value?: string | null;
  onChange: (isoDate: string) => void;
  className?: string;
}) {
  const selected = value?.slice(0, 10) || null;
  const initial = selected ? new Date(`${selected}T12:00:00`) : new Date();
  const [cursor, setCursor] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  );

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; iso: string | null }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, iso: null });
    for (let d = 1; d <= dim; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso });
    }
    return cells;
  }, [cursor]);

  const label = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className={cn("border-border bg-card w-[17.5rem] rounded-lg border p-3 shadow-sm", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-foreground text-[13px] font-semibold">{label}</p>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="text-muted-foreground mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((cell, idx) =>
          cell.day == null ? (
            <span key={`e-${idx}`} className="size-8" />
          ) : (
            <button
              key={cell.iso}
              type="button"
              onClick={() => cell.iso && onChange(cell.iso)}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md text-[12px] tabular-nums transition-colors",
                cell.iso === selected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-foreground hover:bg-accent",
              )}
            >
              {cell.day}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export function DatePickerField({
  label,
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  label?: string;
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const display = value ? value.slice(0, 10) : "";

  return (
    <div className="relative space-y-1">
      {label ? <span className="text-foreground text-[12px] font-medium">{label}</span> : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border-border bg-background text-foreground flex h-9 w-full items-center justify-between rounded-md border px-3 text-left text-[13px]"
      >
        <span className={cn(!display && "text-muted-foreground")}>{display || placeholder}</span>
        <span className="text-muted-foreground text-[11px]" aria-hidden>
          📅
        </span>
      </button>
      {open ? (
        <div className="absolute z-50 mt-1">
          <Calendar
            value={display || null}
            onChange={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
