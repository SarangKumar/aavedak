"use client";

import { Info } from "lucide-react";

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
import {
  RESUME_CREATOR_FONTS,
  RESUME_FONT_WEIGHTS,
  type ResumeCreatorFontId,
  type ResumeCreatorStyle,
  type ResumeFontWeight,
} from "@/lib/resume-creator-types";
import { cn } from "@/lib/utils";

type Props = {
  style: ResumeCreatorStyle;
  onChange: (partial: Partial<ResumeCreatorStyle>) => void;
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

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ResumeCreatorFontId;
  onChange: (v: ResumeCreatorFontId) => void;
}) {
  return (
    <label className="block min-w-0 space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v as ResumeCreatorFontId)}>
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
  );
}

function WeightSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ResumeFontWeight;
  onChange: (v: ResumeFontWeight) => void;
}) {
  return (
    <label className="block min-w-0 space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v as ResumeFontWeight)}>
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
  );
}

/** Slider + numeric box (pt or %). */
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

/**
 * Text styling panel (reference layout): primary/secondary fonts, line-height %,
 * FONT SIZE sliders with pt boxes, FONT WEIGHT banner + selects.
 * Format / Layout sits above Text (margins, gaps, rule).
 */
export function ResumeCreatorStylePanel({ style, onChange, className }: Props) {
  const lineHeightPct = Math.round(style.lineHeight * 100);

  return (
    <div className={cn("space-y-4", className)}>
      <section className="space-y-2.5">
        <SectionLabel>Format / Layout</SectionLabel>
        <SizeRow
          label="Horizontal margin"
          value={style.marginXPt}
          min={24}
          max={72}
          step={1}
          unit="pt"
          onChange={(n) => onChange({ marginXPt: n })}
        />
        <SizeRow
          label="Vertical margin"
          value={style.marginYPt}
          min={24}
          max={72}
          step={1}
          unit="pt"
          onChange={(n) => onChange({ marginYPt: n })}
        />
        <SizeRow
          label="Section gap"
          value={style.sectionGapPt}
          min={0}
          max={36}
          step={0.5}
          unit="pt"
          onChange={(n) => onChange({ sectionGapPt: n })}
        />
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
      </section>

      <section className="space-y-2.5">
        <SectionLabel>Text</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <FontSelect
            label="Primary font"
            value={style.primaryFont}
            onChange={(primaryFont) => onChange({ primaryFont })}
          />
          <FontSelect
            label="Secondary font"
            value={style.secondaryFont}
            onChange={(secondaryFont) => onChange({ secondaryFont })}
          />
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
          <SizeRow
            label="Primary heading"
            value={style.headerPt}
            min={12}
            max={28}
            step={0.5}
            unit="pt"
            onChange={(n) => onChange({ headerPt: n })}
          />
          <SizeRow
            label="Secondary heading"
            value={style.footerPt}
            min={6}
            max={14}
            step={0.5}
            unit="pt"
            onChange={(n) => onChange({ footerPt: n })}
          />
          <SizeRow
            label="Body"
            value={style.bodyPt}
            min={7}
            max={14}
            step={0.5}
            unit="pt"
            onChange={(n) => onChange({ bodyPt: n })}
          />
          <SizeRow
            label="Section titles"
            value={style.sectionTitlePt}
            min={8}
            max={18}
            step={0.5}
            unit="pt"
            onChange={(n) => onChange({ sectionTitlePt: n })}
          />
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
            <WeightSelect
              label="Primary heading"
              value={style.headerWeight}
              onChange={(headerWeight) => onChange({ headerWeight })}
            />
            <WeightSelect
              label="Secondary heading"
              value={style.secondaryHeadingWeight}
              onChange={(secondaryHeadingWeight) => onChange({ secondaryHeadingWeight })}
            />
            <WeightSelect
              label="Body"
              value={style.bodyWeight}
              onChange={(bodyWeight) => onChange({ bodyWeight })}
            />
            <WeightSelect
              label="Section titles"
              value={style.sectionTitleWeight}
              onChange={(sectionTitleWeight) => onChange({ sectionTitleWeight })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
