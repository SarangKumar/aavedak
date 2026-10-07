"use client";

import { useEffect, useState } from "react";

import { HeaderMenu } from "@/components/header-menu";
import { parseThemeMode, themeCookieString, THEME_KEY, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function persistTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = themeCookieString(mode);
  } catch {
    /* ignore */
  }
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const dark = resolveDark(mode);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = mode;
  persistTheme(mode);
}

function readStoredTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* ignore */
  }
  try {
    const match = document.cookie.match(/(?:^|; )avsar-theme=([^;]+)/);
    if (match) return parseThemeMode(decodeURIComponent(match[1]));
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
  const [ready, setReady] = useState(false);
  const [iconKey, setIconKey] = useState(0);

  useEffect(() => {
    const stored = readStoredTheme();
    setMode(stored);
    applyTheme(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [ready, mode]);

  function select(next: ThemeMode, close: () => void) {
    setMode(next);
    setIconKey((k) => k + 1);
    applyTheme(next);
    close();
  }

  return (
    <div className={cn("relative", className)}>
      <HeaderMenu
        label={`Theme: ${mode}. Change theme`}
        menuClassName="w-36"
        triggerClassName={(open) =>
          cn(
            "border-border/80 bg-card/60 text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg border transition-colors",
            open && "border-primary/40 text-foreground",
          )
        }
        trigger={
          <span key={iconKey} className="avsar-theme-icon inline-flex">
            <ModeIcon mode={ready ? mode : "system"} className="size-3.5" />
          </span>
        }
      >
        {({ close }) => (
          <>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={mode === opt.value}
                onClick={() => select(opt.value, close)}
                className={cn(
                  "hover:text-foreground flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  mode === opt.value ? "text-primary font-medium" : "text-muted-foreground",
                )}
              >
                <ModeIcon mode={opt.value} className="size-3.5 shrink-0" />
                {opt.label}
              </button>
            ))}
          </>
        )}
      </HeaderMenu>
    </div>
  );
}
