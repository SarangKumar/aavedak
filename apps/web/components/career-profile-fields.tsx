"use client";

import {
  COMPANY_SIZE_PREFERENCES,
  EXPERIENCE_LEVELS,
  JOB_SEARCH_STATUSES,
  REMOTE_PREFERENCES,
  SALARY_CURRENCIES,
  WORK_AUTHORIZATIONS,
  type CareerProfile,
} from "@/lib/career-profile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CareerFormState = {
  experienceLevel: string;
  preferredRoles: string;
  expectedSalaryMin: string;
  expectedSalaryMax: string;
  salaryCurrency: string;
  preferredLocations: string;
  remotePreference: string;
  workAuthorization: string;
  skills: string;
  jobSearchStatus: string;
  companySizePreference: string;
  industryPreference: string;
};

export function careerToFormState(career: CareerProfile): CareerFormState {
  return {
    experienceLevel: career.experienceLevel ?? "",
    preferredRoles: career.preferredRoles.join(", "),
    expectedSalaryMin: career.expectedSalaryMin != null ? String(career.expectedSalaryMin) : "",
    expectedSalaryMax: career.expectedSalaryMax != null ? String(career.expectedSalaryMax) : "",
    salaryCurrency: career.salaryCurrency || "INR",
    preferredLocations: career.preferredLocations.join(", "),
    remotePreference: career.remotePreference ?? "",
    workAuthorization: career.workAuthorization ?? "",
    skills: career.skills.join(", "),
    jobSearchStatus: career.jobSearchStatus ?? "",
    companySizePreference: career.companySizePreference ?? "",
    industryPreference: career.industryPreference ?? "",
  };
}

export function formStateToCareerPatch(state: CareerFormState) {
  const minRaw = state.expectedSalaryMin.trim();
  const maxRaw = state.expectedSalaryMax.trim();
  return {
    experienceLevel: (state.experienceLevel || null) as CareerProfile["experienceLevel"],
    preferredRoles: state.preferredRoles
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
    expectedSalaryMin: minRaw ? Number(minRaw.replace(/[,_\s]/g, "")) : null,
    expectedSalaryMax: maxRaw ? Number(maxRaw.replace(/[,_\s]/g, "")) : null,
    salaryCurrency: (state.salaryCurrency || "INR") as CareerProfile["salaryCurrency"],
    preferredLocations: state.preferredLocations
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
    remotePreference: (state.remotePreference || null) as CareerProfile["remotePreference"],
    workAuthorization: (state.workAuthorization || null) as CareerProfile["workAuthorization"],
    skills: state.skills
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
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
          <Select
            value={value.experienceLevel || undefined}
            onValueChange={(v) => set("experienceLevel", v ?? "")}
          >
            <SelectTrigger
              id={`${idPrefix}-years-of-experience`}
              className="border-border bg-background h-9 w-full rounded-lg border px-2.5 text-[13px]"
            >
              <SelectValue placeholder="Select experience" />
            </SelectTrigger>
            <SelectContent className="z-[240]">
              {EXPERIENCE_LEVELS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[13px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-job-search-status`}>Job search status *</Label>
          <Select
            value={value.jobSearchStatus || undefined}
            onValueChange={(v) => set("jobSearchStatus", v ?? "")}
          >
            <SelectTrigger
              id={`${idPrefix}-job-search-status`}
              className="border-border bg-background h-9 w-full rounded-lg border px-2.5 text-[13px]"
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
        <Input
          id={`${idPrefix}-roles`}
          value={value.preferredRoles}
          onChange={(e) => set("preferredRoles", e.target.value)}
          placeholder="Software Engineer, Full-Stack Engineer"
          className="h-9 rounded-lg text-[13px]"
        />
        <p className={hintClass}>Comma-separated. Used for job matching next.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-skills`}>Skills / tech stack *</Label>
        <Input
          id={`${idPrefix}-skills`}
          value={value.skills}
          onChange={(e) => set("skills", e.target.value)}
          placeholder="e.g. Python, SQL, PySpark, Airflow, Kafka"
          className="h-9 rounded-lg text-[13px]"
        />
        <p className={hintClass}>
          Enter skills as a comma-separated list (e.g. TypeScript, React, PostgreSQL). Used for job
          matching.
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
              className="border-border bg-background h-9 w-full rounded-lg border px-2.5 text-[13px]"
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
              className="border-border bg-background h-9 w-full rounded-lg border px-2.5 text-[13px]"
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
        <Input
          id={`${idPrefix}-locations`}
          value={value.preferredLocations}
          onChange={(e) => set("preferredLocations", e.target.value)}
          placeholder="Bengaluru, Remote, Hyderabad"
          className="h-9 rounded-lg text-[13px]"
        />
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
              className="border-border bg-background h-9 w-full rounded-lg border px-2.5 text-[13px]"
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
              className="border-border bg-background h-9 w-full rounded-lg border px-2.5 text-[13px]"
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
