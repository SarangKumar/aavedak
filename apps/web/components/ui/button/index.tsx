import React from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Default height is h-9 and matches Input. xs is h-7, sm is h-8, lg is h-10.
// Compact sizes (xs/sm) use text-xs; default/lg use text-sm.
// Every non-link variant shares the same height for a given size — borders
// stay inside the box (box-border) so outline and solid buttons align.
export const buttonVariants = cva(
  "inline-flex box-border shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent leading-none font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1.25,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px active:duration-75 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        link: "h-auto min-h-0 border-transparent bg-transparent px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 min-h-9 max-h-9 px-4 text-sm",
        xs: "h-7 min-h-7 max-h-7 px-2 text-xs",
        sm: "h-8 min-h-8 max-h-8 px-3 text-xs",
        lg: "h-10 min-h-10 max-h-10 px-6 text-sm",
        icon: "size-9 min-h-9 min-w-9 max-h-9 max-w-9 p-0 text-sm",
        "icon-xs": "size-7 min-h-7 min-w-7 max-h-7 max-w-7 p-0 text-xs",
        "icon-sm": "size-8 min-h-8 min-w-8 max-h-8 max-w-8 p-0 text-xs",
        "icon-lg": "size-10 min-h-10 min-w-10 max-h-10 max-w-10 p-0 text-sm",
      },
    },
    compoundVariants: [
      {
        variant: "link",
        size: "default",
        class: "h-auto min-h-0 max-h-none px-0",
      },
      {
        variant: "link",
        size: "xs",
        class: "h-auto min-h-0 max-h-none px-0",
      },
      {
        variant: "link",
        size: "sm",
        class: "h-auto min-h-0 max-h-none px-0",
      },
      {
        variant: "link",
        size: "lg",
        class: "h-auto min-h-0 max-h-none px-0",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Shows a spinner overlay and forces disabled while true. Idle `children` stay mounted (invisible) so width does not shrink. */
  loading?: boolean;
  /** Label next to the spinner while loading. Pass empty string for spinner-only. Default: "Saving…" */
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    children,
    variant,
    size,
    loading = false,
    loadingText = "Saving…",
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(buttonVariants({ variant, size }), "relative", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span
        className={cn("inline-flex items-center justify-center gap-1.5", loading && "invisible")}
      >
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 inline-flex items-center justify-center gap-1.5">
          <Spinner className="size-3.5" label="" />
          {loadingText ? <span>{loadingText}</span> : null}
        </span>
      ) : null}
    </button>
  );
});
Button.displayName = "Button";
