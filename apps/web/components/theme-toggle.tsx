"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "avsar-theme";

function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolveDark(mode));
  root.style.colorScheme = resolveDark(mode) ? "dark" : "light";
  root.dataset.theme = mode;
}

export function readStoredTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* ignore */
  }
  return "system";
}

const options: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.05 5.05l1.56 1.56M17.39 17.39l1.56 1.56M18.95 5.05l-1.56 1.56M6.61 17.39l-1.56 1.56"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18.5 14.2A7.5 7.5 0 0 1 9.8 5.5 6.5 6.5 0 1 0 18.5 14.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SystemIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="4.5"
        width="17"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M8 19.5h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ModeIcon({ mode, className }: { mode: ThemeMode; className?: string }) {
  if (mode === "light") return <SunIcon className={className} />;
  if (mode === "dark") return <MoonIcon className={className} />;
  return <SystemIcon className={className} />;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [iconKey, setIconKey] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readStoredTheme();
    setMode(stored);
    applyTheme(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mounted, mode]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(next: ThemeMode) {
    setMode(next);
    setIconKey((k) => k + 1);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyTheme(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={`Theme: ${mode}. Change theme`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "border-border/80 bg-card/60 text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg border transition-colors",
          open && "text-foreground border-primary/40",
        )}
      >
        <span key={iconKey} className="avsar-theme-icon inline-flex">
          <ModeIcon mode={mounted ? mode : "system"} className="size-3.5" />
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="border-border bg-popover text-popover-foreground absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-xl border shadow-lg shadow-black/20"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === opt.value}
              onClick={() => select(opt.value)}
              className={cn(
                "hover:text-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                mode === opt.value ? "text-primary font-medium" : "text-muted-foreground",
              )}
            >
              <ModeIcon mode={opt.value} className="size-3.5 shrink-0" />
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
