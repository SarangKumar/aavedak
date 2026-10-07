"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/application-status";
import { cn } from "@/lib/utils";

type StatusSelectProps = {
  value: ApplicationStatus;
  options: readonly ApplicationStatus[];
  onChange: (status: ApplicationStatus) => void;
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
};

export function StatusSelect({
  value,
  options,
  onChange,
  className,
  triggerClassName,
  "aria-label": ariaLabel = "Status",
}: StatusSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as ApplicationStatus);
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "border-border bg-background text-foreground h-7 min-w-[7.5rem] rounded-md border px-2 text-[12px]",
          triggerClassName,
        )}
      >
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent className={cn("z-[240]", className)}>
        {options.map((s) => (
          <SelectItem key={s} value={s} className="text-[13px]">
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
