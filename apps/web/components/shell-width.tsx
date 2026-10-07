"use client";

import { useShellDensity } from "@/components/shell-density-provider";
import { cn } from "@/lib/utils";

/** Applies the active shell density max-width + horizontal padding. */
export function ShellWidth({
  className,
  children,
  as: Comp = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "header" | "footer" | "section";
}) {
  const { shellX } = useShellDensity();
  return <Comp className={cn("mx-auto w-full", shellX, className)}>{children}</Comp>;
}
