import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ResizeHandleProps = ComponentProps<"div"> & {
  /** Visual orientation of the gutter. */
  orientation?: "vertical" | "horizontal";
  /** Show the default Vinyaas grip chip (dots) on the separator. */
  withHandle?: boolean;
};

/**
 * Default Vinyaas-style panel resize gutter: 1px border line + optional grip.
 * Matches the registry ResizableHandle pattern (thin separator, small grip chip).
 */
export function ResizeHandle({
  className,
  orientation = "vertical",
  withHandle = true,
  ...props
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      data-slot="resize-handle"
      className={cn(
        "bg-border relative z-10 flex touch-none select-none items-center justify-center",
        orientation === "vertical" &&
          "w-px cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        orientation === "horizontal" &&
          "h-px cursor-row-resize after:absolute after:inset-x-0 after:top-1/2 after:h-1 after:-translate-y-1/2",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div
          className={cn(
            "border-border bg-border z-10 flex items-center justify-center rounded-sm border",
            orientation === "vertical" && "h-4 w-3",
            orientation === "horizontal" && "h-3 w-4",
          )}
          aria-hidden
        >
          <GripDots orientation={orientation} />
        </div>
      ) : null}
    </div>
  );
}

function GripDots({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return (
    <svg
      viewBox="0 0 10 16"
      className={cn("text-muted-foreground size-2.5", orientation === "horizontal" && "rotate-90")}
      fill="currentColor"
      aria-hidden
    >
      <circle cx="3" cy="3" r="1.1" />
      <circle cx="7" cy="3" r="1.1" />
      <circle cx="3" cy="8" r="1.1" />
      <circle cx="7" cy="8" r="1.1" />
      <circle cx="3" cy="13" r="1.1" />
      <circle cx="7" cy="13" r="1.1" />
    </svg>
  );
}
