import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ResizeHandleProps = ComponentProps<"div"> & {
  /** Visual orientation of the gutter. */
  orientation?: "vertical" | "horizontal";
  /** Show the three-dot grip on the gutter. */
  withHandle?: boolean;
};

/**
 * Panel resize gutter: no border line and no grip box — just three dots in the gap between
 * panels (local divergence from the Vinyaas pattern; see components/ui/.vinyaas). The gutter
 * stays 12px wide so it is easy to grab.
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
        "group relative z-10 flex touch-none select-none items-center justify-center",
        orientation === "vertical" && "w-3 cursor-col-resize",
        orientation === "horizontal" && "h-3 cursor-row-resize",
        className,
      )}
      {...props}
    >
      {withHandle ? <GripDots orientation={orientation} /> : null}
    </div>
  );
}

function GripDots({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return (
    <svg
      viewBox="0 0 4 16"
      className={cn(
        "text-muted-foreground/60 group-hover:text-foreground h-4 w-1 transition-colors",
        orientation === "horizontal" && "rotate-90",
      )}
      fill="currentColor"
      aria-hidden
    >
      <circle cx="2" cy="2.5" r="1.4" />
      <circle cx="2" cy="8" r="1.4" />
      <circle cx="2" cy="13.5" r="1.4" />
    </svg>
  );
}
