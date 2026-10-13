"use client";

import * as React from "react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "../button";
import { Calendar } from "../calendar";
import type { DateRange } from "react-day-picker";

import { Popover, PopoverContent, PopoverTrigger } from "../popover";

export type { DateRange };

export type DatePickerProps = {
  value?: Date;
  defaultValue?: Date;
  onValueChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  /** date-fns format string for the trigger label. */
  formatString?: string;
  id?: string;
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Forwarded to Calendar `disabled` matcher. */
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "data-invalid"?: string;
};

/**
 * Button + Popover + Calendar composition for picking a single date.
 */
export function DatePicker({
  value,
  defaultValue,
  onValueChange,
  placeholder = "Pick a date",
  disabled = false,
  formatString = "PPP",
  id,
  className,
  open,
  defaultOpen,
  onOpenChange,
  disabledDates,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "data-invalid": dataInvalid,
}: DatePickerProps) {
  const [uncontrolled, setUncontrolled] = React.useState<Date | undefined>(defaultValue);
  const isControlled = value !== undefined;
  const selected = isControlled ? value : uncontrolled;

  function setSelected(next: Date | undefined) {
    if (!isControlled) {
      setUncontrolled(next);
    }
    onValueChange?.(next);
  }

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const isOpenControlled = open !== undefined;
  const isOpen = isOpenControlled ? open : uncontrolledOpen;

  function setOpen(next: boolean) {
    if (!isOpenControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  }

  const label = selected ? format(selected, formatString) : placeholder;
  const accessibleName = ariaLabel ?? (selected ? `Selected date ${label}` : placeholder);

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={accessibleName}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          data-invalid={dataInvalid}
          data-empty={!selected ? "" : undefined}
          className={cn(
            "inline-flex w-full min-w-0 items-center justify-start gap-2 text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarGlyph className="size-4 shrink-0 opacity-70" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            setSelected(date);
            if (date) {
              setOpen(false);
            }
          }}
          disabled={disabledDates}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export type DateRangePickerProps = {
  value?: DateRange;
  onValueChange?: (range: DateRange | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  /** date-fns format string for each end in the trigger label. */
  formatString?: string;
  /** Show a clear button when a range is set. Default true. */
  clearable?: boolean;
  numberOfMonths?: number;
  id?: string;
  className?: string;
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
  "aria-label"?: string;
};

/**
 * Button + Popover + Calendar (`mode="range"`) composition for picking a date range, the
 * range counterpart of DatePicker. The trigger reads "from – to"; either end may be open.
 */
export function DateRangePicker({
  value,
  onValueChange,
  placeholder = "Pick a date range",
  disabled = false,
  formatString = "PPP",
  clearable = true,
  numberOfMonths = 2,
  id,
  className,
  disabledDates,
  "aria-label": ariaLabel,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const hasValue = Boolean(value?.from || value?.to);
  const label = hasValue
    ? `${value?.from ? format(value.from, formatString) : "…"} – ${
        value?.to ? format(value.to, formatString) : "…"
      }`
    : placeholder;

  return (
    <div className={cn("relative inline-flex min-w-0", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel ? `${ariaLabel}: ${label}` : label}
            data-empty={!hasValue ? "" : undefined}
            className={cn(
              "inline-flex h-full w-full min-w-0 items-center justify-start gap-2 text-left text-[length:inherit] font-normal",
              !hasValue && "text-muted-foreground",
              clearable && hasValue && "pr-8",
            )}
          >
            <CalendarGlyph className="size-4 shrink-0 opacity-70" />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={value}
            onSelect={(range) => onValueChange?.(range)}
            defaultMonth={value?.from ?? value?.to}
            numberOfMonths={numberOfMonths}
            disabled={disabledDates}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {clearable && hasValue && !disabled ? (
        <button
          type="button"
          aria-label="Clear date range"
          onClick={() => onValueChange?.(undefined)}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-3.5"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function CalendarGlyph(props: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}
