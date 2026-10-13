"use client";

import { format, parseISO } from "date-fns";

import { CompanySelect } from "@/components/company-select";
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { JOB_SOURCES, isJobSource, type JobSource } from "@/lib/job-constants";
import { CANONICAL_LOCATIONS, locationKeywords } from "@/lib/locations";
import { cn } from "@/lib/utils";

export const JOB_SOURCE_LABELS: Record<JobSource, string> = {
  manual: "Manual",
  linkedin: "LinkedIn",
  careers: "Careers",
  indeed: "Indeed",
  other: "Other",
};

/** Editable job fields, all as form strings (dates as yyyy-MM-dd, skills comma-separated). */
export type JobFormValues = {
  title: string;
  company: string;
  location: string;
  source: JobSource;
  url: string;
  salary: string;
  description: string;
  workMode: string;
  employmentType: string;
  seniority: string;
  postedAt: string;
  skills: string;
};

export type JobFormField = Exclude<keyof JobFormValues, "source">;

/**
 * The job form used by Add job (Jobs page) and the admin job editor: company creatable
 * select, canonical location Combobox, posted-date picker and the remaining text fields.
 */
export function JobFormFields({
  value,
  onFieldChange,
  onSourceChange,
  locationHint,
  onLocationPicked,
  className,
}: {
  value: JobFormValues;
  onFieldChange: (field: JobFormField, next: string) => void;
  onSourceChange: (source: JobSource) => void;
  /** Raw location text from a posting that didn't map to a canonical value. */
  locationHint?: string | null;
  onLocationPicked?: () => void;
  className?: string;
}) {
  // Two columns on wider screens; the description spans both.
  return (
    <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", className)}>
      <Field label="Title *" value={value.title} onChange={(v) => onFieldChange("title", v)} />
      <label className="block space-y-1">
        <span className="text-foreground text-[12px] font-medium">Company *</span>
        <CompanySelect
          value={value.company}
          onChange={(name) => onFieldChange("company", name)}
          placeholder="e.g. Stripe"
        />
      </label>
      <div className="block space-y-1">
        <span className="text-foreground text-[12px] font-medium">Location *</span>
        <Combobox
          value={value.location || undefined}
          onValueChange={(v) => {
            onLocationPicked?.();
            onFieldChange("location", v ?? "");
          }}
        >
          <ComboboxTrigger
            placeholder="Pick a city or Remote"
            aria-label="Location"
            className="h-9 text-[13px]"
          />
          <ComboboxContent
            className="z-240"
            searchPlaceholder="Search cities…"
            emptyMessage="No matching location."
          >
            {CANONICAL_LOCATIONS.map((loc) => (
              <ComboboxItem key={loc} value={loc} keywords={locationKeywords(loc)}>
                {loc}
              </ComboboxItem>
            ))}
          </ComboboxContent>
        </Combobox>
        {locationHint ? (
          <p className="text-muted-foreground text-[11px]">
            The posting says &ldquo;{locationHint}&rdquo;. Pick the closest location.
          </p>
        ) : null}
      </div>
      <label className="block space-y-1">
        <span className="text-foreground text-[12px] font-medium">Source</span>
        <Select
          value={value.source}
          onValueChange={(v) => {
            if (v && isJobSource(v)) onSourceChange(v);
          }}
        >
          <SelectTrigger className="text-foreground h-9 w-full rounded-md border px-2.5 text-[13px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent className="z-240">
            {JOB_SOURCES.map((src) => (
              <SelectItem key={src} value={src}>
                {JOB_SOURCE_LABELS[src]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <Field label="Apply URL" value={value.url} onChange={(v) => onFieldChange("url", v)} />
      <Field
        label="Salary / CTC"
        value={value.salary}
        onChange={(v) => onFieldChange("salary", v)}
      />
      <label className="block space-y-1">
        <span className="text-foreground text-[12px] font-medium">Work mode</span>
        <Select
          value={value.workMode || "unset"}
          onValueChange={(v) => onFieldChange("workMode", v === "unset" ? "" : String(v))}
        >
          <SelectTrigger className="text-foreground h-9 w-full rounded-md border px-2.5 text-[13px]">
            <SelectValue placeholder="Work mode" />
          </SelectTrigger>
          <SelectContent className="z-240">
            <SelectItem value="unset">Not specified</SelectItem>
            <SelectItem value="onsite">On-site</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Field
        label="Employment type"
        value={value.employmentType}
        onChange={(v) => onFieldChange("employmentType", v)}
      />
      <Field
        label="Seniority"
        value={value.seniority}
        onChange={(v) => onFieldChange("seniority", v)}
      />
      <div className="block space-y-1">
        <span className="text-foreground text-[12px] font-medium">Posted on</span>
        <DatePicker
          value={value.postedAt ? parseISO(value.postedAt) : undefined}
          onValueChange={(d) => onFieldChange("postedAt", d ? format(d, "yyyy-MM-dd") : "")}
          disabledDates={{ after: new Date() }}
          placeholder="Pick a date"
          aria-label="Posted on"
          className="h-9 w-full text-[13px]"
        />
      </div>
      <label className="block space-y-1 md:col-span-2">
        <span className="text-foreground text-[12px] font-medium">Skills (comma-separated)</span>
        <Input value={value.skills} onChange={(e) => onFieldChange("skills", e.target.value)} />
      </label>
      <label className="block space-y-1 md:col-span-2">
        <span className="text-foreground text-[12px] font-medium">Description</span>
        <Textarea
          value={value.description}
          onChange={(e) => onFieldChange("description", e.target.value)}
          rows={8}
          className="py-2"
        />
      </label>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-foreground text-[12px] font-medium">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
