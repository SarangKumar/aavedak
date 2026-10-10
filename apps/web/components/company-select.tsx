"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/search-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type CompanyOption = { id: string; name: string };

type CompanySelectProps = {
  value: string;
  onChange: (name: string, companyId?: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function CompanySelect({
  value,
  onChange,
  placeholder = "e.g. Stripe",
  disabled,
  className,
  id,
}: CompanySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fetchCompanies = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { companies?: CompanyOption[] };
      setOptions(data.companies ?? []);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void fetchCompanies(query), 180);
    return () => window.clearTimeout(t);
  }, [open, query, fetchCompanies]);

  const exact = useMemo(() => {
    const key = query.trim().toLowerCase();
    return options.find((o) => o.name.toLowerCase() === key);
  }, [options, query]);

  async function createAndSelect() {
    const name = query.trim();
    if (!name) return;
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { company?: CompanyOption; error?: string };
    if (!res.ok || !data.company) return;
    onChange(data.company.name, data.company.id);
    setQuery(data.company.name);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <SearchInput
        id={id}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          void fetchCompanies(query);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(e.target.value, null);
        }}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="company-select-listbox"
        aria-autocomplete="list"
      />
      {open ? (
        <ScrollArea
          id="company-select-listbox"
          role="listbox"
          className="border-border bg-popover absolute z-50 mt-1 max-h-56 w-full rounded-md border shadow-md"
        >
          {loading ? <p className="text-muted-foreground px-3 py-2 text-[12px]">Loading…</p> : null}
          {options.map((opt) => (
            <Button
              key={opt.id}
              variant="ghost"
              className="h-auto min-h-9 w-full justify-start rounded-none py-2 text-left text-[13px] font-normal"
              onClick={() => {
                onChange(opt.name, opt.id);
                setQuery(opt.name);
                setOpen(false);
              }}
            >
              {opt.name}
            </Button>
          ))}
          {query.trim() && !exact ? (
            <Button
              variant="ghost"
              className="border-border text-primary h-auto min-h-9 w-full justify-start rounded-none border-t py-2 text-left text-[12px]"
              onClick={() => void createAndSelect()}
            >
              Add “{query.trim()}”
            </Button>
          ) : null}
          {!loading && options.length === 0 && !query.trim() ? (
            <p className="text-muted-foreground px-3 py-2 text-[12px]">Type to search companies</p>
          ) : null}
        </ScrollArea>
      ) : null}
    </div>
  );
}
