import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ResizeHandleProps = ComponentProps<"div"> & {
  /** Visual orientation of the gutter. */
  orientation?: "vertical" | "horizontal";
};

/** Visible drag gutter for resizable panes/columns. */
export function ResizeHandle({ className, orientation = "vertical", ...props }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "group z-10 flex touch-none select-none items-center justify-center",
        orientation === "vertical" && "w-3 cursor-col-resize",
        orientation === "horizontal" && "h-3 cursor-row-resize",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "bg-border/90 group-hover:bg-primary group-active:bg-primary rounded-full transition-colors",
          orientation === "vertical" && "h-9 w-1.5",
          orientation === "horizontal" && "h-1.5 w-9",
        )}
        aria-hidden
      />
    </div>
  );
}
