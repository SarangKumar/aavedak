"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { parseShellDensity, SHELL_DENSITY_KEY, shellXClass, type ShellDensity } from "@/lib/layout";

type ShellDensityContextValue = {
  density: ShellDensity;
  setDensity: (d: ShellDensity) => void;
  shellX: string;
};

const ShellDensityContext = createContext<ShellDensityContextValue | null>(null);

export function ShellDensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<ShellDensity>("wide");

  useEffect(() => {
    try {
      setDensityState(parseShellDensity(localStorage.getItem(SHELL_DENSITY_KEY)));
    } catch {
      /* ignore */
    }
  }, []);

  const setDensity = useCallback((d: ShellDensity) => {
    setDensityState(d);
    try {
      localStorage.setItem(SHELL_DENSITY_KEY, d);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ density, setDensity, shellX: shellXClass(density) }),
    [density, setDensity],
  );

  return <ShellDensityContext.Provider value={value}>{children}</ShellDensityContext.Provider>;
}

export function useShellDensity() {
  const ctx = useContext(ShellDensityContext);
  if (!ctx) {
    return {
      density: "wide" as ShellDensity,
      setDensity: (() => {}) as (d: ShellDensity) => void,
      shellX: shellXClass("wide"),
    };
  }
  return ctx;
}
