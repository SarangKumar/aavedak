"use client";

import { Info } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  RESUME_CREATOR_FONTS,
  RESUME_FONT_WEIGHTS,
  type ResumeCreatorFontId,
  type ResumeCreatorStyle,
  type ResumeDateFormat,
  type ResumeEducationLayout,
  type ResumeEducationShowBy,
  type ResumeFontWeight,
  type ResumeHAlign,
  type ResumePageFormat,
  type ResumeSideAlign,
  type ResumeSkillsCategoryMode,
  type ResumeSkillsLayout,
} from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";

type Props = {
  style: ResumeCreatorStyle;
  onChange: (partial: Partial<ResumeCreatorStyle>) => void;
  /** When set, only render skills-scoped layout controls. */
  scope?: "all" | "skills" | "education";
  className?: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground text-[11px] font-medium">{children}</span>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
      {children}
    </p>
  );
}

function SizeRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: "pt" | "%";
  onChange: (n: number) => void;
}) {
  const display = unit === "%" ? Math.round(value) : value;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2">
      <div className="min-w-0 space-y-1">
        <FieldLabel>{label}</FieldLabel>
        <Slider
          min={min}
          max={max}
          step={step}
          value={value}
          onValueChange={(n) => onChange(Math.min(max, Math.max(min, n)))}
          aria-label={label}
        />
      </div>
      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={display}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            onChange(Math.min(max, Math.max(min, n)));
          }}
          className="h-8 pr-8 text-[12px] tabular-nums"
          aria-label={`${label} value`}
        />
        <span className="text-muted-foreground pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px]">
          {unit}
        </span>
      </div>
    </div>
  );
}

/** Visual layout option card (mock-style ToggleGroup item). */
function LayoutCard({
  value,
  label,
  preview,
}: {
  value: string;
  label: string;
  preview: React.ReactNode;
}) {
  return (
    <ToggleGroupItem
      value={value}
      className={cn(
        "border-border data-[state=on]:border-primary data-[state=on]:bg-primary/10",
        "h-auto w-full flex-col items-stretch gap-1.5 rounded-md border px-2 py-2 text-left",
      )}
    >
      <div className="bg-muted/40 flex min-h-10 items-center rounded-sm px-1.5 py-1">{preview}</div>
      <span className="text-[11px] font-medium">{label}</span>
    </ToggleGroupItem>
  );
}

function Bars({ n = 2, className }: { n?: number; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn(
            "bg-muted-foreground/30 block h-1 rounded-full",
            i === 0 ? "w-3/4" : "w-1/2",
          )}
        />
      ))}
    </div>
  );
}

function TextAccordion({
  style,
  onChange,
}: {
  style: ResumeCreatorStyle;
  onChange: (partial: Partial<ResumeCreatorStyle>) => void;
}) {
  const lineHeightPct = Math.round(style.lineHeight * 100);
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["primaryFont", "Primary font"],
            ["secondaryFont", "Secondary font"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block min-w-0 space-y-1">
            <FieldLabel>{label}</FieldLabel>
            <Select
              value={style[key]}
              onValueChange={(v) => onChange({ [key]: v as ResumeCreatorFontId })}
            >
              <SelectTrigger className="h-8 w-full text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RESUME_CREATOR_FONTS) as ResumeCreatorFontId[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    <span style={{ fontFamily: RESUME_CREATOR_FONTS[id].css }}>
                      {RESUME_CREATOR_FONTS[id].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ))}
      </div>

      <SizeRow
        label="Line height"
        value={lineHeightPct}
        min={100}
        max={200}
        step={5}
        unit="%"
        onChange={(pct) => onChange({ lineHeight: pct / 100 })}
      />

      <div className="space-y-2.5 pt-1">
        <SectionLabel>Font size</SectionLabel>
        {(
          [
            ["headerPt", "Primary heading", 12, 28],
            ["footerPt", "Secondary heading", 6, 14],
            ["bodyPt", "Body", 7, 14],
            ["sectionTitlePt", "Section titles", 8, 18],
          ] as const
        ).map(([key, label, min, max]) => (
          <SizeRow
            key={key}
            label={label}
            value={style[key]}
            min={min}
            max={max}
            step={0.5}
            unit="pt"
            onChange={(n) => onChange({ [key]: n })}
          />
        ))}
      </div>

      <div className="space-y-2.5 pt-1">
        <SectionLabel>Font weight</SectionLabel>
        <Alert className="bg-primary/5 border-primary/20 py-2.5">
          <Info className="text-primary size-4" aria-hidden />
          <AlertDescription className="text-[11px] leading-snug">
            Select any font weight you like, but DOCX will simplify to Bold and Normal. PDF
            preserves bold vs regular on standard fonts; the preview shows Medium and Semibold.
          </AlertDescription>
        </Alert>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["headerWeight", "Primary heading"],
              ["secondaryHeadingWeight", "Secondary heading"],
              ["bodyWeight", "Body"],
              ["sectionTitleWeight", "Section titles"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block min-w-0 space-y-1">
              <FieldLabel>{label}</FieldLabel>
              <Select
                value={style[key]}
                onValueChange={(v) => onChange({ [key]: v as ResumeFontWeight })}
              >
                <SelectTrigger className="h-8 w-full text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RESUME_FONT_WEIGHTS) as ResumeFontWeight[]).map((id) => (
                    <SelectItem key={id} value={id}>
                      {RESUME_FONT_WEIGHTS[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function LayoutGlobal({
  style,
  onChange,
}: {
  style: ResumeCreatorStyle;
  onChange: (partial: Partial<ResumeCreatorStyle>) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <FieldLabel>Format</FieldLabel>
        <Select
          value={style.pageFormat}
          onValueChange={(v) => onChange({ pageFormat: v as ResumePageFormat })}
        >
          <SelectTrigger className="h-8 w-full text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a4">A4 (210 × 297 mm)</SelectItem>
            <SelectItem value="letter">US Letter (8.5″ × 11″)</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <div className="space-y-2.5">
        <SectionLabel>Margins & paddings</SectionLabel>
        <SizeRow
          label="Header & Footer"
          value={style.headerFooterPt}
          min={0}
          max={72}
          step={1}
          unit="pt"
          onChange={(n) => onChange({ headerFooterPt: n })}
        />
        <SizeRow
          label="Top & bottom"
          value={style.marginYPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(n) => onChange({ marginYPt: n })}
        />
        <SizeRow
          label="Left & right"
          value={style.marginXPt}
          min={0}
          max={96}
          step={1}
          unit="pt"
          onChange={(n) => onChange({ marginXPt: n })}
        />
        <SizeRow
          label="Between sections"
          value={style.sectionGapPt}
          min={0}
          max={48}
          step={0.5}
          unit="pt"
          onChange={(n) => onChange({ sectionGapPt: n })}
        />
        <SizeRow
          label="Between Titles & Content"
          value={style.titleContentGapPt}
          min={0}
          max={24}
          step={0.5}
          unit="pt"
          onChange={(n) => onChange({ titleContentGapPt: n })}
        />
        <SizeRow
          label="Between Content blocks"
          value={style.contentBlockGapPt}
          min={0}
          max={24}
          step={0.5}
          unit="pt"
          onChange={(n) => onChange({ contentBlockGapPt: n })}
        />
        <SizeRow
          label="Inside the content block"
          value={style.insideBlockGapPt}
          min={0}
          max={16}
          step={0.5}
          unit="pt"
          onChange={(n) => onChange({ insideBlockGapPt: n })}
        />
      </div>

      <label className="block space-y-1">
        <FieldLabel>Date format</FieldLabel>
        <Select
          value={style.dateFormat}
          onValueChange={(v) => onChange({ dateFormat: v as ResumeDateFormat })}
        >
          <SelectTrigger className="h-8 w-full text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shortName">Short Name (Jan YYYY)</SelectItem>
            <SelectItem value="numeric">Numeric (01.2020)</SelectItem>
            <SelectItem value="long">Long (January 2020)</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <div className="space-y-1.5">
        <FieldLabel>Header Alignment</FieldLabel>
        <ToggleGroup
          aria-label="Header alignment"
          variant="outline"
          size="sm"
          spacing={0}
          value={[style.headerAlign]}
          onValueChange={(vals) => {
            const next = vals[0] as ResumeHAlign | undefined;
            if (next) onChange({ headerAlign: next });
          }}
          className="grid w-full grid-cols-3 gap-1.5"
        >
          <LayoutCard
            value="left"
            label="Left"
            preview={
              <div className="flex w-full flex-col gap-0.5">
                <span className="bg-primary/50 h-1.5 w-2/3 rounded-full" />
                <span className="bg-muted-foreground/25 h-1 w-full rounded-full" />
              </div>
            }
          />
          <LayoutCard
            value="center"
            label="Center"
            preview={
              <div className="flex w-full flex-col items-center gap-0.5">
                <span className="bg-primary/50 h-1.5 w-2/3 rounded-full" />
                <span className="bg-muted-foreground/25 h-1 w-full rounded-full" />
              </div>
            }
          />
          <LayoutCard
            value="right"
            label="Right"
            preview={
              <div className="flex w-full flex-col items-end gap-0.5">
                <span className="bg-primary/50 h-1.5 w-2/3 rounded-full" />
                <span className="bg-muted-foreground/25 h-1 w-full rounded-full" />
              </div>
            }
          />
        </ToggleGroup>
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Date Alignment</FieldLabel>
        <ToggleGroup
          aria-label="Date alignment"
          variant="outline"
          size="sm"
          spacing={0}
          value={[style.dateAlign]}
          onValueChange={(vals) => {
            const next = vals[0] as ResumeSideAlign | undefined;
            if (next) onChange({ dateAlign: next });
          }}
          className="grid w-full grid-cols-2 gap-1.5"
        >
          <LayoutCard
            value="left"
            label="Left"
            preview={
              <div className="flex w-full items-center gap-1">
                <Bars />
                <span className="text-muted-foreground shrink-0 text-[8px] tabular-nums">
                  01.2020
                </span>
              </div>
            }
          />
          <LayoutCard
            value="right"
            label="Right"
            preview={
              <div className="flex w-full items-center gap-1">
                <Bars />
                <span className="text-muted-foreground ml-auto shrink-0 text-[8px] tabular-nums">
                  01.2020
                </span>
              </div>
            }
          />
        </ToggleGroup>
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Location Alignment</FieldLabel>
        <ToggleGroup
          aria-label="Location alignment"
          variant="outline"
          size="sm"
          spacing={0}
          value={[style.locationAlign]}
          onValueChange={(vals) => {
            const next = vals[0] as ResumeSideAlign | undefined;
            if (next) onChange({ locationAlign: next });
          }}
          className="grid w-full grid-cols-2 gap-1.5"
        >
          <LayoutCard
            value="left"
            label="Left"
            preview={
              <div className="flex w-full items-center gap-1">
                <Bars n={1} />
                <span className="text-muted-foreground shrink-0 text-[8px]">Location</span>
              </div>
            }
          />
          <LayoutCard
            value="right"
            label="Right"
            preview={
              <div className="flex w-full items-center gap-1">
                <Bars n={1} />
                <span className="text-muted-foreground ml-auto shrink-0 text-[8px]">Location</span>
              </div>
            }
          />
        </ToggleGroup>
      </div>

      <label className="block space-y-1">
        <FieldLabel>Section rule</FieldLabel>
        <Select
          value={style.rule}
          onValueChange={(v) =>
            onChange({
              rule: v === "light" || v === "none" || v === "strong" ? v : "strong",
            })
          }
        >
          <SelectTrigger className="h-8 w-full text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strong">Strong underline</SelectItem>
            <SelectItem value="light">Light underline</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>
  );
}

export function SkillsLayoutControls({
  style,
  onChange,
}: {
  style: ResumeCreatorStyle;
  onChange: (partial: Partial<ResumeCreatorStyle>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <FieldLabel>Skills layout</FieldLabel>
        <ToggleGroup
          aria-label="Skills layout"
          variant="outline"
          size="sm"
          spacing={0}
          value={[style.skillsLayout]}
          onValueChange={(vals) => {
            const next = vals[0] as ResumeSkillsLayout | undefined;
            if (next) onChange({ skillsLayout: next });
          }}
          className="grid w-full grid-cols-2 gap-1.5"
        >
          <LayoutCard
            value="inline"
            label="In line"
            preview={
              <span className="text-muted-foreground text-[9px]">skill · skill · skill</span>
            }
          />
          <LayoutCard
            value="columns"
            label="Columns"
            preview={
              <div className="grid w-full grid-cols-3 gap-1">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="bg-primary/40 h-1 rounded-full" />
                ))}
              </div>
            }
          />
        </ToggleGroup>
        {style.skillsLayout === "columns" ? (
          <div className="flex items-center justify-between gap-2 pt-1">
            <FieldLabel>Columns</FieldLabel>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="border-border hover:bg-muted size-7 rounded-md border text-[13px]"
                aria-label="Fewer columns"
                onClick={() => onChange({ skillsColumns: Math.max(2, style.skillsColumns - 1) })}
              >
                −
              </button>
              <span className="text-foreground w-6 text-center text-[12px] tabular-nums">
                {style.skillsColumns}
              </span>
              <button
                type="button"
                className="border-border hover:bg-muted size-7 rounded-md border text-[13px]"
                aria-label="More columns"
                onClick={() => onChange({ skillsColumns: Math.min(6, style.skillsColumns + 1) })}
              >
                +
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Categorized skills</FieldLabel>
        <ToggleGroup
          aria-label="Categorized skills"
          variant="outline"
          size="sm"
          spacing={0}
          value={[style.skillsCategoryMode]}
          onValueChange={(vals) => {
            const next = vals[0] as ResumeSkillsCategoryMode | undefined;
            if (next) onChange({ skillsCategoryMode: next });
          }}
          className="grid w-full grid-cols-2 gap-1.5"
        >
          <LayoutCard
            value="inline"
            label="In line"
            preview={<span className="text-muted-foreground text-[9px]">Cat: a, b · Cat: c</span>}
          />
          <LayoutCard
            value="categories"
            label="Categories"
            preview={
              <div className="flex w-full gap-1">
                <div className="flex w-1/3 flex-col gap-0.5">
                  <span className="bg-primary/40 h-1 rounded-full" />
                  <span className="bg-primary/40 h-1 rounded-full" />
                </div>
                <div className="bg-muted-foreground/20 flex-1 rounded-sm" />
              </div>
            }
          />
        </ToggleGroup>
        {style.skillsCategoryMode === "categories" ? (
          <SizeRow
            label="Category column width"
            value={style.skillsCategoryWidthPt}
            min={40}
            max={200}
            step={1}
            unit="pt"
            onChange={(n) => onChange({ skillsCategoryWidthPt: n })}
          />
        ) : null}
      </div>
      <p className="text-muted-foreground text-[10px] leading-snug">
        Tip: for categories, write skills as{" "}
        <span className="text-foreground">Languages: TypeScript, Go</span> on separate lines.
      </p>
    </div>
  );
}

export function EducationLayoutControls({
  style,
  onChange,
}: {
  style: ResumeCreatorStyle;
  onChange: (partial: Partial<ResumeCreatorStyle>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <FieldLabel>Show education by</FieldLabel>
        <ToggleGroup
          aria-label="Show education by"
          variant="outline"
          size="sm"
          spacing={0}
          value={[style.educationShowBy]}
          onValueChange={(vals) => {
            const next = vals[0] as ResumeEducationShowBy | undefined;
            if (next) onChange({ educationShowBy: next });
          }}
          className="grid w-full grid-cols-2 gap-1.5"
        >
          <LayoutCard
            value="institution"
            label="Institution"
            preview={
              <div className="flex w-full flex-col gap-0.5">
                <span className="bg-primary/50 h-1.5 w-3/4 rounded-full" />
                <span className="bg-muted-foreground/25 h-1 w-1/2 rounded-full" />
              </div>
            }
          />
          <LayoutCard
            value="degree"
            label="Degree"
            preview={
              <div className="flex w-full flex-col gap-0.5">
                <span className="bg-primary/50 h-1.5 w-1/2 rounded-full" />
                <span className="bg-muted-foreground/25 h-1 w-3/4 rounded-full" />
              </div>
            }
          />
        </ToggleGroup>
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Education layout</FieldLabel>
        <ToggleGroup
          aria-label="Education layout"
          variant="outline"
          size="sm"
          spacing={0}
          value={[style.educationLayout]}
          onValueChange={(vals) => {
            const next = vals[0] as ResumeEducationLayout | undefined;
            if (next) onChange({ educationLayout: next });
          }}
          className="grid w-full grid-cols-2 gap-1.5"
        >
          <LayoutCard
            value="stacked"
            label="Stacked"
            preview={
              <div className="flex w-full flex-col gap-1">
                <Bars n={2} />
                <Bars n={2} />
              </div>
            }
          />
          <LayoutCard
            value="inline"
            label="Inline"
            preview={
              <div className="grid w-full grid-cols-2 gap-1">
                <Bars n={2} />
                <Bars n={2} />
              </div>
            }
          />
        </ToggleGroup>
      </div>
    </div>
  );
}

/**
 * Styling accordion body: nested Text + Layout (global).
 * Skills/education options live in section editors via the scoped exports.
 */
export function ResumeCreatorStylePanel({ style, onChange, scope = "all", className }: Props) {
  if (scope === "skills") {
    return (
      <div className={className}>
        <SkillsLayoutControls style={style} onChange={onChange} />
      </div>
    );
  }
  if (scope === "education") {
    return (
      <div className={className}>
        <EducationLayoutControls style={style} onChange={onChange} />
      </div>
    );
  }

  return (
    <Accordion
      type="multiple"
      defaultValue={["text", "layout"]}
      className={cn("border-y-0", className)}
    >
      <AccordionItem value="text">
        <AccordionTrigger className="py-2 text-[12px] font-semibold">Text</AccordionTrigger>
        <AccordionContent className="pb-3">
          <TextAccordion style={style} onChange={onChange} />
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="layout">
        <AccordionTrigger className="py-2 text-[12px] font-semibold">Layout</AccordionTrigger>
        <AccordionContent className="pb-3">
          <LayoutGlobal style={style} onChange={onChange} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
