"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function Calendar({
  value,
  onChange,
  className,
}: {
  value?: string | null;
  onChange: (isoDate: string) => void;
  className?: string;
}) {
  const selected = parseIso(value);
  const [visible, setVisible] = useState(() => startOfMonth(selected ?? new Date()));
  const cells = useMemo(() => {
    const first = startOfMonth(visible);
    const lead = first.getDay();
    const days = new Date(visible.getFullYear(), visible.getMonth() + 1, 0).getDate();
    const items: Array<Date | null> = [];
    for (let i = 0; i < lead; i += 1) items.push(null);
    for (let day = 1; day <= days; day += 1) {
      items.push(new Date(visible.getFullYear(), visible.getMonth(), day));
    }
    return items;
  }, [visible]);
  const label = visible.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = isoDate(new Date());

  return (
    <div className={cn("w-[17.5rem] p-2", className)} data-slot="calendar">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-7 items-center justify-center rounded-md"
          aria-label="Previous month"
          onClick={() => setVisible(new Date(visible.getFullYear(), visible.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <p className="text-foreground text-[13px] font-medium">{label}</p>
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-7 items-center justify-center rounded-md"
          aria-label="Next month"
          onClick={() => setVisible(new Date(visible.getFullYear(), visible.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>
      <div className="text-muted-foreground grid grid-cols-7 text-center text-[11px]">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} />;
          const iso = isoDate(date);
          const isSelected = selected ? isoDate(selected) === iso : false;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              className={cn(
                "mx-auto inline-flex size-8 items-center justify-center rounded-md text-[12px]",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent",
                iso === today && !isSelected && "border-primary/50 border",
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
