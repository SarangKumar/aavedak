import { cn } from "@/lib/utils";

export type SpinnerProps = {
  className?: string;
  /** Accessible label when spinner is the sole content of a control. */
  label?: string;
};

/** Compact Vinyaas-style spinner for buttons and inline pending states. */
export function Spinner({ className, label }: SpinnerProps) {
  return (
    <svg
      className={cn("size-3.5 shrink-0 animate-spin motion-reduce:animate-none", className)}
      viewBox="0 0 16 16"
      fill="none"
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
