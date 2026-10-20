"use client";

import {
  COMPANY_SIZE_PREFERENCES,
  MAX_PREFERRED_LOCATIONS,
  MAX_PREFERRED_ROLES,
  MAX_SKILLS,
  MAX_YEARS_EXPERIENCE,
  JOB_SEARCH_STATUSES,
  REMOTE_PREFERENCES,
  SALARY_CURRENCIES,
  WORK_AUTHORIZATIONS,
  type CareerProfile,
} from "@/lib/career-profile";
import { Input } from "@/components/ui/input";
import { MultiInput, type MultiInputOption } from "@/components/ui/multi-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IMPROVE_GUIDED_ROLES } from "@/lib/improve-roles";
import { CANONICAL_LOCATIONS, locationKeywords } from "@/lib/locations";
import { cn } from "@/lib/utils";

export type CareerFormState = {
  yearsExperience: string;
  /** One entry per chip; the server caps these at MAX_PREFERRED_ROLES. */
  preferredRoles: string[];
  expectedSalaryMin: string;
  expectedSalaryMax: string;
  salaryCurrency: string;
  /** Canonical values from lib/locations ("Bengaluru, India", "Remote"). */
  preferredLocations: string[];
  remotePreference: string;
  workAuthorization: string;
  skills: string[];
  jobSearchStatus: string;
  companySizePreference: string;
  industryPreference: string;
};

export function careerToFormState(career: CareerProfile): CareerFormState {
  return {
    yearsExperience: career.yearsExperience != null ? String(career.yearsExperience) : "",
    preferredRoles: [...career.preferredRoles],
    expectedSalaryMin: career.expectedSalaryMin != null ? String(career.expectedSalaryMin) : "",
    expectedSalaryMax: career.expectedSalaryMax != null ? String(career.expectedSalaryMax) : "",
    salaryCurrency: career.salaryCurrency || "INR",
    preferredLocations: [...career.preferredLocations],
    remotePreference: career.remotePreference ?? "",
    workAuthorization: career.workAuthorization ?? "",
    skills: [...career.skills],
    jobSearchStatus: career.jobSearchStatus ?? "",
    companySizePreference: career.companySizePreference ?? "",
    industryPreference: career.industryPreference ?? "",
  };
}

export function formStateToCareerPatch(state: CareerFormState) {
  const minRaw = state.expectedSalaryMin.trim();
  const maxRaw = state.expectedSalaryMax.trim();
  return {
    yearsExperience: state.yearsExperience.trim() === "" ? null : Number(state.yearsExperience),
    preferredRoles: state.preferredRoles.map((s) => s.trim()).filter(Boolean),
    expectedSalaryMin: minRaw ? Number(minRaw.replace(/[,_\s]/g, "")) : null,
    expectedSalaryMax: maxRaw ? Number(maxRaw.replace(/[,_\s]/g, "")) : null,
    salaryCurrency: (state.salaryCurrency || "INR") as CareerProfile["salaryCurrency"],
    preferredLocations: state.preferredLocations,
    remotePreference: (state.remotePreference || null) as CareerProfile["remotePreference"],
    workAuthorization: (state.workAuthorization || null) as CareerProfile["workAuthorization"],
    skills: state.skills.map((s) => s.trim()).filter(Boolean),
    jobSearchStatus: (state.jobSearchStatus || null) as CareerProfile["jobSearchStatus"],
    companySizePreference: (state.companySizePreference ||
      null) as CareerProfile["companySizePreference"],
    industryPreference: state.industryPreference.trim() || null,
  };
}

type Props = {
  value: CareerFormState;
  onChange: (next: CareerFormState) => void;
  /** Slightly denser for profile settings. */
  compact?: boolean;
  idPrefix?: string;
};

const hintClass = "text-muted-foreground text-[11px] leading-relaxed";

/** Cities (plus Remote) with their aliases, so "Bangalore" finds "Bengaluru, India". */
const LOCATION_OPTIONS: MultiInputOption[] = CANONICAL_LOCATIONS.map((loc) => ({
  value: loc,
  keywords: locationKeywords(loc),
}));

export function CareerProfileFields({ value, onChange, compact, idPrefix = "career" }: Props) {
  function set<K extends keyof CareerFormState>(key: K, v: CareerFormState[K]) {
    onChange({ ...value, [key]: v });
  }

  const grid = cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2");

  return (
    <div className={cn("space-y-3", compact ? "" : "space-y-3.5")}>
      <div className={grid}>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-years-of-experience`}>Years of experience *</Label>
          <Input
            id={`${idPrefix}-years-of-experience`}
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_YEARS_EXPERIENCE}
            step={0.5}
            required
            value={value.yearsExperience}
            onChange={(e) => set("yearsExperience", e.target.value)}
            placeholder="e.g. 1.5"
            className="h-9 text-[13px]"
          />
          <p className={hintClass}>
            Total professional experience, 0–{MAX_YEARS_EXPERIENCE}. Used for ATS scoring and job
            matching.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-job-search-status`}>Job search status *</Label>
          <Select
            value={value.jobSearchStatus || undefined}
            onValueChange={(v) => set("jobSearchStatus", v ?? "")}
          >
            <SelectTrigger
              id={`${idPrefix}-job-search-status`}
              className="h-9 w-full rounded-lg border px-2.5 text-[13px]"
            >
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="z-[240]">
              {JOB_SEARCH_STATUSES.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-roles`}>Preferred roles / titles *</Label>
        {/* Chips: type a role and press Enter, or pick one of the roles Aavedak tailors for. */}
        <MultiInput
          id={`${idPrefix}-roles`}
          value={value.preferredRoles}
          onValueChange={(next) => set("preferredRoles", next)}
          options={IMPROVE_GUIDED_ROLES}
          max={MAX_PREFERRED_ROLES}
          placeholder={
            value.preferredRoles.length === 0 ? "Software Engineer, Data Engineer…" : "Add a role"
          }
          className="rounded-lg text-[13px]"
        />
        <p className={hintClass}>
          Press Enter or type a comma after each role, up to {MAX_PREFERRED_ROLES}. Used for job
          matching next.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-skills`}>Skills / tech stack *</Label>
        <MultiInput
          id={`${idPrefix}-skills`}
          value={value.skills}
          onValueChange={(next) => set("skills", next)}
          max={MAX_SKILLS}
          placeholder={value.skills.length === 0 ? "Python, SQL, PySpark, Airflow…" : "Add a skill"}
          className="rounded-lg text-[13px]"
        />
        <p className={hintClass}>
          One skill per chip — press Enter or type a comma after each, up to {MAX_SKILLS}. Used for
          job matching.
        </p>
      </div>

      <div className={grid}>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-currency`}>Currency *</Label>
          <Select
            value={value.salaryCurrency || "INR"}
            onValueChange={(v) => set("salaryCurrency", v ?? "INR")}
          >
            <SelectTrigger
              id={`${idPrefix}-currency`}
              className="h-9 w-full rounded-lg border px-2.5 text-[13px]"
            >
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent className="z-[240]">
              {SALARY_CURRENCIES.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-remote-preference`}>Remote preference *</Label>
          <Select
            value={value.remotePreference || undefined}
            onValueChange={(v) => set("remotePreference", v ?? "")}
          >
            <SelectTrigger
              id={`${idPrefix}-remote-preference`}
              className="h-9 w-full rounded-lg border px-2.5 text-[13px]"
            >
              <SelectValue placeholder="Remote / hybrid / on-site" />
            </SelectTrigger>
            <SelectContent className="z-[240]">
              {REMOTE_PREFERENCES.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={grid}>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-sal-min`}>Expected package min *</Label>
          <Input
            id={`${idPrefix}-sal-min`}
            inputMode="numeric"
            value={value.expectedSalaryMin}
            onChange={(e) => set("expectedSalaryMin", e.target.value)}
            placeholder={value.salaryCurrency === "USD" ? "120000" : "1800000"}
            className="h-9 rounded-lg text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-sal-max`}>Expected package max</Label>
          <Input
            id={`${idPrefix}-sal-max`}
            inputMode="numeric"
            value={value.expectedSalaryMax}
            onChange={(e) => set("expectedSalaryMax", e.target.value)}
            placeholder={value.salaryCurrency === "USD" ? "180000" : "2500000"}
            className="h-9 rounded-lg text-[13px]"
          />
        </div>
      </div>
      <p className={hintClass}>
        Enter at least a minimum (CTC / year). Defaults to INR for India-friendly matching.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-locations`}>Preferred locations</Label>
        {/* Canonical values only (the server drops anything else), with alias search:
            typing "Bangalore" finds "Bengaluru, India". */}
        <MultiInput
          id={`${idPrefix}-locations`}
          value={value.preferredLocations}
          onValueChange={(next) => set("preferredLocations", next)}
          options={LOCATION_OPTIONS}
          allowCustomValues={false}
          max={MAX_PREFERRED_LOCATIONS}
          emptyMessage="No matching location."
          placeholder={
            value.preferredLocations.length === 0 ? "Add a city or Remote" : "Add another location"
          }
          className="rounded-lg text-[13px]"
        />
        <p className={hintClass}>
          Pick from the list — up to {MAX_PREFERRED_LOCATIONS} cities, or Remote.
        </p>
      </div>

      <div className={grid}>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-work-authorization`}>Work authorization</Label>
          <Select
            value={value.workAuthorization || undefined}
            onValueChange={(v) => set("workAuthorization", v ?? "")}
          >
            <SelectTrigger
              id={`${idPrefix}-work-authorization`}
              className="h-9 w-full rounded-lg border px-2.5 text-[13px]"
            >
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent className="z-[240]">
              {WORK_AUTHORIZATIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-company-size-preference`}>Company size preference</Label>
          <Select
            value={value.companySizePreference || undefined}
            onValueChange={(v) => set("companySizePreference", v ?? "")}
          >
            <SelectTrigger
              id={`${idPrefix}-company-size-preference`}
              className="h-9 w-full rounded-lg border px-2.5 text-[13px]"
            >
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent className="z-[240]">
              {COMPANY_SIZE_PREFERENCES.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-industry`}>Industry preference</Label>
        <Input
          id={`${idPrefix}-industry`}
          value={value.industryPreference}
          onChange={(e) => set("industryPreference", e.target.value)}
          placeholder="Developer tools, Fintech, AI infrastructure"
          className="h-9 rounded-lg text-[13px]"
          maxLength={120}
        />
      </div>
    </div>
  );
}
