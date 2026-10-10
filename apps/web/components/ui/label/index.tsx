import React from "react";

import { cn } from "@/lib/utils";

export type LabelProps = React.ComponentProps<"label">;

export function Label({ className, ref, ...props }: LabelProps) {
  return (
    <label
      ref={ref}
      className={cn("text-foreground text-sm font-medium leading-none", className)}
      {...props}
    />
  );
}
