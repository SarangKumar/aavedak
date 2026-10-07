"use client";

import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Company = { id: string; name: string };

export function CompanySelect({
  value,
  onChange,
  placeholder = "Search or create a company",
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/companies")
      .then((res) => (res.ok ? res.json() : { companies: [] }))
      .then((data: { companies?: Company[] }) => {
        if (!cancelled) setCompanies(data.companies ?? []);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(name: string) {
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { company?: Company; error?: string };
    if (!res.ok || !data.company) throw new Error(data.error || "Could not create company.");
    setCompanies((list) => {
      if (list.some((item) => item.id === data.company!.id)) return list;
      return [...list, data.company!].sort((a, b) => a.name.localeCompare(b.name));
    });
    onChange(data.company.name);
  }

  const names = new Set(companies.map((company) => company.name));
  const options =
    value && !names.has(value) ? [{ id: "current", name: value }, ...companies] : companies;

  return (
    <div className="space-y-1">
      <span className="text-foreground text-[12px] font-medium">Company *</span>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="border-border bg-background text-foreground h-9 w-full rounded-lg border px-3 text-[13px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          searchable
          searchPlaceholder="Search companies…"
          onCreate={(name) => void create(name)}
          className="z-[280]"
        >
          {options.length === 0 ? (
            <SelectItem value="__empty" disabled>
              Type a name to create one
            </SelectItem>
          ) : (
            options.map((company) => (
              <SelectItem key={company.id} value={company.name}>
                {company.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
