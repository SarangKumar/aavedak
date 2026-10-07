import { SHELL_X } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** Applies the wide shell max-width + horizontal padding. */
export function ShellWidth({
  className,
  children,
  as: Comp = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "header" | "footer" | "section";
}) {
  return <Comp className={cn("mx-auto w-full", SHELL_X, className)}>{children}</Comp>;
}
