/** Shared page / nav horizontal bounds. Wide ≈ 90rem; medium ≈ 2/3; narrow ≈ 1/3. */

export type ShellDensity = "wide" | "medium" | "narrow";

export const SHELL_DENSITY_KEY = "arambh-shell-density";

export const SHELL_MAX_CLASS: Record<ShellDensity, string> = {
  wide: "max-w-[90rem]",
  medium: "max-w-[60rem]",
  narrow: "max-w-[30rem]",
};

export const SHELL_PAD = "px-4 sm:px-6 lg:px-8";

/** Default SSR / first paint — wide (matches prior layout). */
export const SHELL_MAX = SHELL_MAX_CLASS.wide;
export const SHELL_X = `${SHELL_MAX} ${SHELL_PAD}`;

export function parseShellDensity(value: string | null | undefined): ShellDensity {
  if (value === "medium" || value === "narrow" || value === "wide") return value;
  return "wide";
}

export function shellXClass(density: ShellDensity): string {
  return `${SHELL_MAX_CLASS[density]} ${SHELL_PAD}`;
}
